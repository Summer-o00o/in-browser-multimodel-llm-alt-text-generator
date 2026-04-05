export interface AppElements {
  imageInput: HTMLInputElement;
  runButton: HTMLButtonElement;
  statusText: HTMLParagraphElement;
  progressBar: HTMLDivElement;
  backendBadge: HTMLParagraphElement;
  previewEmpty: HTMLDivElement;
  previewImage: HTMLImageElement;
  previewOverlay: HTMLDivElement;
  previewOverlayText: HTMLSpanElement;
  answerMeta: HTMLParagraphElement;
  answerText: HTMLPreElement;
  traceSummary: HTMLParagraphElement;
  traceList: HTMLOListElement;
  errorCard: HTMLElement;
  errorText: HTMLParagraphElement;
}

function queryRequiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required UI element: ${selector}`);
  }

  return element;
}

export function getAppElements(root: HTMLDivElement): AppElements {
  return {
    imageInput: queryRequiredElement(root, '#image-input'),
    runButton: queryRequiredElement(root, '#run-button'),
    statusText: queryRequiredElement(root, '#status-text'),
    progressBar: queryRequiredElement(root, '#progress-bar'),
    backendBadge: queryRequiredElement(root, '#backend-badge'),
    previewEmpty: queryRequiredElement(root, '#preview-empty'),
    previewImage: queryRequiredElement(root, '#preview-image'),
    previewOverlay: queryRequiredElement(root, '#preview-overlay'),
    previewOverlayText: queryRequiredElement(root, '#preview-overlay-text'),
    answerMeta: queryRequiredElement(root, '#answer-meta'),
    answerText: queryRequiredElement(root, '#answer-text'),
    traceSummary: queryRequiredElement(root, '#trace-summary'),
    traceList: queryRequiredElement(root, '#trace-list'),
    errorCard: queryRequiredElement(root, '#error-card'),
    errorText: queryRequiredElement(root, '#error-text'),
  };
}
