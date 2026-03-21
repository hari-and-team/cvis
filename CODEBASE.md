# Codebase Map

This is the quick orientation guide for the repository.

## Frontend (`src/`)

- `routes/+layout.svelte`
  - Top-level app composition (header, editor, right pane).
  - Calls compile/run and trace actions.
- `lib/components/`
  - UI modules (`EditorPane`, `RightPane`, `Visualizer`, `HeaderBar`).
- `lib/stores.ts`
  - Single, labeled state module for editor/execution/visualizer stores.
- `lib/layout/run-actions.ts`
  - Single action orchestration module for compile/run and trace.
- `lib/api.ts`
  - Backend HTTP client.

## Backend (`server/`)

- `index.js`
  - Process entrypoint and startup checks (GCC + server listen).
- `app.js`
  - Express composition (middleware, route registration, handlers).
- `routes/index.js`
  - Route module for `GET /health`, `POST /api/compile`, `POST /api/run`, `POST /api/trace`.
- `config/constants.js`
  - Limits and shared runtime settings.
- `lib/http/request-validation.js`
  - Request validation/normalization and safe error-message helper.
- `lib/compile-c.js`
  - GCC compilation service.
- `lib/run-binary.js`
  - Binary execution service with safety checks and limits.
- `lib/c-interpreter.js`
  - Interpreter-backed trace generation.
- `lib/gcc-path.js`
  - GCC discovery and startup verification.

## Design Rules

- Prefer fewer files with strong section labels over many tiny files.
- Keep route logic centralized unless complexity clearly demands splitting.
- Keep shared limits in `server/config/constants.js`.
- Keep side-effect services isolated in `server/lib/*`.
