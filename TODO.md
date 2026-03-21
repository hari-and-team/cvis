# TODO

## Current Focus: Visualizer Fix + UX
- [ ] Keep trace highlight and editor viewport in sync (auto-scroll to active line).
- [ ] Ensure trace starts on the first executable frame (skip global-only frame when possible).
- [ ] Split `Compile` and `Run` so learners can validate compile success without executing.
- [ ] Keep tracing workflow inside `Visualizer` tab and return to edit mode after trace end.
- [ ] Harden empty-state rendering when trace data is partial or only contains globals.
- [ ] Add robust visualizer data contracts for list/array/stack/tree/graph rendering.

## Current Focus: Input + Terminal Emulation
- [ ] Make runtime input/output feel like a real C terminal session for learners.
- [ ] Validate `scanf` menu loops (prompt + typed input shown inline in output).
- [ ] Add more edge-case tests for interactive input (EOF, invalid input, long sessions).

## Deferred (Later)
- [ ] Adopt an Algorithm Visualizer style architecture:
  - split execution/tracer events from rendering
  - keep algorithm content/catalog separate from engine/runtime
  - standardize trace-event contracts between interpreter and UI
  - reference: https://github.com/algorithm-visualizer/algorithm-visualizer

## Planned: Mentor-Guided Learning Workflow
- [ ] Add account system with roles: `student`, `mentor`, `staff`.
- [ ] Support explicit student-to-mentor assignment so each learner has a designated guide.
- [ ] Let mentors/staff teach a concept and assign a curated problem path for that concept.
- [ ] Let students either choose problems manually or ask AI to select a personalized set.
- [ ] Add an AI Mentor tab that gives small milestones/checkpoints per problem.
- [ ] Keep AI guidance incremental to reduce overwhelm while solving LeetCode-style problems.
- [ ] Add mentor visibility dashboards: student progress, stuck points, milestone completion.

## Planned: AI Milestone Problem Support
- [ ] Build “problem decomposition” prompts for AI to generate step-by-step milestones.
- [ ] Add hint ladder modes: tiny hint, guided hint, deeper explanation.
- [ ] Add solve-flow checkpoints (input understanding, approach, implementation, validation).
- [ ] Add post-problem reflection prompts to reinforce DSA concepts.

## Data Safety (No Data Loss)
- [ ] Autosave code and milestone progress continuously.
- [ ] Restore session after reload/reconnect (last open problem + active milestone).
- [ ] Store local backup snapshot in browser storage for offline recovery.
- [ ] Add server sync conflict handling and recovery UI for edits from multiple devices.
