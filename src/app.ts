import { MAX_IMAGE_BYTES, READY_STATUS } from './app/content';
import { getAppElements } from './app/dom';
import { renderApp } from './app/render';
import {
  createInitialViewState,
  describeBackend,
  type ViewState,
} from './app/state';
import { buildAppTemplate } from './app/template';
import { answerImageQuestion, canRun, loadModel } from './modelClient';

export function mountApp(root: HTMLDivElement): void {
  const state: ViewState = createInitialViewState();

  root.innerHTML = buildAppTemplate();
  const elements = getAppElements(root);

  const render = (): void => {
    renderApp(state, elements);
  };

  const setError = (message: string): void => {
    state.appState = 'error';
    state.error = message;
    state.status = `Error: ${message}`;
    render();
  };

  elements.imageInput.addEventListener('change', () => {
    const file = elements.imageInput.files?.[0] ?? null;

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      elements.imageInput.value = '';
      setError('Please select a valid image file.');
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      elements.imageInput.value = '';
      setError('Image is too large for this app. Please use a file under 10 MB.');
      return;
    }

    if (state.imageUrl) {
      URL.revokeObjectURL(state.imageUrl);
    }

    state.image = file;
    state.imageUrl = URL.createObjectURL(file);
    state.answer = '';
    state.traceSteps = [];
    state.error = '';
    state.appState = 'idle';
    state.status = READY_STATUS;
    render();

    elements.imageInput.value = '';
  });

  elements.runButton.addEventListener('click', async () => {
    if (!state.image) {
      setError('Select an image before generating alt text.');
      return;
    }

    try {
      state.error = '';
      state.answer = '';
      state.traceSteps = [];
      state.appState = 'loading';
      state.status = 'Loading SmolVLM…';
      render();

      await loadModel();

      state.appState = 'running';
      state.status = `Generating and refining alt text on ${describeBackend(state.backend)}…`;
      render();

      const result = await answerImageQuestion({
        image: state.image,
        prompt: '',
        onProgress: (update) => {
          state.appState = 'running';
          state.status = update.status;
          state.traceSteps = update.steps;
          state.answer = update.steps.at(-1)?.text ?? '';
          render();
        },
      });

      state.backend = result.backend;
      state.appState = 'success';
      state.traceSteps = result.steps;
      state.answer = result.text;
      state.status = `Completed on ${describeBackend(state.backend)}.`;
      render();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown inference error.';
      setError(message);
    }
  });

  void (async () => {
    const runtime = await canRun();
    state.backend = runtime.backend;
    state.status = runtime.reason ?? 'Runtime check completed.';
    render();
  })();

  render();

  window.addEventListener('beforeunload', () => {
    if (state.imageUrl) {
      URL.revokeObjectURL(state.imageUrl);
    }
  });
}
