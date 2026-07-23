---
name: cron
description: Management console for every automation a project owns — cron jobs, scheduled workers, local launchd/crontab jobs, and webhooks. Reads the automation registry, queries watchdog status, live-discovers unregistered automations, and troubleshoots anything dark. Also the build-time contract for registering new automations.
---

Invoke the `cron` skill from the Soloship plugin. Use the Skill tool with skill name `cron` and let it drive the workflow.

If the Skill tool cannot find `cron` by that exact name, read `${CLAUDE_PLUGIN_ROOT}/skills/cron/SKILL.md` directly (or fall back to `~/.claude/plugins/marketplaces/soloship/skills/cron/SKILL.md`) and execute its instructions as a complete workflow.

The skill file is the source of truth. Do not paraphrase or improvise — open it and follow it.
