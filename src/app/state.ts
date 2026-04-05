import { ALT_TEXT_CHARACTER_LIMIT, MAX_REWRITE_LOOPS } from '../altTextConfig';
import type { AppState, GenerationTraceStep, RuntimeBackend } from '../types';
import { INITIAL_STATUS } from './content';

export interface ViewState {
  appState: AppState;
  image: File | null;
  imageUrl: string | null;
  answer: string;
  traceSteps: GenerationTraceStep[];
  error: string;
  status: string;
  backend: RuntimeBackend;
}

export function createInitialViewState(): ViewState {
  return {
    appState: 'idle',
    image: null,
    imageUrl: null,
    answer: '',
    traceSteps: [],
    error: '',
    status: INITIAL_STATUS,
    backend: 'unknown',
  };
}

export function isBusyState(appState: AppState): boolean {
  return appState === 'loading' || appState === 'running';
}

export function getVisualProgress(
  appState: AppState,
  traceSteps: GenerationTraceStep[],
): number {
  switch (appState) {
    case 'loading':
      return 26;
    case 'running':
      return Math.min(94, 40 + Math.round((traceSteps.length / (MAX_REWRITE_LOOPS + 1)) * 50));
    case 'success':
      return 100;
    case 'error':
      return traceSteps.length > 0 ? 100 : 0;
    default:
      return 0;
  }
}

export function describeBackend(backend: RuntimeBackend): string {
  switch (backend) {
    case 'webgpu':
      return 'WebGPU';
    case 'wasm':
      return 'WASM fallback';
    default:
      return 'Unknown';
  }
}

export function describeTraceState(
  steps: GenerationTraceStep[],
  appState: AppState,
): string {
  if (steps.length === 0) {
    return 'Waiting to run';
  }

  const latestStep = steps.at(-1);

  if (!latestStep) {
    return 'Waiting to run';
  }

  if (appState === 'success') {
    return `${steps.length} steps • target reached`;
  }

  if (appState === 'error') {
    return `${steps.length} steps • loop stopped`;
  }

  return latestStep.charCount <= ALT_TEXT_CHARACTER_LIMIT
    ? `${steps.length} steps • candidate within target`
    : `${steps.length} steps • still shortening`;
}

export function describeAnswer(
  text: string,
  appState: AppState,
  latestStep?: GenerationTraceStep,
): string {
  if (!text) {
    return appState === 'running'
      ? 'The latest draft will appear here as the loop runs.'
      : `The accepted result will appear here once a rewrite reaches ${ALT_TEXT_CHARACTER_LIMIT} characters.`;
  }

  if (appState === 'success') {
    return `${text.length} characters • accepted final result`;
  }

  if (appState === 'error') {
    return `${text.length} characters • last draft before failure`;
  }

  if (appState === 'running' && latestStep) {
    const draftSource = latestStep.model === 'vision' ? 'vision draft' : 'latest rewrite';
    const targetState = text.length <= ALT_TEXT_CHARACTER_LIMIT ? 'within target' : 'above target';
    return `${text.length} characters • ${draftSource} • ${targetState}`;
  }

  return text.length <= ALT_TEXT_CHARACTER_LIMIT
    ? `${text.length} characters • within target`
    : `${text.length} characters • above target`;
}
