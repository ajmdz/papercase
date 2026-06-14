# Papercase

Papercase is a local-first desktop reader for building a personal EPUB and PDF library.

## Development

Install dependencies:

```sh
npm install
```

Run the app in development:

```sh
npm run dev
```

Run tests:

```sh
npm run test
```

Useful checks:

```sh
npm run typecheck
npm run lint
npm run format:check
npm run build
```

## Architecture Baseline

- Electron main process owns Node and filesystem access.
- The renderer runs with `contextIsolation` enabled and `nodeIntegration` disabled.
- Preload exposes a small typed API through `contextBridge`.
- React owns the visible library shell and uses CSS variables for initial design tokens.
