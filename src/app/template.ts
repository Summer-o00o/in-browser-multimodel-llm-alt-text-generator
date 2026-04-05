import { ALT_TEXT_CHARACTER_LIMIT } from '../altTextConfig';
import {
  ALT_TEXT_EXPLAINER,
  ALT_TEXT_STRATEGY,
  INITIAL_STATUS,
  RUNTIME_WARNING,
  TRACE_EXPLAINER,
  TRACE_PANEL_EXPLAINER,
} from './content';

export function buildAppTemplate(): string {
  return `
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
              <p id="status-text" class="status-value">${INITIAL_STATUS}</p>
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
                <p class="trace-explainer">${TRACE_PANEL_EXPLAINER}</p>
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
}
