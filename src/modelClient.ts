import {
  AutoModelForImageTextToText,
  AutoProcessor,
  RawImage,
  env,
  pipeline,
} from '@huggingface/transformers';
import type {
  GenerationProgressUpdate,
  GenerationTraceStep,
  ImageQuestionInput,
  ImageQuestionResult,
  RuntimeAvailability,
  RuntimeBackend,
} from './types';
import type {
  Chat,
  TextGenerationPipeline,
  TextGenerationOutput,
} from '@huggingface/transformers';

const VISION_MODEL_ID = 'HuggingFaceTB/SmolVLM-256M-Instruct';
const REWRITE_MODEL_ID = 'HuggingFaceTB/SmolLM2-360M-Instruct';
const ALT_TEXT_CHARACTER_LIMIT = 125;
const MAX_REWRITE_LOOPS = 10;

type ExecutionBackend = 'webgpu' | 'wasm';

let visionProcessor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>> | null = null;
let visionModel: Awaited<ReturnType<typeof AutoModelForImageTextToText.from_pretrained>> | null = null;
let visionLoadPromise: Promise<void> | null = null;
let rewritePipeline: TextGenerationPipeline | null = null;
let rewriteLoadPromise: Promise<void> | null = null;
let backendPromise: Promise<ExecutionBackend> | null = null;
let activeBackend: RuntimeBackend = 'unknown';

type NavigatorWithGpu = Navigator & {
  gpu: {
    requestAdapter(options?: {
      powerPreference?: 'low-power' | 'high-performance';
      forceFallbackAdapter?: boolean;
    }): Promise<unknown>;
  };
};

function isExecutionBackend(backend: RuntimeBackend): backend is ExecutionBackend {
  return backend === 'webgpu' || backend === 'wasm';
}

