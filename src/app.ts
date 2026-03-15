import { answerImageQuestion, canRun, loadModel } from './modelClient';
import type { AppState, RuntimeBackend } from './types';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALT_TEXT_CHARACTER_LIMIT = 125;
const ALT_TEXT_STRATEGY = [
  'Upload one image.',
  'The model generates one concise alt-text sentence.',
  `The result is meant to be usable in an image alt attribute and should stay under about ${ALT_TEXT_CHARACTER_LIMIT} characters.`,
].join('\n');

const ALT_TEXT_EXPLAINER = [
  'Alt text is a short description of an image used by screen readers and shown when images fail to load.',
  'Good alt text helps people understand the important visual content without seeing the image.',
  `A practical target is about ${ALT_TEXT_CHARACTER_LIMIT} characters or less so it stays concise and easy to scan.`,
].join('\n\n');

interface ViewState {
  appState: AppState;
  image: File | null;
  imageUrl: string | null;
  answer: string;
  error: string;
  status: string;
  backend: RuntimeBackend;
}

function isBusyState(appState: AppState): boolean {
  return appState === 'loading' || appState === 'running';
}

function getVisualProgress(appState: AppState): number {
  switch (appState) {
    case 'loading':
      return 48;
    case 'running':
      return 90;
    case 'success':
      return 100;
    default:
      return 0;
  }
}

function describeBackend(backend: RuntimeBackend): string {
  switch (backend) {
    case 'webgpu':
      return 'WebGPU';
    case 'wasm':
      return 'WASM fallback';
    default:
      return 'Unknown';
  }
}

