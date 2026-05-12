---
module: Soloship Plugin
date: 2026-05-11
problem_type: best_practice
component: tooling
symptoms:
  - "Vendored skills call ~/.claude/skills/<plugin>/bin/* for telemetry, config, update checks"
  - "Vendored skills reference other skills by <plugin>:<name> namespace, breaking for users without that plugin"
  - "Vendored skill source code hardcodes external plugin install paths"
  - "Vendored skills invoke external agents via Task tool subagent_type"
  - "Vendored skills mention sibling skills we didn't vendor, creating dead links"
root_cause: incomplete_setup
resolution_type: workflow_improvement
severity: medium
tags: [vendoring, self-contained, plugin, dependencies, third-party, soloship]
---

# Vendor Plugin Skills Without External Dependencies

## Context

When Soloship vendors skills from other Claude Code plugins (Compound Engineering, Superpowers, Impeccable, ui-ux-pro-max, gstack), the vendored copies often retain runtime dependencies on the *source* plugin. A truly self-contained vendor pass has to find and remove all of them, or Soloship-only users hit broken paths, dead skill references, and missing-agent errors.

In the v0.1.1 self-containment pass (2026-05-11), we discovered this required auditing **five categories** of external references — not just the obvious ones. The first pass missed agent-tool dependencies and source-code hardcoded paths, which surfaced later as "why does this still need gstack installed?"

## The five categories of external references

Every vendored skill should be audited against all five categories. Missing any one means the skill isn't really self-contained.

### 1. Telemetry and binary preamble calls

Many plugins (especially gstack) inject a bash preamble at the top of every SKILL.md that calls `~/.claude/skills/<plugin>/bin/<plugin>-<command>` for config defaults, telemetry, update checks, brain sync, session tracking, and learnings storage. These look optional because they're wrapped in `|| true`, but they're load-bearing for features users see (telemetry recording, gbrain sync, upgrade prompts).

**Grep pattern:**
```bash
grep -rln "\.claude/skills/<plugin>/bin/\|<plugin>-config\|<plugin>-telemetry\|<plugin>-update-check\|<plugin>-slug\|<plugin>-brain\|<plugin>-learnings" skills/
```

**Resolution:** Strip every call. Where the call provided a value with a fallback (`$(<plugin>-config get foo 2>/dev/null || echo "default")`), inline the fallback as the only value. Where no fallback exists, delete the line and any conditional that depended on its output.

**Why strip rather than redirect:** Soloship has no equivalent telemetry pipeline, no config system, no gbrain sync. There's nothing to redirect *to*. Building Soloship equivalents would be re-implementing the plugin we're vendoring from.

### 2. Namespace cross-references to other skills

Vendored skills frequently invoke OTHER skills from the same source plugin using `<plugin>:<skill-name>` namespace. For example, `sp-writing-plans` (vendored Superpowers) referenced `superpowers:executing-plans`, `superpowers:subagent-driven-development`, `superpowers:using-git-worktrees`, and `superpowers:finishing-a-development-branch`. These assume the full source plugin is installed.

**Grep pattern:**
```bash
grep -rln "<plugin>:" skills/ | grep -v vendored/
```

**Resolution:** Two options, decide per case:
- **Vendor the referenced skill too**, then rewrite `<plugin>:<name>` → `<prefix>-<name>` (e.g., `superpowers:writing-plans` → `sp-writing-plans`). Use this when the referenced skill is REQUIRED for the vendored skill to work.
- **Strip the reference** if it's just a "see also" suggestion, not a load-bearing dependency.

**Iteration cost:** This often cascades. We vendored 5 Superpowers skills initially. Auditing them revealed they referenced 3 MORE Superpowers skills we hadn't vendored. Plan for two passes minimum.

### 3. Hardcoded plugin install paths

The compiled binary AND TypeScript source of long-running daemon-style skills (gs-browse is the canonical example) often hardcode `~/.claude/skills/<plugin>/` for fixtures, config files, and storage roots. These paths don't exist for users who only have the vendoring plugin installed.

**Grep pattern:**
```bash
grep -rln "\.claude/skills/<plugin>\|<PLUGIN>_HOME\|~/.<plugin>/" skills/
```

**Resolution:** Three options:
- **Runtime self-discovery** (preferred) — daemon resolves its own install location via `__dirname` (Node/TS) or `dirname "$0"` (bash). Works across all Claude Code plugin install paths (marketplace, direct install, project clones).
- **Hardcoded Soloship path** — `~/.claude/plugins/marketplaces/soloship/skills/<skill>/`. Faster to implement but breaks for non-marketplace installs.
- **Env var with fallback** — only if a config system exists to back it. Soloship doesn't, so this is dead abstraction.

**Critical gotcha:** Source-code edits are not enough. Compiled output (e.g., `dist/server-node.mjs`) bakes paths in at build time. You must rebuild the artifact after rewriting source. We hit this when v0.1.1 deleted gs-browse because rebuilding the 110MB binary was outside the self-containment pass's scope.

