# Image Alt Text Generator

An in-browser image-to-text model demo built with Vite, TypeScript, and `@huggingface/transformers`.

The app lets a user upload one image and generate a short alt-text sentence locally in the browser with `HuggingFaceTB/SmolVLM-256M-Instruct`.

## What It Does

- Runs a multimodal model in the browser
- Generates one concise alt-text sentence for an uploaded image
- Encourages a practical alt-text target of about 125 characters
- Uses `WebGPU` when available and falls back to slower `WASM`
- Blocks local inference on mobile devices because the model is too heavy and may crash mobile browsers

## Tech Stack

- Vite
- TypeScript
- `@huggingface/transformers`
- SmolVLM (`HuggingFaceTB/SmolVLM-256M-Instruct`)

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
- If `WebGPU` is unavailable, the app attempts a `WASM` fallback, which may be slow.
- Mobile Safari and Chrome are intentionally blocked because the local model load is likely to crash or be killed by memory limits.

## Alt Text Guidance

The app is designed to produce alt text that:

- focuses on the main subject
- mentions visible action when relevant
- includes important readable text only when clear
- stays concise enough to work well in an HTML `alt` attribute

The model prompt currently aims for a limit of about 125 characters.

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
- Browser support and performance depend heavily on `WebGPU`.
- This is a local browser demo, not a production-grade accessibility audit tool.
