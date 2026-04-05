import { ALT_TEXT_CHARACTER_LIMIT } from '../altTextConfig';
import { EMPTY_ANSWER, EMPTY_TRACE } from './content';
import type { AppElements } from './dom';
import {
  describeAnswer,
  describeBackend,
  describeTraceState,
  getVisualProgress,
  isBusyState,
  type ViewState,
} from './state';

function renderTrace(state: ViewState, traceList: HTMLOListElement): void {
  traceList.replaceChildren();

  if (state.traceSteps.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'trace-empty';
    emptyItem.textContent = EMPTY_TRACE;
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
    meta.textContent =
      step.charCount <= ALT_TEXT_CHARACTER_LIMIT
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
}

export function renderApp(state: ViewState, elements: AppElements): void {
  const busy = isBusyState(state.appState);

  elements.statusText.textContent = state.status;
  elements.progressBar.style.width = `${getVisualProgress(state.appState, state.traceSteps)}%`;
  elements.backendBadge.textContent = describeBackend(state.backend);
  elements.backendBadge.dataset.backend = state.backend;
  elements.runButton.dataset.busy = String(busy);

  if (state.imageUrl) {
    elements.previewImage.src = state.imageUrl;
    elements.previewImage.hidden = false;
    elements.previewEmpty.hidden = true;
  } else {
    elements.previewImage.removeAttribute('src');
    elements.previewImage.hidden = true;
    elements.previewEmpty.hidden = false;
  }

  elements.previewOverlay.hidden = !busy;
  elements.previewOverlayText.textContent = busy ? state.status : 'Processing…';

  elements.answerMeta.textContent = describeAnswer(
    state.answer,
    state.appState,
    state.traceSteps.at(-1),
  );
  elements.answerText.textContent = state.answer || EMPTY_ANSWER;
  elements.traceSummary.textContent = describeTraceState(state.traceSteps, state.appState);
  renderTrace(state, elements.traceList);
  elements.errorCard.hidden = state.error.length === 0;
  elements.errorText.textContent = state.error;

  elements.runButton.disabled = busy;
  elements.imageInput.disabled = busy;
  elements.runButton.textContent =
    state.appState === 'loading'
      ? 'Loading model…'
      : state.appState === 'running'
        ? 'Generating…'
        : 'Generate alt text';
}
