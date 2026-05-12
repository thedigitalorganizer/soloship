# Vendored from Superpowers

**Source:** [Superpowers](https://github.com/obra/superpowers) by [Jesse Vincent](https://github.com/obra)
**License:** MIT — see `LICENSE` in this directory
**Version pinned:** 4.1.1

Thank you, Jesse, for the discipline skills. The "iron law — no fixes without root cause" and "evidence before claims" ideas are two of the most important habits Soloship tries to instill in agents working for non-coders, and they came from here.

## What Soloship vendors from Superpowers (9 skills)

- `systematic-debugging/` — the four-phase debugging discipline (investigate → analyze → hypothesize → implement), iron law enforced
- `test-driven-development/` — TDD discipline for implementation phases
- `brainstorming/` — intent exploration before any creative work
- `verification-before-completion/` — evidence before claiming work is done
- `writing-plans/` — plan authoring principles
- `executing-plans/` — runs a written implementation plan with review checkpoints
- `subagent-driven-development/` — dispatches independent implementation tasks to subagents
- `using-git-worktrees/` — sets up isolated git worktrees for parallel feature work
- `finishing-a-development-branch/` — guides the merge / PR / cleanup decision when implementation is complete *(renamed to `finish/` in Soloship; user-facing slash command is `/soloship-finish`)*

## What we deliberately did not vendor

- `using-superpowers` — auto-loads on every session via the Superpowers SessionStart hook (~1.1K tokens/session). Soloship's routers invoke skills by name, so the auto-invocation meta-layer isn't needed for us. Excluded to preserve token budget.

## What you get by installing the full Superpowers plugin

Superpowers ships several more skills than we vendor here — receiving-code-review, requesting-code-review, writing-skills, dispatching-parallel-agents, and more. If any of that sounds useful:

```
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```

Full source: https://github.com/obra/superpowers
