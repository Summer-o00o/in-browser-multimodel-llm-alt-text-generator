import { RawImage } from '@huggingface/transformers';
import type { GenerationTraceStep, ImageQuestionInput, ImageQuestionResult } from '../types';
import { ALT_TEXT_CHARACTER_LIMIT, MAX_REWRITE_LOOPS } from './constants';
import {
  loadModel,
  loadRewriteModel,
  requireRewritePipeline,
  requireVisionComponents,
} from './loaders';
import { modelClientState } from './state';
import {
  buildAltTextPrompt,
  buildRewriteMessages,
  extractGeneratedRewrite,
  reportProgress,
  sanitizeAltText,
} from './text';

async function runModelPrompt(image: RawImage, promptText: string): Promise<string> {
  const { visionProcessor, visionModel } = requireVisionComponents();

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

  const rewritePipeline = requireRewritePipeline();
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

export async function answerImageQuestion(
  input: ImageQuestionInput,
): Promise<ImageQuestionResult> {
  await loadModel();

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
      backend: modelClientState.activeBackend,
      steps,
    };
  }

  const finalAltText = await rewriteAltText(rawAltText, steps, input.onProgress);

  return {
    text: finalAltText || 'The model did not return any alt text.',
    backend: modelClientState.activeBackend,
    steps,
  };
}
