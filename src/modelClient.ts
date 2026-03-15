import {
  AutoModelForImageTextToText,
  AutoProcessor,
  RawImage,
  env,
} from '@huggingface/transformers';
import type {
  ImageQuestionInput,
  ImageQuestionResult,
  RuntimeAvailability,
  RuntimeBackend,
} from './types';

const MODEL_ID = 'HuggingFaceTB/SmolVLM-256M-Instruct';
const ALT_TEXT_CHARACTER_LIMIT = 125;

let processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>> | null = null;
let model: Awaited<ReturnType<typeof AutoModelForImageTextToText.from_pretrained>> | null = null;
let loadPromise: Promise<void> | null = null;
let activeBackend: RuntimeBackend = 'unknown';

function isExecutionBackend(backend: RuntimeBackend): backend is 'webgpu' | 'wasm' {
  return backend === 'webgpu' || backend === 'wasm';
}

function hasWebGpu(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
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

function getRecommendedDtype(backend: RuntimeBackend): 'q4' | 'q8' {
  return backend === 'webgpu' ? 'q4' : 'q8';
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
    `Write one concise sentence that would work well in an image alt attribute and keep it under ${ALT_TEXT_CHARACTER_LIMIT} characters.`,
    'Focus on the main subject, visible action, and any important text if it is clearly readable.',
    'Do not mention that this is an alt text.',
    'Do not use bullet points, JSON, or markdown.',
  ].join('\n');
}

async function runModelPrompt(image: RawImage, promptText: string): Promise<string> {
  if (!processor || !model) {
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
  ] as unknown as Parameters<typeof processor.apply_chat_template>[0];
  const prompt = processor.apply_chat_template(messages, {
    add_generation_prompt: true,
  });

  const modelInputs = await processor(prompt, [image]);
  const promptLength = modelInputs.input_ids.dims.at(-1) ?? 0;
  const output = await model.generate({
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
    processor.batch_decode([generatedTokens], {
      skip_special_tokens: true,
    })[0]?.trim() ?? ''
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

  if (hasWebGpu()) {
    return {
      supported: true,
      backend: 'webgpu',
      reason: 'WebGPU detected. This is the preferred backend for the alt-text generator.',
    };
  }

  return {
    supported: true,
    backend: 'wasm',
    reason: 'WebGPU was not detected. The app will attempt a slower WASM fallback.',
  };
}

export async function loadModel(): Promise<void> {
  if (processor && model) {
    return;
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    const runtime = await canRun();

    if (!runtime.supported) {
      throw new Error(runtime.reason ?? 'This browser does not support the required runtime.');
    }

    activeBackend = runtime.backend;

    env.allowLocalModels = false;
    env.useBrowserCache = canUseBrowserCache();

    if (!isExecutionBackend(runtime.backend)) {
      throw new Error('A usable browser backend was not detected.');
    }

    processor = await AutoProcessor.from_pretrained(MODEL_ID);
    model = await AutoModelForImageTextToText.from_pretrained(MODEL_ID, {
      device: runtime.backend,
      dtype: getRecommendedDtype(runtime.backend),
    });
  })().catch((error: unknown) => {
    processor = null;
    model = null;
    loadPromise = null;
    throw new Error(getLoadErrorMessage(error, activeBackend));
  });

  return loadPromise;
}

export async function answerImageQuestion(
  input: ImageQuestionInput,
): Promise<ImageQuestionResult> {
  await loadModel();

  if (!processor || !model) {
    throw new Error('The model is not loaded.');
  }

  const image = await RawImage.read(input.image);
  const altText = await runModelPrompt(image, buildAltTextPrompt());

  return {
    text: altText || 'The model did not return any alt text.',
    backend: activeBackend,
  };
}
