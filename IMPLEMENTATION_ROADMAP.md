# Implementation Roadmap

This document is the working execution plan for changes on the `visualizer-fix` branch.
It turns the existing docs into a concrete order of work so each change lands as a clear
vertical slice.

## Working Rules

1. Finish one slice at a time.
2. Keep each slice scoped to one user-facing outcome.
3. Run `npm run lint` and `npm run build` after each completed slice.
4. Do not mark roadmap items complete until the behavior is verified.
5. Avoid mixing refactors with feature work unless they are required to ship the slice.

## Current Baseline

Status as of 2026-03-24:

- [x] Split `Compile` and `Run` into separate actions.
- [x] Invalidate the last compiled binary when the editor code changes.
- [x] Keep console messaging aligned with the new compile-then-run flow.

Primary files touched for the completed slice:

- `src/lib/layout/run-actions.ts`
- `src/routes/+layout.svelte`
- `src/lib/components/HeaderBar.svelte`
- `src/lib/components/RightPane.svelte`

## Phase 1: Core Runtime UX

### 1. Compile/Run Split
Status: done

Goal:
- Let learners validate compilation without executing the program.

Done when:
- `Compile` produces and stores a runnable binary.
- `Run` only executes the latest valid compile.
- Editing code invalidates stale binaries.

Verification:
- `npm run lint`
- `npm run build`

### 2. Terminal Session Fidelity
Status: done

Goal:
- Make runtime input and output feel like a real C terminal session.

Scope:
- `src/lib/components/RightPane.svelte`
- `src/lib/terminal/console-input.ts`
- `src/lib/layout/run-actions.ts`
- `server/lib/run-session.js`
- `server/routes/index.js`

Tasks:
- Keep prompts, typed input, and program output visually coherent in one transcript.
- Improve `scanf`-style interaction flow.
- Tighten interrupt and EOF behavior.
- Make long-running sessions feel stable and predictable.

Done when:
- Prompt text and typed input appear in the right order.
- Enter, EOF, and interrupt behavior are consistent.
- Simple interactive menu programs behave like a terminal session.

Verification:
- `npm run lint`
- `npm run build`
- Manual: run interactive `scanf` examples
- `node scripts/validate-run-session.mjs`

Delivered in this slice:
- richer backend run-session state for stop/timeout/output-limit handling
- safer terminal input queue behavior for blank lines and multiline paste
- improved interrupt and EOF handling
- repeatable runtime validation coverage for prompt/input/EOF flows

### 3. Interactive Input Edge Cases
Status: done

Goal:
- Harden the runtime against awkward learner flows.

Scope:
- `src/lib/terminal/console-input.ts`
- `src/lib/components/RightPane.svelte`
- `server/lib/run-session.js`

Tasks:
- Validate empty input submissions.
- Validate repeated prompts and menu loops.
- Validate long sessions and pasted multiline input.
- Validate EOF after partial input.

Done when:
- Edge-case sessions do not desync the transcript.
- Runtime controls recover cleanly after interruptions and EOF.

Verification:
- `npm run lint`
- `npm run build`
- Manual: multiline paste, repeated input loops, Ctrl+C, Ctrl+D
- `node scripts/validate-run-session.mjs`

Delivered in this slice:
- repeated prompt/menu-loop validation
- long multiline input session validation
- partial-input EOF completion fix
- runtime fallback ordering that preserves prompt visibility without hanging EOF flows

## Phase 2: Analysis Tab Intelligence

### 4. Technique Detection
Status: done

Goal:
- Show which DSA techniques the learner is using.

Scope:
- `src/lib/analysis/code-type-finder.ts`
- `src/lib/visualizer/program-intent.ts`
- `src/lib/components/RightPane.svelte`

Tasks:
- Surface detected techniques such as recursion, stack, queue, tree, graph, DP, and two pointers.
- Make detection reasons visible enough to teach, not just label.

Done when:
- Analysis shows clear detected technique cards.
- Signals are understandable to a learner reading them.

Verification:
- `npm run lint`
- `npm run build`
- Manual: sample linked list, recursion, graph, and DP snippets

Delivered in this slice:
- broader technique coverage across structures and algorithm patterns
- clearer learner-facing evidence labels for why detections matched
- stronger analysis snapshot and technique summaries in the Analysis tab

### 5. Complexity and Explanation Layer
Status: done

Goal:
- Explain time and space complexity in a way that matches the detected program sections.

Scope:
- `src/lib/analysis/code-type-finder.ts`
- `src/lib/components/RightPane.svelte`

Tasks:
- Improve per-section complexity summaries.
- Show why complexity estimates were chosen.
- Keep recommendations aligned with the detected section intent.

Done when:
- The dominant section shows useful time and space complexity.
- At least one explanation path tells the learner why the estimate was chosen.

Verification:
- `npm run lint`
- `npm run build`
- Manual: compare simple loops, nested loops, recursion, and graph traversal samples

Delivered in this slice:
- overall program-level time and space complexity summary
- section-level complexity reasoning alongside per-section estimates
- clearer complexity framing in the Analysis tab UI

## Phase 3: Data Safety

### 6. Conflict Recovery
Status: done

Goal:
- Prevent silent data loss when multiple drafts compete.

Scope:
- `src/routes/+layout.svelte`
- `src/lib/stores.ts`
- future sync UI surface

Tasks:
- Detect draft conflicts.
- Show a recovery banner or restore choice.
- Preserve local fallback state.

Done when:
- Competing draft state is surfaced instead of overwritten silently.

Verification:
- `npm run lint`
- `npm run build`
- Manual: simulate competing saved drafts

Delivered in this slice:
- competing-draft detection for another tab or window via storage events
- recovery banner with explicit keep-current vs load-newer choices
- backup preservation for the draft version not chosen

## Phase 4: Visualizer and Trace Architecture

### 7. Trace Contract Cleanup
Status: done

Goal:
- Separate execution/tracing contracts from rendering concerns.

Scope:
- `server/lib/c-interpreter.js`
- `src/lib/visualizer/trace-normalization.ts`
- `src/lib/components/Visualizer.svelte`

Tasks:
- Normalize trace event shapes.
- Reduce renderer-specific assumptions in the backend trace output.
- Make visualizer states easier to extend safely.

Done when:
- Trace data has a clearer normalized contract.
- Visualizer rendering is less dependent on special-case backend output.

Verification:
- `npm run lint`
- `npm run build`
- Manual: arrays, stack, list, and empty-trace cases
- `./server/test.sh`

Delivered in this slice:
- explicit structured runtime snapshots on trace steps via `runtime.globals`, `runtime.frames`, and `runtime.flatMemory`
- frontend trace normalization that prefers the structured contract and only falls back to legacy `memory` and `stackFrames`
- trace validation coverage for the new runtime snapshot contract

## Operating Sequence

Unless priorities change, the working order is:

1. Terminal session fidelity
2. Interactive input edge cases
3. Trace contract cleanup

Current status: all planned slices above are complete on `visualizer-fix`.

## Per-Slice Checklist

For every change:

1. Confirm the exact slice being implemented.
2. Touch the smallest set of files that can ship it cleanly.
3. Verify the feature locally with `npm run lint` and `npm run build`.
4. Summarize what changed, what was verified, and what stays next on the roadmap.
