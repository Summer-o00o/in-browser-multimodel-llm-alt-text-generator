import { answerImageQuestion, canRun, loadModel } from './modelClient';
import type { AppState, GenerationTraceStep, RuntimeBackend } from './types';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALT_TEXT_CHARACTER_LIMIT = 125;
const MAX_REWRITE_LOOPS = 10;
const ALT_TEXT_STRATEGY = [
  'Upload one image.',
  'SmolVLM first writes a fuller visual description.',
  `SmolLM2 then shortens that text in a loop until it reaches ${ALT_TEXT_CHARACTER_LIMIT} characters or we hit ${MAX_REWRITE_LOOPS} passes.`,
  'The trace panel shows every intermediate version so you can inspect the process.',
].join('\n');

const ALT_TEXT_EXPLAINER = [
  'Alt text is a short description of an image used by screen readers and shown when images fail to load.',
  'Good alt text helps people understand the important visual content without seeing the image.',
  `A practical target is about ${ALT_TEXT_CHARACTER_LIMIT} characters or less so it stays concise and easy to scan.`,
].join('\n\n');

const TRACE_EXPLAINER = [
  'Why there are multiple steps:',
  'We let the vision model describe the image freely first.',
  'Then we feed that text back into the text model over several passes, checking the character count after each one.',
  `The loop stops as soon as a rewrite fits within ${ALT_TEXT_CHARACTER_LIMIT} characters, or fails after ${MAX_REWRITE_LOOPS} passes.`,
].join('\n');

const RUNTIME_WARNING = [
  'Local browser inference can take a while, especially on the first run while models download and initialize.',
  'On slower machines or browsers without stable WebGPU support, the tab may become unresponsive or crash during loading or generation.',
  'Desktop with WebGPU is strongly recommended.',
].join('\n\n');

interface ViewState {
  appState: AppState;
  image: File | null;
  imageUrl: string | null;
  answer: string;
  traceSteps: GenerationTraceStep[];
  error: string;
  status: string;
  backend: RuntimeBackend;
}

function isBusyState(appState: AppState): boolean {
  return appState === 'loading' || appState === 'running';
}

function getVisualProgress(appState: AppState, traceSteps: GenerationTraceStep[]): number {
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

function describeTraceState(steps: GenerationTraceStep[], appState: AppState): string {
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

function describeAnswer(
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

export function mountApp(root: HTMLDivElement): void {
  const state: ViewState = {
    appState: 'idle',
    image: null,
    imageUrl: null,
    answer: '',
    traceSteps: [],
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

          <button id="run-button" class="run-button" type="button">Generate alt text</button>

          <section class="warning-card">
            <span class="warning-label">Before you run</span>
            <pre class="warning-body">${RUNTIME_WARNING}</pre>
          </section>

          <section class="field">
            <span class="label">Flow</span>
            <pre class="prompt-display">${ALT_TEXT_STRATEGY}</pre>
          </section>

          <section class="field">
            <span class="label">Why alt text matters</span>
            <pre class="prompt-display">${ALT_TEXT_EXPLAINER}</pre>
          </section>

          <section class="field">
            <span class="label">Rewrite loop</span>
            <pre class="prompt-display">${TRACE_EXPLAINER}</pre>
          </section>
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
            <p id="answer-meta" class="result-meta">The accepted result will appear here once a rewrite reaches ${ALT_TEXT_CHARACTER_LIMIT} characters.</p>
            <pre id="answer-text" class="result-body">The accepted alt text will appear here.</pre>
          </section>

          <section class="trace-card">
            <div class="trace-header">
              <div>
                <p class="result-label">Generation trace</p>
                <p class="trace-explainer">
                  Vision output comes first. Then each text-model pass is shown with its character count so you can see the shortening loop work step by step.
                </p>
              </div>
              <p id="trace-summary" class="trace-summary">Waiting to run</p>
            </div>
            <ol id="trace-list" class="trace-list">
              <li class="trace-empty">The vision output and each rewrite iteration will appear here.</li>
            </ol>
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
  const answerMeta = root.querySelector<HTMLParagraphElement>('#answer-meta');
  const answerText = root.querySelector<HTMLPreElement>('#answer-text');
  const traceSummary = root.querySelector<HTMLParagraphElement>('#trace-summary');
  const traceList = root.querySelector<HTMLOListElement>('#trace-list');
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
    !answerMeta ||
    !answerText ||
    !traceSummary ||
    !traceList ||
    !errorCard ||
    !errorText
  ) {
    throw new Error('The app UI failed to initialize.');
  }

  const renderTrace = (): void => {
    traceList.replaceChildren();

    if (state.traceSteps.length === 0) {
      const emptyItem = document.createElement('li');
      emptyItem.className = 'trace-empty';
      emptyItem.textContent = 'The vision output and each rewrite iteration will appear here.';
      traceList.append(emptyItem);
      return;
    }

    state.traceSteps.forEach((step, index) => {
      const item = document.createElement('li');
      item.className = 'trace-step';
      item.dataset.model = step.model;
      item.dataset.withinTarget = String(step.charCount <= ALT_TEXT_CHARACTER_LIMIT);

      const top = document.createElement('div');
      top.className = 'trace-step-top';

      const heading = document.createElement('div');
      heading.className = 'trace-step-heading';

      const title = document.createElement('p');
      title.className = 'trace-step-title';
      title.textContent = `${index + 1}. ${step.label}`;

      const modelTag = document.createElement('p');
      modelTag.className = 'trace-step-model';
      modelTag.textContent = step.model === 'vision' ? 'SmolVLM' : 'SmolLM2';

      const meta = document.createElement('p');
      meta.className = 'trace-step-meta';
      meta.textContent = step.charCount <= ALT_TEXT_CHARACTER_LIMIT
        ? `${step.charCount} chars • within target`
        : `${step.charCount} chars • above target`;

      const body = document.createElement('pre');
      body.className = 'trace-step-body';
      body.textContent = step.text;

      heading.append(title, modelTag);
      top.append(heading, meta);
      item.append(top, body);
      traceList.append(item);
    });
  };

  const render = (): void => {
    const busy = isBusyState(state.appState);

    statusText.textContent = state.status;
    progressBar.style.width = `${getVisualProgress(state.appState, state.traceSteps)}%`;
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
    previewOverlayText.textContent = busy ? state.status : 'Processing…';

    answerMeta.textContent = describeAnswer(state.answer, state.appState, state.traceSteps.at(-1));
    answerText.textContent = state.answer || 'The accepted alt text will appear here.';
    traceSummary.textContent = describeTraceState(state.traceSteps, state.appState);
    renderTrace();
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
    state.traceSteps = [];
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

      state.backend = result.backend as RuntimeBackend;
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
