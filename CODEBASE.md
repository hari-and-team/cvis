# Codebase Map

This is the quick orientation guide for the repository.

## Frontend (`src/`)

- `routes/+layout.svelte`
  - Top-level app composition and shell wiring.
  - Connects editor, runtime actions, trace lifecycle, and the right pane.
- `lib/runtime/`
  - Compile/run/trace orchestration and runtime-facing helpers.
- `lib/api.ts`
  - Backend HTTP client with transport and timeout handling.
- `lib/app-shell/right-pane/view-models.ts`
  - Right-pane view-model shaping and shared shell adapters.
- `lib/components/right-pane/`
  - Split right-pane panels for Console, Visualizer, Analysis, and Mentor.
- `lib/analysis/`
  - Unified analysis pipeline, behavior features, behavior classifier, reverse review, and dynamic analysis.
- `lib/visualizer/`
  - Trace normalization, code features, intent helpers, and render-model generation.
- `lib/components/visualizer/`
  - Structure-specific visualizer renderers.
- `lib/mentor/view-model.ts`
  - Guided-practice and mentor-facing view-model logic.
- `lib/stores/`
  - Domain-owned runtime, workspace, visualizer, mentor, and profile stores.

## Backend (`server/`)

- `index.ts`
  - Process entrypoint, transport mode selection, and startup checks.
- `app.ts`
  - Express composition and middleware wiring.
- `routes/index.ts`
  - Route registration only.
- `config/constants.js`
  - Limits and shared runtime settings.
- `lib/http/`
  - Request validation, route handlers, response shaping, shared HTTP types, and security middleware.
- `lib/compile-c.js`
  - GCC compilation service.
- `lib/run-binary.js`
  - Binary execution service with safety checks and limits.
- `lib/run-session.js`
  - Interactive runtime sessions.
- `lib/c-interpreter.js`
  - Interpreter-backed trace generation.
- `lib/trace/`
  - Trace snapshot and error-normalization helpers.
- `lib/gcc-path.js`
  - GCC discovery and startup verification.

## Design Rules

- Keep the app shell thin and domain-oriented.
- Keep runtime, analysis, visualizer, and mentor logic separated by responsibility.
- Keep route registration thin and move backend behavior behind service/helper modules.
- Keep shared limits in `server/config/constants.js`.
- Keep side-effect services isolated in `server/lib/*`.
