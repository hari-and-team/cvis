# TODO

## Current Focus: Visualizer Fix + UX
- [x] Keep trace highlight and editor viewport in sync (auto-scroll to active line).
- [x] Ensure trace starts on the first executable frame (skip global-only frame when possible).
- [x] Split `Compile` and `Run` so learners can validate compile success without executing.
- [x] Keep tracing workflow inside `Visualizer` tab and return to edit mode after trace end.
- [x] Harden empty-state rendering when trace data is partial or only contains globals.
- [x] Add robust visualizer data contracts for list/array/stack/tree/graph rendering.

## Current Focus: Input + Terminal Emulation
- [x] Make runtime input/output feel like a real C terminal session for learners.
- [x] Validate `scanf` menu loops (prompt + typed input shown inline in output).
- [x] Add more edge-case tests for interactive input (EOF, invalid input, long sessions).

## Current Focus: Analysis Tab Intelligence
- [x] Show detected DSA techniques used in the code (for example: linked list, graph, recursion, two pointers, stack, queue, dynamic programming).
- [x] Display estimated time and space complexity per section/function and for overall program behavior.
- [x] Show why each technique was detected (keywords/pattern signals) so learners understand the analysis.

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
- [x] Let students either choose problems manually or ask AI to select a personalized set.
- [x] Add an AI Mentor tab that gives small milestones/checkpoints per problem.
- [x] Keep AI guidance incremental to reduce overwhelm while solving LeetCode-style problems.
- [ ] Add mentor visibility dashboards: student progress, stuck points, milestone completion.

## Planned: AI Milestone Problem Support
- [ ] Build “problem decomposition” prompts for AI to generate step-by-step milestones.
- [ ] Add hint ladder modes: tiny hint, guided hint, deeper explanation.
- [ ] Add solve-flow checkpoints (input understanding, approach, implementation, validation).
- [ ] Add post-problem reflection prompts to reinforce DSA concepts.

## Data Safety (No Data Loss)
- [x] Autosave code and milestone progress continuously.
- [x] Restore session after reload/reconnect (last open problem + active milestone).
- [x] Store local backup snapshot in browser storage for offline recovery.
- [x] Add server sync conflict handling and recovery UI for edits from multiple devices.
