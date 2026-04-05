# Image Alt Text Generator

An in-browser image-to-text demo built with Vite, TypeScript, and `@huggingface/transformers`.

The app lets a user upload one image and generate a short alt-text sentence locally in the browser with a two-stage pipeline:

- `HuggingFaceTB/SmolVLM-256M-Instruct` describes the image
- `HuggingFaceTB/SmolLM2-360M-Instruct` rewrites that description in a shortening loop until it fits the target length or the loop cap is reached

## What It Does

- Runs local multimodal and text-only models in the browser
- Generates one concise alt-text sentence for an uploaded image
- Rewrites the vision-model output in multiple text-model passes
- Shows the full vision output and every rewrite pass in the UI
- Uses `WebGPU` when available and falls back to slower `WASM`
- Blocks local inference on mobile devices because the model is too heavy and may crash mobile browsers

## Tech Stack

- Vite
- TypeScript
- `@huggingface/transformers`
- SmolVLM (`HuggingFaceTB/SmolVLM-256M-Instruct`)
- SmolLM2 (`HuggingFaceTB/SmolLM2-360M-Instruct`)

## Local Development

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

To test on another device on the same network:

```bash
npm run dev -- --host
```

## Runtime Notes

- Desktop browsers are the target environment.
- `WebGPU` is preferred for reasonable performance.
- First load can take a while because the models have to download and initialize in the browser.
- On slower machines, memory-constrained browsers, or weaker GPU/browser combinations, the tab may become unresponsive or crash while the models load or run.
- If `WebGPU` is unavailable, the app attempts a `WASM` fallback, which may be slow.
- The text rewrite model is loaded lazily after the vision model so the app keeps the current flow and only adds the second stage when needed for generation.
- Mobile Safari and Chrome are intentionally blocked because the local model load is likely to crash or be killed by memory limits.
- The deployed GitHub Pages build can still fall back to `WASM` if the browser does not expose `navigator.gpu`, the page is not treated as a secure context, or `navigator.gpu.requestAdapter()` fails on that origin.

## Alt Text Guidance

The app is designed to produce alt text that:

- focuses on the main subject
- mentions visible action when relevant
- includes important readable text only when clear
- stays concise enough to work well in an HTML `alt` attribute

The app now uses an iterative text-model rewrite loop, checking the output length after each pass and stopping when it fits the target or the maximum number of passes is reached.

## GitHub Pages Deployment

This repo includes a GitHub Actions workflow at [.github/workflows/deploy.yml](./.github/workflows/deploy.yml) for GitHub Pages deployment.

To make deployment work:

1. Push the repository to GitHub.
2. Open `Settings -> Pages`.
3. Set `Source` to `GitHub Actions`.
4. Push to `main` or re-run the workflow from the `Actions` tab.

The Vite base path is configured in [vite.config.ts](./vite.config.ts) to derive the repo name from `GITHUB_REPOSITORY`, so the built site works on standard GitHub Pages project URLs.

## Project Structure

```txt
src/
  app.ts          UI and app state
  modelClient.ts  browser runtime + model loading + inference
  main.ts         app bootstrap
  types.ts        shared types
public/
  favicon.svg
  icons.svg
.github/workflows/
  deploy.yml      GitHub Pages workflow
```

## Limitations

- The app depends on client-side model downloads, so first load can take time.
- Heavy local inference can still freeze or crash a browser tab on some machines even on desktop.
- Browser support and performance depend heavily on `WebGPU`.
- This is a local browser demo, not a production-grade accessibility audit tool.
