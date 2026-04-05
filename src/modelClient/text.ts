import type { Chat, TextGenerationOutput } from '@huggingface/transformers';
import type {
  GenerationProgressUpdate,
  GenerationTraceStep,
  ImageQuestionInput,
  RuntimeBackend,
} from '../types';
import { ALT_TEXT_CHARACTER_LIMIT } from './constants';

export function getLoadErrorMessage(error: unknown, backend: RuntimeBackend): string {
  const baseMessage = error instanceof Error ? error.message : 'Unknown model loading error.';

  if (backend === 'wasm') {
    return `${baseMessage} WebGPU is recommended for this alt-text generator; the WASM fallback may be slow.`;
  }

  return baseMessage;
}

export function buildAltTextPrompt(): string {
  return [
    'Describe the image clearly in one concise sentence.',
    'Do not use bullet points, JSON, or markdown.',
  ].join('\n');
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function sanitizeAltText(text: string): string {
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

export function reportProgress(
  onProgress: ImageQuestionInput['onProgress'],
  status: string,
  steps: GenerationTraceStep[],
): void {
  onProgress?.({
    status,
    steps: cloneSteps(steps),
  } satisfies GenerationProgressUpdate);
}

export function buildRewriteMessages(currentText: string, iteration: number): Chat {
  return [
    {
      role: 'system',
      content: [
        'You shorten image descriptions into concise words.',
        'Your top priority is making the text shorter.',
        'Return only the rewritten descriptions with no prefatory text.',
        'Do not add thought process or reasoning steps, as this will make the output too long.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        iteration === 1
          ? 'Rewrite this image description as concise words.'
          : 'This alt text is still too long. Shorten it further.',
        `Target ${ALT_TEXT_CHARACTER_LIMIT} characters or fewer.`,
        `Current length: ${currentText.length} characters.`,
        'Return only the rewritten descriptions.',
        '',
        `Current text: ${currentText}`,
      ].join('\n'),
    },
  ];
}

export function extractGeneratedRewrite(
  output: TextGenerationOutput | TextGenerationOutput[],
): string {
  const firstResult = Array.isArray(output[0]) ? output[0][0] : output[0];
  const generatedText = firstResult?.generated_text;

  if (Array.isArray(generatedText)) {
    return generatedText.at(-1)?.content ?? '';
  }

  return generatedText ?? '';
}
