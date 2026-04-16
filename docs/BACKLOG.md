# Soloship Backlog

Ideas and improvements to consider after Phase 7 (integration testing) and Phase 8 (documentation).

## v0.2 — After v0.1 Integration Testing

- [ ] **Python support for dependency tracking** — add pydeps or import-linter as alternative to madge for Python projects
- [ ] **PostToolUse auto-lint for Edit matcher** — currently only PostToolUse has Bash matcher for CHANGELOG check; the auto-lint for Edit|Write was conditional on linter detection but uses a separate matcher. Verify both fire correctly.
- [ ] **Customize architecture fitness functions from audit** — when /audit runs, it should generate project-specific ArchUnitTS rules (e.g., "pages don't import from services directly") and write them to `__arch__/fitness.test.ts`
- [ ] **Strip gstack preamble from cherry-picked skills** — write thin Soloship wrappers for qa, cso, design-review, retro that skip the 60-line gstack preamble and go straight to the skill logic
- [ ] **Soloship plugin registry** — instead of symlinking 16 individual skills, register as a proper Claude Code plugin via settings.json `enabledPlugins`

## v0.3 — Process Refinements

- [ ] **Workflow state file** — `workflow-state.json` tracking current phase, enabling the FileChanged hook pattern from the research for reactive phase awareness
- [ ] **Learnings search on SessionStart** — inject recent learnings from `.ai/learnings.jsonl` alongside dependency graph
- [ ] **Architecture registry auto-generation** — /shipthorough should auto-update REGISTRY.md from the git diff (same commit as code)
- [ ] **Publish to npm** — make `npx soloship init` work publicly
- [ ] **Interactive setup wizard** — guided prompts with explanations for non-coders ("Husky is like a bouncer — it checks your code before every commit")

## Future — Only If Proven Needed

- [ ] **Graqle integration** — when/if Graqle reaches v1.0 with independent reviews, use it instead of madge for dependency tracking
- [ ] **RepoMapper MCP** — token-budgeted, PageRank-weighted codebase summaries for large projects that outgrow madge
- [ ] **Cross-project learnings** — search learnings across all Soloship-enabled projects, not just the current one
- [ ] **Visual workflow dashboard** — web UI showing current phase, recent learnings, audit scores over time
