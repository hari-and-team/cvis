# Agent Instructions (Autonomous Delivery Guide)

This document is the single source of context for autonomous agents working on this repo.
Read this file before making changes.

## 1) Product Purpose

The product is an educational C coding platform with:
- Compile + run execution
- Step tracing and visualizer
- Terminal-style `scanf` input UX
- Guidance-first learning roadmap (LeetCode-style practice + AI milestone coaching)

Primary user type: learners who need compiler behavior and concept clarity at the same time.

## 2) Branch Context and Ownership

Use branches with this intent:

| Branch | Purpose | Notes |
|---|---|---|
| `main` | stable baseline | production-safe foundation |
| `bug-fixes` | non-visualizer hardening + roadmap docs | contains editor/workflow fixes and modern UI roadmap notes |
| `visualizer-fix` | active visualizer + analysis engineering branch | current integration branch for visualizer, analyzer, and safety improvements |
| `beta-features` | product roadmap capture and beta planning | used to keep TODO/vision planning in sync |

Recent known commits:
- `main`: `5b29cde` (merge input-change-fix)
- `bug-fixes`: `dcc211e` (roadmap expansion), `4d54c01` (workflow fixes)
- `visualizer-fix`: `94a0ce3` (TODO roadmap sync), includes merged `main`
- `beta-features`: `d9f3fac` (TODO roadmap sync)

## 3) Why TODO Is Related to `beta-features`

`TODO.md` includes near-term engineering and beta roadmap ideas:
- visualizer hardening
- data safety
- mentor/AI learning flow
- milestone-driven problem solving

This roadmap was first curated for beta planning and then cherry-picked into `visualizer-fix` to keep implementation and planning aligned.
In short: `beta-features` is planning-first; `visualizer-fix` is implementation-first.

## 4) File Map (Where to Edit What)

### Frontend shell and orchestration
- `/home/karthi/cvis/src/routes/+layout.svelte`
  - app composition
  - compile/run and trace action wiring

### Left editor and tracing controls
- `/home/karthi/cvis/src/lib/components/EditorPane.svelte`
  - code editor UI
  - trace playback controls
  - current-line highlight and scroll sync

### Right panel tabs (output/visualizer/analysis)
- `/home/karthi/cvis/src/lib/components/RightPane.svelte`
  - tab container and panel-level UX
  - runtime terminal input capture in Output tab

- `/home/karthi/cvis/src/lib/components/right-pane-config.ts`
  - tab metadata and visualizer feature tags

### Visualizer renderer
- `/home/karthi/cvis/src/lib/components/Visualizer.svelte`
  - stack/list/array rendering
  - trace-step rendering rules
  - intent-to-mode routing

### Run + trace logic
- `/home/karthi/cvis/src/lib/layout/run-actions.ts`
  - compile/run session lifecycle
  - trace request + initial-step selection
  - stdin/EOF/interrupt runtime behavior

### Shared state
- `/home/karthi/cvis/src/lib/stores.ts`
  - svelte stores for editor/runtime/visualizer
  - right-pane tab + learning/progress + sync safety stores

### Program intent and code-type analysis
- `/home/karthi/cvis/src/lib/visualizer/program-intent.ts`
  - lightweight intent classifier (CPU-light)

- `/home/karthi/cvis/src/lib/analysis/code-type-finder.ts`
  - section-level type analysis
  - intent bands
  - LeetCode-style recommendation mapping + milestones

### Server runtime/compiler implementation
- `/home/karthi/cvis/server/lib/c-interpreter.js`
- `/home/karthi/cvis/server/lib/compile-c.js`
- `/home/karthi/cvis/server/lib/run-binary.js`
- `/home/karthi/cvis/server/lib/gcc-path.js`
- `/home/karthi/cvis/server/lib/run-session.js`

## 5) Active TODO Priorities

Read `/home/karthi/cvis/TODO.md`.

Priority order:
1. Visualizer Fix + UX
2. Input + terminal behavior edge cases
3. Data Safety (No Data Loss)
4. Mentor/AI workflow

## 6) Current Engineering Direction (Important)

When implementing "code type finder":
- Do section-level detection (not just full-file classification)
- Use lightweight CPU-safe analysis (rule-based + scoring)
- Do not add heavy models that hurt responsiveness
- Map type to curated LeetCode-style practice recommendations
- Provide milestone steps per recommended problem
- Render analysis in an engaging, animated but readable UI

When implementing "data safety":
- Autosave continuously
- Restore user session after reload
- Keep local backup snapshots for offline recovery
- Add conflict recovery hooks/UI for future server sync

## 7) Autonomous Implementation Playbook

Follow this exact order for autonomous execution:

1. Read `TODO.md` and this file.
2. Confirm current branch and uncommitted state with `git status`.
3. Implement one vertical slice at a time:
   - state/store updates
   - logic modules
   - UI integration
   - styles/animations
4. Run `npm run lint` and `npm run build` after each slice.
5. Update `TODO.md` checkboxes only when feature is truly working.
6. Commit scoped changes with clear messages.

## 8) Definition of Done (Per Feature)

### Visualizer hardening done when:
- trace starts from executable frame (not global-only)
- highlighted line and viewport stay aligned
- empty/partial trace states do not break UI

### Analyzer/type finder done when:
- each function/global section has intent label + confidence
- intent bands are visible in Analysis tab
- at least 3 recommended LeetCode-style problems shown
- each recommendation includes milestone checklist

### Data safety done when:
- code survives reload
- backup snapshots are created and recoverable
- conflict banner appears when competing draft is detected

## 9) Testing Checklist (must run)

From `/home/karthi/cvis`:
- `npm run lint`
- `npm run build`

Manual verification:
- compile and run in Output tab
- `scanf` input behaves terminal-like
- trace step playback works
- analysis tab updates live with code changes
- reload page and confirm draft recovery

## 10) Commit Conventions

Use scoped commit messages:
- `feat(analysis): ...`
- `feat(persistence): ...`
- `fix(visualizer): ...`
- `docs(instructions): ...`

Do not mix unrelated concerns in one commit.

## 11) Notes on Unwanted Files

Safe-to-delete generated artifacts:
- `.svelte-kit/`
- `dist/`
- `vite.config.ts.timestamp-*.mjs`

Do not delete source, config, or roadmap docs unless explicitly requested.

## 12) Current In-Progress Surface (`visualizer-fix`)

At the time of writing, active implementation work is centered around:
- `/home/karthi/cvis/src/lib/components/RightPane.svelte`
- `/home/karthi/cvis/src/lib/components/Visualizer.svelte`
- `/home/karthi/cvis/src/lib/components/EditorPane.svelte`
- `/home/karthi/cvis/src/lib/layout/run-actions.ts`
- `/home/karthi/cvis/src/lib/stores.ts`
- `/home/karthi/cvis/src/lib/analysis/code-type-finder.ts`
- `/home/karthi/cvis/src/lib/visualizer/program-intent.ts`
- `/home/karthi/cvis/TODO.md`

If an agent resumes this branch, start by validating these files first, then run lint/build, then continue with TODO priorities.