export function mountApp(root: HTMLDivElement): void {
  const state: ViewState = {
    appState: 'idle',
    image: null,
    imageUrl: null,
    answer: '',
    error: '',
    status: 'Checking runtime support…',
    backend: 'unknown',
  };

  root.innerHTML = `
    <main class="shell">
      <section class="hero">
        <p class="eyebrow">Browser-only multimodal POC</p>
        <h1>Image Alt Text Generator</h1>
        <p class="lede">
          Upload one image and generate a concise alt-text description locally in your browser.
        </p>
      </section>

      <section class="panel workspace">
        <div class="column controls">
          <label class="field">
            <span class="label">Image</span>
            <input id="image-input" type="file" accept="image/*" />
            <span class="hint">PNG, JPEG, WebP, GIF. Max 10 MB.</span>
          </label>

          <section class="field">
            <span class="label">Flow</span>
            <pre class="prompt-display">${ALT_TEXT_STRATEGY}</pre>
          </section>

          <section class="field">
            <span class="label">Why alt text matters</span>
            <pre class="prompt-display">${ALT_TEXT_EXPLAINER}</pre>
          </section>

          <button id="run-button" class="run-button" type="button">Generate alt text</button>
        </div>

        <div class="column output">
          <div class="status-card">
            <div>
              <p class="status-label">Runtime status</p>
              <p id="status-text" class="status-value">Checking runtime support…</p>
              <div class="progress-track" aria-hidden="true">
                <div id="progress-bar" class="progress-bar"></div>
              </div>
            </div>
            <p id="backend-badge" class="backend-badge">Unknown</p>
          </div>

          <section class="preview-card">
            <p class="result-label">Selected image</p>
            <div class="preview-frame">
              <div id="preview-empty" class="preview-empty">No image selected</div>
              <img id="preview-image" class="preview-image" alt="Selected upload preview" hidden />
              <div id="preview-overlay" class="preview-overlay" hidden>
                <span class="loading-spinner" aria-hidden="true"></span>
                <span id="preview-overlay-text">Processing…</span>
              </div>
            </div>
          </section>

          <section class="result-card">
            <p class="result-label">Generated alt text</p>
            <pre id="answer-text" class="result-body">The alt text will appear here.</pre>
          </section>

          <section id="error-card" class="error-card" hidden>
            <p class="result-label">Error</p>
            <p id="error-text" class="error-text"></p>
          </section>
        </div>
      </section>
    </main>
  `;

  const imageInput = root.querySelector<HTMLInputElement>('#image-input');
  const runButton = root.querySelector<HTMLButtonElement>('#run-button');
  const statusText = root.querySelector<HTMLParagraphElement>('#status-text');
  const progressBar = root.querySelector<HTMLDivElement>('#progress-bar');
  const backendBadge = root.querySelector<HTMLParagraphElement>('#backend-badge');
  const previewEmpty = root.querySelector<HTMLDivElement>('#preview-empty');
  const previewImage = root.querySelector<HTMLImageElement>('#preview-image');
  const previewOverlay = root.querySelector<HTMLDivElement>('#preview-overlay');
  const previewOverlayText = root.querySelector<HTMLSpanElement>('#preview-overlay-text');
  const answerText = root.querySelector<HTMLPreElement>('#answer-text');
  const errorCard = root.querySelector<HTMLElement>('#error-card');
  const errorText = root.querySelector<HTMLParagraphElement>('#error-text');

  if (
    !imageInput ||
    !runButton ||
    !statusText ||
    !progressBar ||
    !backendBadge ||
    !previewEmpty ||
    !previewImage ||
    !previewOverlay ||
    !previewOverlayText ||
    !answerText ||
    !errorCard ||
    !errorText
  ) {
    throw new Error('The app UI failed to initialize.');
  }

  const render = (): void => {
    const busy = isBusyState(state.appState);

    statusText.textContent = state.status;
    progressBar.style.width = `${getVisualProgress(state.appState)}%`;
    backendBadge.textContent = describeBackend(state.backend);
    backendBadge.dataset.backend = state.backend;
    runButton.dataset.busy = String(busy);

    if (state.imageUrl) {
      previewImage.src = state.imageUrl;
      previewImage.hidden = false;
      previewEmpty.hidden = true;
    } else {
      previewImage.hidden = true;
      previewEmpty.hidden = false;
    }

    previewOverlay.hidden = !busy;
    previewOverlayText.textContent =
      state.appState === 'loading'
        ? 'Loading SmolVLM…'
        : state.appState === 'running'
          ? 'Generating alt text…'
          : 'Processing…';

    answerText.textContent = state.answer || 'The alt text will appear here.';
    errorCard.hidden = state.error.length === 0;
    errorText.textContent = state.error;

    runButton.disabled = busy;
    imageInput.disabled = busy;
    runButton.textContent =
      state.appState === 'loading'
        ? 'Loading model…'
        : state.appState === 'running'
          ? 'Generating…'
          : 'Generate alt text';
  };

  const setError = (message: string): void => {
    state.appState = 'error';
    state.error = message;
    state.status = `Error: ${message}`;
    render();
  };

  imageInput.addEventListener('change', () => {
    const file = imageInput.files?.[0] ?? null;

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      imageInput.value = '';
      setError('Please select a valid image file.');
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      imageInput.value = '';
      setError('Image is too large for this app. Please use a file under 10 MB.');
      return;
    }

    if (state.imageUrl) {
      URL.revokeObjectURL(state.imageUrl);
    }

    state.image = file;
    state.imageUrl = URL.createObjectURL(file);
    state.answer = '';
    state.error = '';
    state.appState = 'idle';
    state.status = 'Image ready. Generate alt text when you are ready.';
    render();

    imageInput.value = '';
  });

  runButton.addEventListener('click', async () => {
    if (!state.image) {
      setError('Select an image before generating alt text.');
      return;
    }

    try {
      state.error = '';
      state.answer = '';
      state.appState = 'loading';
      state.status = 'Loading SmolVLM…';
      render();

      await loadModel();

      state.appState = 'running';
      state.status = `Generating alt text on ${describeBackend(state.backend)}…`;
      render();

      const result = await answerImageQuestion({
        image: state.image,
        prompt: '',
      });

      state.backend = result.backend as RuntimeBackend;
      state.appState = 'success';
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
