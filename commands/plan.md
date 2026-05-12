---
name: plan
description: Create an implementation plan with enforcement gates. Searches docs/solutions/ for prior art, reads architecture context, then runs the Compound-Engineering-derived plan-writing methodology. Review is separate — handled by /soloship:review (which dispatches CEO/eng/design/devex plan-review skills or autoplan for all-in-one).
---

Invoke the `plan` skill from the Soloship plugin. Use the Skill tool with skill name `plan` and let it drive the workflow.

If the Skill tool cannot find `plan` by that exact name, read `${CLAUDE_PLUGIN_ROOT}/skills/plan/SKILL.md` directly (or fall back to `~/.claude/plugins/marketplaces/soloship/skills/plan/SKILL.md`) and execute its instructions as a complete workflow.

The skill file is the source of truth. Do not paraphrase or improvise — open it and follow it.
