---
name: status
description: One read-only dashboard for "what's going on in this project" — active sessions, the plan board (every plan by status with progress), and deploy state (what's live vs what's merged and waiting). Use when asked "what's in flight", "what's the status", or at the start of a session in a busy repo.
---

Invoke the `status` skill from the Soloship plugin. Use the Skill tool with skill name `status` and let it drive the workflow.

If the Skill tool cannot find `status` by that exact name, read `${CLAUDE_PLUGIN_ROOT}/skills/status/SKILL.md` directly (or fall back to `~/.claude/plugins/marketplaces/soloship/skills/status/SKILL.md`) and execute its instructions as a complete workflow.

The skill file is the source of truth. Do not paraphrase or improvise — open it and follow it.
