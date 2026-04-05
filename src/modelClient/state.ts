import { AutoModelForImageTextToText, AutoProcessor } from '@huggingface/transformers';
import type { TextGenerationPipeline } from '@huggingface/transformers';
import type { RuntimeBackend } from '../types';
import type { ExecutionBackend } from './constants';

export interface ModelClientState {
  visionProcessor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>> | null;
  visionModel: Awaited<ReturnType<typeof AutoModelForImageTextToText.from_pretrained>> | null;
  visionLoadPromise: Promise<void> | null;
  rewritePipeline: TextGenerationPipeline | null;
  rewriteLoadPromise: Promise<void> | null;
  backendPromise: Promise<ExecutionBackend> | null;
  activeBackend: RuntimeBackend;
}

export const modelClientState: ModelClientState = {
  visionProcessor: null,
  visionModel: null,
  visionLoadPromise: null,
  rewritePipeline: null,
  rewriteLoadPromise: null,
  backendPromise: null,
  activeBackend: 'unknown',
};
