# Vendored from Compound Engineering

**Source:** [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin) by [Kieran Klaassen](https://github.com/kieranklaassen) (Every)
**License:** MIT — see `LICENSE` in this directory
**Version pinned:** 2.34.0

Thank you, Kieran, for building and open-sourcing this. The workflow architecture — brainstorm → plan → work → compound → review — is the backbone of how Soloship thinks about the engineering loop, and it's genuinely good.

## What Soloship vendors from CE (8 skills)

- `workflows/brainstorm/` — feature and approach exploration dialogue
- `workflows/plan/` — feature planning with research phases
- `workflows/work/` — plan execution with branching and QC
- `workflows/compound/` — solution-doc capture (the "what we learned" artifact)
- `workflows/review/` — multi-agent code review
- `document-review/` — polish brainstorm/plan docs between phases
- `deepen-plan/` — enrich a plan with parallel research agents
- `brainstorming/` — the principles skill that sits behind `workflows:brainstorm`

## What you get by installing the full CE plugin

Soloship only vendors the 8 skills above. CE ships **29 agents, 22 commands, and 19 skills** — including image generation, test-browser automation, feature-video recording, git worktree management, agent-native architecture, and specialized skills for Rails, TypeScript, and Python code review. If any of that sounds useful, install the full plugin:

```
/plugin marketplace add EveryInc/compound-engineering-plugin
/plugin install compound-engineering@every-marketplace
```

Full source: https://github.com/EveryInc/compound-engineering-plugin
