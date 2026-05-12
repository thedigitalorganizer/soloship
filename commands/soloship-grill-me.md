---
name: soloship-grill-me
description: Soloship — Relentless pre-plan interview that walks every branch of the design tree until user and agent share a complete mental model. Refuses to write a plan or any code until alignment is explicit. Use when about to plan something non-trivial, when user says "grill me", "interview me", "interrogate me", "stress test this", or before invoking /plan on medium-to-large work. Adapted from Matt Pocock's `grill-me` (MIT) — see `skills/vendored/pocock/` for original and attribution.
---

Invoke the `grill-me` skill from the Soloship plugin. Use the Skill tool with skill name `grill-me` and let it drive the workflow.

If the Skill tool cannot find `grill-me` by that exact name, read `${CLAUDE_PLUGIN_ROOT}/skills/grill-me/SKILL.md` directly (or fall back to `~/.claude/plugins/marketplaces/soloship/skills/grill-me/SKILL.md`) and execute its instructions as a complete workflow.

The skill file is the source of truth. Do not paraphrase or improvise — open it and follow it.
