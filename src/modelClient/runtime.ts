import { env } from '@huggingface/transformers';
import type { RuntimeAvailability, RuntimeBackend } from '../types';
import type { ExecutionBackend } from './constants';
import { modelClientState } from './state';

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

export async function getExecutionBackend(): Promise<ExecutionBackend> {
  if (isExecutionBackend(modelClientState.activeBackend)) {
    return modelClientState.activeBackend;
  }

  if (modelClientState.backendPromise) {
    return modelClientState.backendPromise;
  }

  modelClientState.backendPromise = (async () => {
    const runtime = await canRun();

    if (!runtime.supported) {
      throw new Error(runtime.reason ?? 'This browser does not support the required runtime.');
    }

    env.allowLocalModels = false;
    env.useBrowserCache = canUseBrowserCache();

    if (!isExecutionBackend(runtime.backend)) {
      throw new Error('A usable browser backend was not detected.');
    }

    modelClientState.activeBackend = runtime.backend;
    return runtime.backend;
  })().catch((error: unknown) => {
    modelClientState.activeBackend = 'unknown';
    modelClientState.backendPromise = null;
    throw error;
  });

  return modelClientState.backendPromise;
}
