import {
  AutoModelForImageTextToText,
  AutoProcessor,
  pipeline,
} from '@huggingface/transformers';
import type { TextGenerationPipeline } from '@huggingface/transformers';
import {
  REWRITE_MODEL_ID,
  VISION_MODEL_ID,
  getRecommendedRewriteDtype,
  getRecommendedVisionDtype,
} from './constants';
import { getExecutionBackend } from './runtime';
import { modelClientState } from './state';
import { getLoadErrorMessage } from './text';

export function requireVisionComponents() {
  if (!modelClientState.visionProcessor || !modelClientState.visionModel) {
    throw new Error('The model is not loaded.');
  }

  return {
    visionProcessor: modelClientState.visionProcessor,
    visionModel: modelClientState.visionModel,
  };
}

export function requireRewritePipeline(): TextGenerationPipeline {
  if (!modelClientState.rewritePipeline) {
    throw new Error('The rewrite model is not loaded.');
  }

  return modelClientState.rewritePipeline;
}

export async function loadModel(): Promise<void> {
  if (modelClientState.visionProcessor && modelClientState.visionModel) {
    return;
  }

  if (modelClientState.visionLoadPromise) {
    return modelClientState.visionLoadPromise;
  }

  modelClientState.visionLoadPromise = (async () => {
    const backend = await getExecutionBackend();

    modelClientState.visionProcessor = await AutoProcessor.from_pretrained(VISION_MODEL_ID);
    modelClientState.visionModel = await AutoModelForImageTextToText.from_pretrained(
      VISION_MODEL_ID,
      {
        device: backend,
        dtype: getRecommendedVisionDtype(backend),
      },
    );
  })().catch((error: unknown) => {
    modelClientState.visionProcessor = null;
    modelClientState.visionModel = null;
    modelClientState.visionLoadPromise = null;
    throw new Error(getLoadErrorMessage(error, modelClientState.activeBackend));
  });

  return modelClientState.visionLoadPromise;
}

export async function loadRewriteModel(): Promise<void> {
  if (modelClientState.rewritePipeline) {
    return;
  }

  if (modelClientState.rewriteLoadPromise) {
    return modelClientState.rewriteLoadPromise;
  }

  modelClientState.rewriteLoadPromise = (async () => {
    const backend = await getExecutionBackend();

    modelClientState.rewritePipeline = await pipeline<'text-generation'>(
      'text-generation',
      REWRITE_MODEL_ID,
      {
        device: backend,
        dtype: getRecommendedRewriteDtype(backend),
      },
    );
  })().catch((error: unknown) => {
    modelClientState.rewritePipeline = null;
    modelClientState.rewriteLoadPromise = null;
    throw new Error(getLoadErrorMessage(error, modelClientState.activeBackend));
  });

  return modelClientState.rewriteLoadPromise;
}
