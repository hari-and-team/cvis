# TODO

## Current Branch Model

- `main`: stable, validated baseline
- `beta`: staging and integration branch
- `fix`: active implementation branch

## Current Focus

- [ ] Execution isolation hardening for compile/run
  - tighten process sandboxing beyond time/output limits
  - reduce blast radius for compiled program execution
  - document the secure production deployment shape clearly
- [ ] Behavior-first code finder
  - classify stack/queue/list/tree/sort/search from behavior, not naming
  - merge static and runtime signals into one clear result
  - keep the primary path deterministic and lightweight
- [ ] Family-specific visualizer playback
  - map runtime/trace behavior into structure-specific visual operations
  - improve learner-facing playback for stack, queue, linked list, tree, sorting, searching, recursion, and graph cases
  - keep raw state available as fallback, but not as the primary experience

## Next Product Work

- [ ] Teacher and mentor workflow foundation
  - student / mentor / staff account roles
  - mentor assignment and progress visibility
  - concept-guided problem paths and review workflow
- [ ] Guided practice improvements
  - better milestone decomposition
  - better hint ladder modes
  - clearer post-problem reflection and concept reinforcement

## Repo Hygiene

- [x] Remove tracked local runtime log artifacts and ignore them going forward
- [x] Sync branch workflow docs to `main` / `beta` / `fix`
- [ ] Keep roadmap and codebase docs aligned as new structural work lands