### 4. Agent / subagent_type dependencies

Easily missed. Skills can invoke other skills via the Skill tool, but they can also invoke AGENTS via the Task tool's `subagent_type` parameter. Example from sp-subagent-driven-development:

```
Task tool (superpowers:code-reviewer):
  Use template at requesting-code-review/code-reviewer.md
  ...
```

That's a reference to the `code-reviewer` agent shipped by the Superpowers plugin, not a skill. For Soloship-only users, the agent doesn't exist and the Task call fails.

**Grep pattern:**
```bash
grep -rln "Task tool (<plugin>:\|subagent_type.*<plugin>:" skills/
```

**Resolution:** Either vendor the agent (copy `agents/<name>.md` from the source plugin into Soloship's `agents/`) or rewrite the reference to use a generic Task call without a namespaced agent name.

**Why this is sneaky:** It's the only category not visible by grepping for skill names or plugin paths. You have to know about the Task-tool-subagent-type pattern. We missed it the first pass; surfaced only when reviewing the rewritten files.

### 5. Documentation mentions of unvendored sibling skills

Vendored skills often have prose like "After this, run `/investigate` to debug" or "Use `/canary` for post-deploy monitoring." These are routing suggestions in documentation, not load-bearing code. But for Soloship-only users, those slash-commands don't exist — clicking them does nothing, eroding trust in the plugin.

**Grep pattern:**
```bash
# List every unvendored skill name from the source plugin
# Then search vendored skills for mentions
grep -rln "/investigate\|/canary\|/freeze\|/guard\|/unfreeze\|/health" skills/<prefix>-*/
```

**Resolution:** Two options:
- **Strip the references** if Soloship doesn't have an equivalent (e.g., `/canary`, `/freeze` — gstack-only utilities)
- **Rewrite to vendored equivalent** if you DID vendor it under a prefix (e.g., `/office-hours` → `/gs-office-hours`)

## Verification — how to know you're done

After all five passes, run this comprehensive sweep:

```bash
cd <project-root>
echo "=== namespace refs ==="
grep -rln "compound-engineering:\|superpowers:\|gstack:\|impeccable:" skills/ src/ | grep -v vendored/
echo "=== plugin paths ==="
grep -rln "\.claude/skills/\(gstack\|compound-engineering\|superpowers\|impeccable\)" skills/ src/ | grep -v vendored/
echo "=== external binary calls ==="
grep -rln "gstack-config\|gstack-telemetry\|gstack-update-check\|gstack-slug\|gstack-brain\|gstack-learnings" skills/ src/ | grep -v vendored/
echo "=== unvendored slash refs ==="
# customize per source plugin
```

All four should return empty results. If any does, that category was incomplete.

**The honest test:** Install Soloship on a completely fresh machine (a different Mac with no other plugins). Exercise the vendored skills. Any "command not found", any "skill not available", any "agent does not exist" error reveals a leak.

## Why ad-hoc audit isn't enough

The first vendoring pass (2026-04-24) shipped Soloship with all 5 categories of leaks. v0.1.0 made it to npm with telemetry calls intact, dead namespace references, and a 139MB gs-browse skill that hardcoded gstack paths. Users could install Soloship and have it appear to work, but features quietly broke for anyone without the source plugins.

The lesson: **don't trust a vendoring pass that hasn't audited all five categories explicitly.** The categories are not visible from a single grep pattern. Each needs its own search and resolution strategy. A "looks done" vendor pass is almost certainly leaking at least one category.

## Prevention

1. **Audit checklist in every vendoring plan.** Any plan that vendors a skill from another plugin must explicitly check all 5 categories in its Verification section.
2. **Fresh-machine smoke test as the gate.** Plans that touch vendored skills must include a fresh-machine smoke test (different Mac, no source plugin installed) as the definition of done.
3. **Treat vendoring as multi-pass by default.** Plan for 2–3 iterations: initial vendor → category audit → fix the leaks → re-audit. Single-pass vendoring is a smell.
4. **When deleting is cheaper than fixing.** If a vendored skill has deep dependencies (gs-browse's 110MB binary), document the deletion in a follow-up plan rather than ship broken. v0.1.1's choice to delete gs-browse pending rebuild was the right call versus shipping a 139MB broken artifact.

## Cross-references

- See `docs/plans/archive/2026-04-24-vendored-skill-manifest.md` — the original vendoring plan that established the prefix convention (`ce-*`, `sp-*`, `im-*`, `uiux-*`, `gs-*`) and attribution archive
- See `docs/plans/2026-05-11-rebuild-gs-browse-for-soloship.md` — follow-up plan for re-vendoring gs-browse with paths fully translated
- See commit `1760d4d` (refactor: strip gstack external dependencies) — the v0.1.1 cleanup pass that hit all five categories
- See commit `2e8b123` (feat: vendor missing Superpowers skills + code-reviewer agent) — the agent-dependency discovery
