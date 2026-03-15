export type AppState =
  | 'idle'
  | 'loading'
  | 'running'
  | 'success'
  | 'error';

export type RuntimeBackend = 'webgpu' | 'wasm' | 'unknown';

export interface RuntimeAvailability {
  supported: boolean;
  backend: RuntimeBackend;
  reason?: string;
}

export interface ImageQuestionInput {
  image: File;
  prompt: string;
}

export interface ImageQuestionResult {
  text: string;
  backend: string;
}