function hasWebGpu(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

function isSecureBrowserContext(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext;
}

function isLikelyMobileDevice(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent || '';
  const touchPoints = navigator.maxTouchPoints || 0;
  return /iPhone|iPad|iPod|Android|Mobile/i.test(userAgent) || touchPoints > 2;
}

function canUseBrowserCache(): boolean {
  return typeof window !== 'undefined' && typeof caches !== 'undefined';
}

function getRecommendedVisionDtype(backend: ExecutionBackend): 'q4' | 'q8' {
  return backend === 'webgpu' ? 'q4' : 'q8';
}

function getRecommendedRewriteDtype(backend: ExecutionBackend): 'q4f16' | 'q8' {
  return backend === 'webgpu' ? 'q4f16' : 'q8';
}

function getLoadErrorMessage(error: unknown, backend: RuntimeBackend): string {
  const baseMessage = error instanceof Error ? error.message : 'Unknown model loading error.';

  if (backend === 'wasm') {
    return `${baseMessage} WebGPU is recommended for this alt-text generator; the WASM fallback may be slow.`;
  }

  return baseMessage;
}

function buildAltTextPrompt(): string {
  return [
    'Generate useful alt text for this image.',
    'Describe the image clearly in one concise sentence that would work well in an image alt attribute.',
    'Do not mention that this is an alt text.',
    'Do not use bullet points, JSON, or markdown.',
  ].join('\n');
}

async function runModelPrompt(image: RawImage, promptText: string): Promise<string> {
  if (!visionProcessor || !visionModel) {
    throw new Error('The model is not loaded.');
  }

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'image' },
        { type: 'text', text: promptText },
      ],
    },
  ] as unknown as Parameters<typeof visionProcessor.apply_chat_template>[0];
  const prompt = visionProcessor.apply_chat_template(messages, {
    add_generation_prompt: true,
  });

  const modelInputs = await visionProcessor(prompt, [image]);
  const promptLength = modelInputs.input_ids.dims.at(-1) ?? 0;
  const output = await visionModel.generate({
    ...modelInputs,
    max_new_tokens: 120,
    do_sample: false,
    repetition_penalty: 1.05,
    no_repeat_ngram_size: 3,
  });

  if (!('tolist' in output)) {
    throw new Error('Unexpected generation output from the model runtime.');
  }

  const sequences = output.tolist() as number[][];
  const generatedTokens = sequences[0]?.slice(promptLength) ?? [];
  return (
    visionProcessor.batch_decode([generatedTokens], {
      skip_special_tokens: true,
    })[0]?.trim() ?? ''
  );
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function sanitizeAltText(text: string): string {
  return normalizeWhitespace(text)
    .replace(
      /^(?:alt text|caption|description|result|answer|rewritten alt text|shorter alt text)\s*:\s*/i,
      '',
    )
    .replace(/^["'`]+/, '')
    .replace(/["'`]+$/, '')
    .replace(/\s*\(\d+\s*characters?\)\.?$/i, '')
    .trim();
}

function cloneSteps(steps: GenerationTraceStep[]): GenerationTraceStep[] {
  return steps.map((step) => ({ ...step }));
}

function reportProgress(
  onProgress: ImageQuestionInput['onProgress'],
  status: string,
  steps: GenerationTraceStep[],
): void {
  onProgress?.({
    status,
    steps: cloneSteps(steps),
  } satisfies GenerationProgressUpdate);
}

function buildRewriteMessages(currentText: string, iteration: number): Chat {
  return [
    {
      role: 'system',
      content: [
        'You shorten image descriptions into concise HTML alt text.',
        'Your top priority is making the text shorter.',
        'It is okay to drop detail aggressively.',
        'Return only the rewritten alt text with no prefatory text.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        iteration === 1
          ? 'Rewrite this image description as concise HTML alt text.'
          : 'This alt text is still too long. Shorten it further.',
        `Target ${ALT_TEXT_CHARACTER_LIMIT} characters or fewer. Prefer a few words when possible.`,
        `Current length: ${currentText.length} characters.`,
        'Shorten aggressively.',
        'Do not add new details.',
        'Return only the rewritten alt text.',
        '',
        `Current text: ${currentText}`,
      ].join('\n'),
    },
  ];
}

function extractGeneratedRewrite(
  output: TextGenerationOutput | TextGenerationOutput[],
): string {
  const firstResult = Array.isArray(output[0]) ? output[0][0] : output[0];
  const generatedText = firstResult?.generated_text;

  if (Array.isArray(generatedText)) {
    return generatedText.at(-1)?.content ?? '';
  }

  return generatedText ?? '';
}

async function getExecutionBackend(): Promise<ExecutionBackend> {
  if (isExecutionBackend(activeBackend)) {
    return activeBackend;
  }

  if (backendPromise) {
    return backendPromise;
  }

  backendPromise = (async () => {
    const runtime = await canRun();

    if (!runtime.supported) {
      throw new Error(runtime.reason ?? 'This browser does not support the required runtime.');
    }

    env.allowLocalModels = false;
    env.useBrowserCache = canUseBrowserCache();

    if (!isExecutionBackend(runtime.backend)) {
      throw new Error('A usable browser backend was not detected.');
    }

    activeBackend = runtime.backend;
    return runtime.backend;
  })().catch((error: unknown) => {
    activeBackend = 'unknown';
    backendPromise = null;
    throw error;
  });

  return backendPromise;
}

async function loadRewriteModel(): Promise<void> {
  if (rewritePipeline) {
    return;
  }

  if (rewriteLoadPromise) {
    return rewriteLoadPromise;
  }

  rewriteLoadPromise = (async () => {
    const backend = await getExecutionBackend();

    rewritePipeline = await pipeline<'text-generation'>('text-generation', REWRITE_MODEL_ID, {
      device: backend,
      dtype: getRecommendedRewriteDtype(backend),
    });
  })().catch((error: unknown) => {
    rewritePipeline = null;
    rewriteLoadPromise = null;
    throw new Error(getLoadErrorMessage(error, activeBackend));
  });

  return rewriteLoadPromise;
}

async function rewriteAltText(
  rawAltText: string,
  steps: GenerationTraceStep[],
  onProgress?: ImageQuestionInput['onProgress'],
): Promise<string> {
  if (!rawAltText) {
    throw new Error('The vision model did not return a description to rewrite.');
  }

  reportProgress(
    onProgress,
    `Loading the text model and starting the shorten loop (up to ${MAX_REWRITE_LOOPS} passes)…`,
    steps,
  );
  await loadRewriteModel();

  if (!rewritePipeline) {
    throw new Error('The rewrite model is not loaded.');
  }

  let currentText = rawAltText;

  for (let iteration = 1; iteration <= MAX_REWRITE_LOOPS; iteration += 1) {
    reportProgress(
      onProgress,
      `Running text model iteration ${iteration} of ${MAX_REWRITE_LOOPS}…`,
      steps,
    );

    const output = await rewritePipeline(buildRewriteMessages(currentText, iteration), {
      max_new_tokens: 80,
      do_sample: false,
      repetition_penalty: 1.05,
      no_repeat_ngram_size: 3,
    });

    const rewrittenAltText = sanitizeAltText(extractGeneratedRewrite(output));

    if (!rewrittenAltText) {
      throw new Error(`The rewrite model returned no output on iteration ${iteration}.`);
    }

    steps.push({
      id: `rewrite-${iteration}`,
      model: 'rewrite',
      label: `Text model iteration ${iteration}`,
      text: rewrittenAltText,
      charCount: rewrittenAltText.length,
    });

    if (rewrittenAltText.length <= ALT_TEXT_CHARACTER_LIMIT) {
      reportProgress(
        onProgress,
        `Iteration ${iteration} reached ${rewrittenAltText.length} characters and met the target.`,
        steps,
      );
      return rewrittenAltText;
    }

    currentText = rewrittenAltText;
    reportProgress(
      onProgress,
      `Iteration ${iteration} produced ${rewrittenAltText.length} characters. Shortening again…`,
      steps,
    );
  }

  throw new Error(
    `The text model did not reach ${ALT_TEXT_CHARACTER_LIMIT} characters after ${MAX_REWRITE_LOOPS} iterations.`,
  );
}

export async function canRun(): Promise<RuntimeAvailability> {
  if (typeof window === 'undefined') {
    return {
      supported: false,
      backend: 'unknown',
      reason: 'This app must run in a browser context.',
    };
  }

  if (isLikelyMobileDevice()) {
    return {
      supported: false,
      backend: 'unknown',
      reason: 'Local alt-text generation is disabled on mobile because the model is too heavy and may crash the browser. Use a desktop browser instead.',
    };
  }

  if (!isSecureBrowserContext()) {
    return {
      supported: true,
      backend: 'wasm',
      reason: 'WebGPU is unavailable because this page is not running in a secure browser context. Use HTTPS or localhost.',
    };
  }

  if (!hasWebGpu()) {
    return {
      supported: true,
      backend: 'wasm',
      reason: 'WebGPU is not exposed in this browser context, so the app will use the slower WASM fallback.',
    };
  }

  try {
    const gpuNavigator = navigator as NavigatorWithGpu;
    const adapter = await gpuNavigator.gpu.requestAdapter({
      powerPreference: 'high-performance',
    });

    if (!adapter) {
      return {
        supported: true,
        backend: 'wasm',
        reason: 'WebGPU was detected, but the browser did not provide a GPU adapter for this page. The app will use the slower WASM fallback.',
      };
    }

    return {
      supported: true,
      backend: 'webgpu',
      reason: 'WebGPU detected. This is the preferred backend for the alt-text generator.',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown WebGPU adapter error.';

    return {
      supported: true,
      backend: 'wasm',
      reason: `WebGPU was detected, but adapter initialization failed (${message}). The app will use the slower WASM fallback.`,
    };
  }
}

export async function loadModel(): Promise<void> {
  if (visionProcessor && visionModel) {
    return;
  }

  if (visionLoadPromise) {
    return visionLoadPromise;
  }

  visionLoadPromise = (async () => {
    const backend = await getExecutionBackend();

    visionProcessor = await AutoProcessor.from_pretrained(VISION_MODEL_ID);
    visionModel = await AutoModelForImageTextToText.from_pretrained(VISION_MODEL_ID, {
      device: backend,
      dtype: getRecommendedVisionDtype(backend),
    });
  })().catch((error: unknown) => {
    visionProcessor = null;
    visionModel = null;
    visionLoadPromise = null;
    throw new Error(getLoadErrorMessage(error, activeBackend));
  });

  return visionLoadPromise;
}

export async function answerImageQuestion(
  input: ImageQuestionInput,
): Promise<ImageQuestionResult> {
  await loadModel();

  if (!visionProcessor || !visionModel) {
    throw new Error('The model is not loaded.');
  }

  const image = await RawImage.read(input.image);
  const rawAltText = sanitizeAltText(await runModelPrompt(image, buildAltTextPrompt()));
  const steps: GenerationTraceStep[] = [];

  if (!rawAltText) {
    throw new Error('The vision model did not return any alt text.');
  }

  steps.push({
    id: 'vision-output',
    model: 'vision',
    label: 'Vision model output',
    text: rawAltText,
    charCount: rawAltText.length,
  });
  reportProgress(
    input.onProgress,
    `Vision model produced ${rawAltText.length} characters. Starting the shorten loop…`,
    steps,
  );

  if (rawAltText.length <= ALT_TEXT_CHARACTER_LIMIT) {
    reportProgress(
      input.onProgress,
      `Vision model produced ${rawAltText.length} characters and already met the target.`,
      steps,
    );

    return {
      text: rawAltText,
      backend: activeBackend,
      steps,
    };
  }

  const finalAltText = await rewriteAltText(rawAltText, steps, input.onProgress);

  return {
    text: finalAltText || 'The model did not return any alt text.',
    backend: activeBackend,
    steps,
  };
}
