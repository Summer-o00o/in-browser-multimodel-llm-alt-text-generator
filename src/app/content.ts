import { ALT_TEXT_CHARACTER_LIMIT, MAX_REWRITE_LOOPS } from '../altTextConfig';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const INITIAL_STATUS = 'Checking runtime support…';
export const READY_STATUS = 'Image ready. Generate alt text when you are ready.';
export const EMPTY_ANSWER = 'The accepted alt text will appear here.';
export const EMPTY_TRACE = 'The vision output and each rewrite iteration will appear here.';
export const TRACE_PANEL_EXPLAINER =
  'Vision output comes first. Then each text-model pass is shown with its character count so you can see the shortening loop work step by step.';

export const ALT_TEXT_STRATEGY = [
  'Upload one image.',
  'SmolVLM first writes a fuller visual description.',
  `SmolLM2 then shortens that text in a loop until it reaches ${ALT_TEXT_CHARACTER_LIMIT} characters or we hit ${MAX_REWRITE_LOOPS} passes.`,
  'The trace panel shows every intermediate version so you can inspect the process.',
].join('\n');

export const ALT_TEXT_EXPLAINER = [
  'Alt text is a short description of an image used by screen readers and shown when images fail to load.',
  'Good alt text helps people understand the important visual content without seeing the image.',
  `A practical target is about ${ALT_TEXT_CHARACTER_LIMIT} characters or less so it stays concise and easy to scan.`,
].join('\n\n');

export const TRACE_EXPLAINER = [
  'Why there are multiple steps:',
  'We let the vision model describe the image freely first.',
  'Then we feed that text back into the text model over several passes, checking the character count after each one.',
  `The loop stops as soon as a rewrite fits within ${ALT_TEXT_CHARACTER_LIMIT} characters, or fails after ${MAX_REWRITE_LOOPS} passes.`,
].join('\n');

export const RUNTIME_WARNING = [
  'Local browser inference can take a while, especially on the first run while models download and initialize.',
  'On slower machines or browsers without stable WebGPU support, the tab may become unresponsive or crash during loading or generation.',
  'Desktop with WebGPU is strongly recommended.',
].join('\n\n');
