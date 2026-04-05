import { ALT_TEXT_CHARACTER_LIMIT, MAX_REWRITE_LOOPS } from '../altTextConfig';

export { ALT_TEXT_CHARACTER_LIMIT, MAX_REWRITE_LOOPS };

export const VISION_MODEL_ID = 'HuggingFaceTB/SmolVLM-256M-Instruct';
export const REWRITE_MODEL_ID = 'HuggingFaceTB/SmolLM2-360M-Instruct';

export type ExecutionBackend = 'webgpu' | 'wasm';

export function getRecommendedVisionDtype(backend: ExecutionBackend): 'q4' | 'q8' {
  return backend === 'webgpu' ? 'q4' : 'q8';
}

export function getRecommendedRewriteDtype(backend: ExecutionBackend): 'q4f16' | 'q8' {
  return backend === 'webgpu' ? 'q4f16' : 'q8';
}
