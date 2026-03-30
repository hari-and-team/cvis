# Agent Instructions (Autonomous Delivery Guide)

Read this file and `TODO.md` before making changes.

## 1) Product Purpose

The product is an educational C coding platform with:
- compile + run execution
- step tracing and a structure-aware visualizer
- terminal-style `scanf` input UX
- analysis and guided practice for DSA learning

Primary user type: learners who need compiler behavior and concept clarity at the same time.

## 2) Branch Model

Use branches with this intent:

| Branch | Purpose |
|---|---|
| `main` | stable, validated baseline |
| `beta` | staging and integration branch |
| `fix` | active implementation branch |

Unless explicitly told otherwise, do active work on `fix`, promote validated work to `beta`, and treat `main` as the release line.

## 3) Current Architecture Guide

### Frontend orchestration
- `/home/karthi/cvis/src/routes/+layout.svelte`
  - top-level app composition
  - wires editor, runtime actions, trace lifecycle, and right pane

### Runtime domain
- `/home/karthi/cvis/src/lib/runtime/actions.ts`
  - compile/run/trace orchestration
- `/home/karthi/cvis/src/lib/api.ts`
  - backend HTTP client
- `/home/karthi/cvis/src/lib/stores/runtime.ts`
  - runtime-specific store state

### Analysis domain
- `/home/karthi/cvis/src/lib/analysis/unified-analysis.ts`
  - unified analysis result assembly
- `/home/karthi/cvis/src/lib/analysis/behavior-features.ts`
  - behavior-level signal extraction
- `/home/karthi/cvis/src/lib/analysis/behavior-classifier.ts`
  - behavior-first classification

### Visualizer domain
- `/home/karthi/cvis/src/lib/visualizer/trace-normalization.ts`
  - normalized trace/runtime contract
- `/home/karthi/cvis/src/lib/visualizer/render-model.ts`
  - learner-facing render model generation
- `/home/karthi/cvis/src/lib/components/Visualizer.svelte`
  - visualizer composition root
- `/home/karthi/cvis/src/lib/components/visualizer/`
  - structure-specific renderers

### Right pane shell
- `/home/karthi/cvis/src/lib/components/RightPane.svelte`
  - shell only
- `/home/karthi/cvis/src/lib/components/right-pane/`
  - panel implementations
- `/home/karthi/cvis/src/lib/app-shell/right-pane/view-models.ts`
  - right-pane view-model shaping

### Backend runtime/compiler implementation
- `/home/karthi/cvis/server/index.ts`
  - server startup and transport mode
- `/home/karthi/cvis/server/app.ts`
  - middleware composition and route registration
- `/home/karthi/cvis/server/lib/http/`
  - request validation, response shaping, security middleware
- `/home/karthi/cvis/server/lib/compile-c.js`
  - GCC compilation service
- `/home/karthi/cvis/server/lib/run-binary.js`
  - one-shot binary execution
- `/home/karthi/cvis/server/lib/run-session.js`
  - interactive runtime sessions
- `/home/karthi/cvis/server/lib/c-interpreter.js`
  - trace execution
- `/home/karthi/cvis/server/lib/trace/`
  - trace helpers and error normalization

## 4) Active Engineering Priorities

Read `/home/karthi/cvis/TODO.md`.

Priority order:
1. execution isolation hardening
2. behavior-first code finder improvements
3. family-specific visualizer playback
4. teacher / mentor workflow foundation

## 5) Delivery Rules

1. Confirm current branch and uncommitted state with `git status`.
2. Implement one vertical slice at a time.
3. Keep runtime, analysis, and visualizer responsibilities separated.
4. Run `npm run lint` and `npm run build` after each meaningful slice.
5. Update `TODO.md`, `CODEBASE.md`, or `IMPLEMENTATION_ROADMAP.md` when architecture or priorities materially change.
6. Use scoped commit messages and avoid mixing unrelated concerns.

## 6) Testing Checklist

From `/home/karthi/cvis`:
- `npm run lint`
- `npm run build`
- `npm run doctor`

When backend/runtime behavior changes, also run:
- `npm run test:backend`
- `npm run smoke:prod`

Manual verification when relevant:
- compile and run in the Console tab
- `scanf` input behaves terminal-like
- trace playback stays coherent
- analysis stays stable while code changes

## 7) Notes on Generated / Local Files

Generated artifacts and local runtime logs should not be committed:
- `.svelte-kit/`
- `dist/`
- `vite.config.ts.timestamp-*.mjs`
- root `*.log` debug outputs such as `.backend*.log`, `.frontend*.log`, `.devall*.log`
