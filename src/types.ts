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

export interface GenerationTraceStep {
  id: string;
  model: 'vision' | 'rewrite';
  label: string;
  text: string;
  charCount: number;
}

export interface GenerationProgressUpdate {
  status: string;
  steps: GenerationTraceStep[];
}

export interface ImageQuestionInput {
  image: File;
  prompt: string;
  onProgress?: (update: GenerationProgressUpdate) => void;
}

export interface ImageQuestionResult {
  text: string;
  backend: RuntimeBackend;
  steps: GenerationTraceStep[];
}
