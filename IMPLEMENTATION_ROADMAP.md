# Implementation Roadmap

This document is the working execution plan for changes on the `fix` branch.
It records what has already landed in the integrated baseline and what should come next.

## Working Rules

1. Finish one slice at a time.
2. Keep each slice scoped to one user-facing outcome.
3. Run `npm run lint` and `npm run build` after each completed slice.
4. Do not mark roadmap items complete until the behavior is verified.
5. Avoid mixing refactors with feature work unless they are required to ship the slice.

## Integrated Baseline

The current baseline already includes:

- [x] Split `Compile` and `Run` into separate actions.
- [x] Runtime terminal fidelity improvements for `scanf`-style programs.
- [x] Interactive input edge-case hardening.
- [x] Structured trace runtime snapshots.
- [x] Analysis tab technique and complexity coverage.
- [x] Conflict recovery and session safety improvements.
- [x] Right-pane panel split and visualizer render-model groundwork.
- [x] Cross-platform bootstrap/toolchain and production smoke coverage.
- [x] Backend boundary hardening for validation, headers, rate limiting, and optional HTTPS support.

## Next Phases

### Phase 1: Execution Isolation
Status: next

Goal:
- Reduce the security and stability risk of running compiled learner programs.

Focus:
- tighten runtime isolation beyond timeout and output limits
- reduce filesystem and process exposure
- keep the current HTTP/API behavior stable while strengthening the execution boundary

Done when:
- compile/run uses a stronger execution sandbox or equivalent containment strategy
- isolation limits are documented and testable
- abusive programs fail cleanly without destabilizing the service

Verification:
- `npm run lint`
- `npm run build`
- `npm run test:backend`
- `npm run smoke:prod`

### Phase 2: Behavior-First Code Finder
Status: next

Goal:
- Classify DSA and algorithm patterns from behavior instead of fragile naming signals.

Focus:
- unify static and dynamic signals
- improve stack/queue/list/tree/sort/search classification under arbitrary function/variable names
- keep the primary path deterministic and lightweight

Done when:
- renamed or disguised examples still classify correctly from behavior
- analysis returns one stable learner-facing result contract
- runtime observations can strengthen or override weak static guesses

Verification:
- `npm run lint`
- `npm run build`
- manual samples for stack, queue, linked list, tree, sorting, searching, recursion, and graph cases

### Phase 3: Family-Specific Visualizer Playback
Status: next

Goal:
- Make the visualizer behave like a structure-aware learning tool instead of a generic runtime dump.

Focus:
- translate trace/runtime behavior into visual operations
- improve stack, queue, linked list, tree, sorting, searching, recursion, and graph playback
- keep learner-facing renderers distinct from raw trace state

Done when:
- the visualizer chooses structure-specific rendering paths reliably
- learner-facing operations are easier to follow than raw state diffs
- fallback raw state still exists for unsupported cases

Verification:
- `npm run lint`
- `npm run build`
- manual playback for at least stack, linked list, tree, and sorting cases

## Operating Sequence

Unless priorities change, the working order is:

1. execution isolation
2. behavior-first code finder
3. family-specific visualizer playback
4. teacher / mentor workflow foundation

## Per-Slice Checklist

For every change:

1. Confirm the exact slice being implemented.
2. Touch the smallest set of files that can ship it cleanly.
3. Verify the feature locally with `npm run lint` and `npm run build`.
4. Run deeper backend checks when runtime or transport behavior changes.
5. Summarize what changed, what was verified, and what stays next on the roadmap.
