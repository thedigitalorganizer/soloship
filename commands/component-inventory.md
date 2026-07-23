---
name: component-inventory
description: Scans the codebase for UI components (React/Vue/Svelte) and generates docs/architecture/COMPONENTS.md — name, file, purpose, props, and usage sites per component, plus a "Possible duplicates" section for the user to decide on. Delta-updates an existing inventory. Use when asked "what components do we have", before UI work, or when a reuse decision needs data.
---

Invoke the `component-inventory` skill from the Soloship plugin. Use the Skill tool with skill name `component-inventory` and let it drive the workflow.

If the Skill tool cannot find `component-inventory` by that exact name, read `${CLAUDE_PLUGIN_ROOT}/skills/component-inventory/SKILL.md` directly (or fall back to `~/.claude/plugins/marketplaces/soloship/skills/component-inventory/SKILL.md`) and execute its instructions as a complete workflow.

The skill file is the source of truth. Do not paraphrase or improvise — open it and follow it.
