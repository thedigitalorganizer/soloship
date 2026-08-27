---
name: bootstrap
description: |
  Configure project governance from audit findings or interactive questions.
  Creates/updates CLAUDE.md, AGENTS.md files, rules, and hooks tailored to the
  actual project. Use after /audit on existing projects, or standalone on new projects.
---

## Host Compatibility

If you are running this skill in Codex, read `../references/codex-compatibility.md` before following host-specific tool instructions. Claude Code should continue to use the Claude-specific tools and command wrappers described here.

# Soloship Bootstrap

You are configuring a project's governance infrastructure. Your job is to create
documentation, rules, and hooks that are tailored to THIS specific project — not
generic templates.

---

## Step 1: Determine Mode

Check if `docs/audit/audit-findings.json` exists.

**If it exists → Audit-Informed Mode:**
1. Read `docs/audit/audit-findings.json`
2. **Freshness check:** If the `date` and `ttl_days` fields show the artifact is past
   its expiration, warn: "Audit findings are N days old (expires after M days). Consider
   re-running /audit for current data." Proceed with a warning, don't block.
3. You already know: stack, conventions, components, gaps, scores, recommendations
4. Present a summary: "Based on the audit, here's what I'm going to set up:"
   - List each thing you'll create or update
   - Note what already exists and won't be overwritten
5. Ask: "Approve this setup, or want to adjust anything?"
6. Proceed on approval

**If it doesn't exist → Fresh Mode:**
1. Ask these questions one at a time:
   - "What does this project do? (one sentence)"
   - "Who uses it?"
   - "What's the most critical part of the codebase — the thing that must never break?"
   - "Any conventions you already follow that I should know about?"
2. Detect the stack from package.json / pyproject.toml / directory structure
3. Proceed with answers + detected info

---

## Step 2: CLAUDE.md

**If CLAUDE.md doesn't exist:** Generate one with:
- Project name and description (from audit or answers)
- Stack line
- **Audience note** (see below — always include in new CLAUDE.md files)
- Related Documentation table (point to all docs that exist)
- Project Structure (from actual file tree — run `ls` or `find`)
- Quick Commands (parse from package.json scripts)
- Key Files table (the 5-8 most important files based on import frequency or audit component map)
- Intent Layer (list all directories that have AGENTS.md)
- Cross-Cutting Contracts (from audit findings or placeholder)
- Global Invariants (from audit conventions or placeholder)
- Workflow section (Soloship default path: do the work; plan/review/implement/shipthorough only when asked or the work is load-bearing)

**Audience note (place directly after the stack line):**

```markdown
> **Audience note:** The maintainer of this project may not be a traditional coder — Soloship is built for people who ship software through AI agents. When explaining anything technical (architecture, protocols, tooling, tradeoffs), lead with a plain-English analogy before introducing jargon. Define a technical term once with its meaning, then use it freely. Default to recommendations with tradeoffs, not term-paper breakdowns.
>
> Be brief: lead with the conclusion, cut preamble and recap, length should track the question's actual complexity rather than fill space. Frame problems and decisions in product or user-experience terms — what behavior changes and why it matters — not implementation details. Never ask the maintainer to review code, judge technical correctness, or decide implementation specifics (data models, database structure, library choices); make those calls yourself and surface only choices that need their product judgment.
>
> If the maintainer signals they want the technical version ("go deeper," "show me the code"), switch registers. Otherwise, keep it concrete.
```

**If CLAUDE.md already exists:** Read it. Check for:
- Missing sections (add them)
- Missing audience note (add it right after the stack line or project description — this is a Soloship default)
- Stale project structure (update if audit shows it's wrong)
- Missing key files (add from audit component map)
- Do NOT overwrite existing content — only add what's missing

---

## Step 3: AGENTS.md Files

For each major source directory (identified by audit component map, or by scanning
the file tree):

**If AGENTS.md doesn't exist in that directory:** Create one with:
- Scope: what this directory owns (from audit or inferred from file contents)
- Contracts: what other code depends on from this directory
- Key Files: the important files in this directory and what they do

**If AGENTS.md already exists:** Leave it alone. It was written by someone who
knows the directory better than an automated tool.

**Guidelines:**
- Only create AGENTS.md for directories with 3+ source files
- Don't create them for config directories, test directories, or build output
- Each AGENTS.md should be 15-40 lines — brief and useful, not exhaustive

---

## Step 4: Rules

The 7 always-on safety rules come from `npx soloship init` / `upgrade`, not
from hand-written copies in this skill. Do not reinstall the retired planning
essays (`solution-search`, `plan-*`, `parameterize-constants`,
`component-reuse`, `delegation-discipline`, `verification-sufficiency`,
`browser-tooling-priority`, `qa-plan-in-plans`). Planning shape lives in
`/soloship:plan` and `AGENTS.md`.

**If init/upgrade has not been run:** run it (`--agent` matching this project).
Confirm the seven safety-floor files are present. Stop if they are missing.

**Install extra rules only from audit findings** (error handling, naming,
cross-cutting contracts, security at boundaries). Product facts belong here;
workflow coaching does not.

**Don't install:**
- Rules that fight existing conventions
- Rules for problems that don't exist in this codebase
- Retired Soloship workflow essays as always-on files
- More than a handful of *project-specific* extras (cognitive overload)

Check what rules already exist in `.claude/rules/`. Don't duplicate.

---

## Step 5: Automation Registry

Scaffold `docs/automations/registry.json` + `docs/automations/README.md`
(`npx soloship init` creates both; if init already ran, they exist).

**Seed it from what actually exists** — an empty registry in a project with
live automations is a false "all clear":

- If an audit ran and its Automation Surface Inventory (Agent 11) found
  automations, register each one: name, kind, where it runs, check-in
  mechanism, `maxSilenceMinutes` (~3× cadence, floor 60), troubleshoot
  pointer, and a `description` (optional but recommended — one plain-English
  sentence: what it does and why it matters).
- No audit? Do the quick discovery pass yourself: cron triggers in
  wrangler/vercel/CI configs, webhook receiver routes, and (when the project
  depends on the local machine) `ls ~/Library/LaunchAgents` / `crontab -l`.
- For each automation found, note its monitoring state. Unmonitored
  automations are findings — tell the user: *"N of your automations would
  fail silently today. `/soloship:cron` add mode wires them to a watchdog."*

The `automation-registry.md` rule (installed in Step 6 via init) makes the
contract stick: no new automation ships without a registry entry and an
observed first check-in; one watchdog, never per-job watchdogs.

Don't build watchdog infrastructure during bootstrap — registering what
exists is Step 5's whole job. Wiring check-ins and standing up a watchdog is
real feature work that goes through `/soloship:plan`.

## Step 5.5: Component Inventory (UI projects)

<!-- concern:component-reuse -->
If `docs/architecture/COMPONENTS.md` exists, read it before creating or
specifying UI components — reuse or extend an existing component on purpose
match, cite what you found, and apply the rule of three (see
`references/component-inventory.md`).

For projects with a UI (React/Vue/Svelte files present), make sure that
inventory exists — it's the data source every reuse checkpoint reads:

- If an audit ran, its Architecture Discovery agent already generated
  `docs/architecture/COMPONENTS.md`. Verify it's there.
- No audit? Scaffold it by running the `/soloship:component-inventory` skill
  (delta-update, marker-delimited — never overwrites user content outside the
  markers, matching bootstrap's never-overwrite contract).
- No UI in this project? Skip — say so explicitly.

The component-reuse convention in `AGENTS.md` makes the contract stick:
search + cite before creating any component, and extract a shared component
on the third use. `/soloship:component-inventory` is the data source.

---

## Step 6: Hooks + CI (via `npx soloship init`)

Check `.claude/settings.local.json` for existing hooks.

**If Soloship hooks are already installed** (`.soloship/version` exists):
- Verify they're still correct for the project
- Add project-specific hooks if the audit recommends them
- If the stamped version is older than the latest on npm, suggest the user run `npx soloship upgrade` to refresh

**If no hooks exist — run the canonical installer:**

First, check Node is available:

```bash
command -v node >/dev/null 2>&1 && command -v npx >/dev/null 2>&1 && echo "NODE_OK" || echo "NODE_MISSING"
```

**If `NODE_MISSING`:** Stop and message the user in plain English:

> "Soloship's full install needs Node.js. On Mac, the simplest way is:
> 1. Open Terminal
> 2. Paste: `brew install node` (and press Enter)
> 3. Wait for it to finish
> 4. Come back here and run `/soloship:bootstrap` again
>
> If you don't have Homebrew, install it first from https://brew.sh — one line, follow the prompts.
>
> Bootstrap is paused until Node is available. The slash commands you already have will keep working, you just won't have the file-level safety hooks or CI checks until Node + init runs."

**If `NODE_OK`:** Run `npx soloship init --skip-prompts` in the project root via the Bash tool. This is the canonical installer — it writes:
- Claude Code hooks (`.claude/settings.local.json`)
- The `.soloship/version` stamp (used by the daily update-check hook)
- The `.gitignore` for cache files
- The four core workflow rules
- GitHub Actions CI workflow + architecture fitness tests (TypeScript/JavaScript projects only, only if git is initialized)

Do not hand-write hooks into `.claude/settings.local.json` directly. The npm CLI is the source of truth; replicating it by hand causes drift.

After init runs, layer any project-specific tailoring on top (e.g., audit-driven rules from Step 4 that aren't part of the default set).

### Verify CI was installed (TS/JS projects only)

After init runs, if the project is TypeScript/JavaScript and has a git repo, verify CI files exist:

```bash
[ -f .github/workflows/ci.yml ] && echo "CI_OK" || echo "CI_MISSING"
[ -f __arch__/fitness.test.ts ] && echo "FITNESS_OK" || echo "FITNESS_MISSING"
```

If either is `MISSING` (and the project IS TS/JS + git), check whether the user actually wants CI. CI only adds value if the project pushes to GitHub. Ask:

> "Want GitHub Actions CI? It runs lint, tests, build, security scan, and architecture fitness checks on every push. Skip if you're not pushing to GitHub."

If yes, manually re-run `npx soloship init --skip-prompts` (it should pick up missing CI files) or report that init didn't generate them as expected.

---

## Step 7: Post-Bootstrap Nudge

Based on context, present the appropriate next step:

**If audit found critical issues:**
> "Setup complete. Your audit found [N] critical findings. Run `/plan` to address
> them before building new features on a shaky foundation."

**If this is a fresh project with no code:**
> "Setup complete. Before you start building, think through what you're making.
> Run `/brainstorm` to explore what you're building and why, then design what it
> looks like before you plan how to build it. The time you spend here saves 10x
> in rework later."

**If audit was clean (score 7+):**
> "Setup complete. Your codebase is in good shape. When you're ready for your
> next feature, start with `/brainstorm`."

---

## Common misreads

- "I'll use the template defaults, the project is standard" → no project is standard. Defaults that don't match the project's actual conventions create rules that fight the codebase. Read the audit or ask questions.
- "Existing AGENTS.md looks stale, I'll replace it" → stale AGENTS.md was written by someone who knew the directory. Update it, don't replace it — existing content has context you don't.
- "I'll add more than 8 rules to be thorough" → more rules mean less compliance; cognitive overload makes agents ignore all rules. Pick the 4-8 that matter most.
- "This directory only has 2 files, but it's important enough for AGENTS.md" → the 3-file threshold exists because AGENTS.md overhead exceeds value for tiny directories. Important directories will grow past 3 files when they need governance.
- "I'll skip the audit and go straight to bootstrap" → bootstrapping without audit data means guessing at conventions, components, and gaps. Audit-informed mode exists for a reason.

---

## Output Summary

When done, list everything that was created or updated:

```
Bootstrap complete.

Created:
  + CLAUDE.md (generated from [audit/answers])
  + src/components/AGENTS.md
  + src/services/AGENTS.md
  + .claude/rules/error-handling.md (from audit convention)

Updated:
  ~ .claude/settings.local.json (hooks verified)

Skipped (already exists):
  - CHANGELOG.md
  - .claude/rules/billing-confirmation-gate.md
  - src/contexts/AGENTS.md

[Post-bootstrap nudge]
```

## Verification

Bootstrap is not complete until ALL of these are true:

- [ ] CLAUDE.md exists and contains project-specific content (not just a template)
- [ ] AGENTS.md files created for directories with 3+ source files
- [ ] No existing AGENTS.md files were overwritten
- [ ] 7 safety-floor rules present in `.claude/rules/` (from init/upgrade, not hand-copied)
- [ ] No retired Soloship workflow essays reinstalled as always-on files
- [ ] Hooks verified in `.claude/settings.local.json`
- [ ] Output summary presented listing all created/updated/skipped items
- [ ] Post-bootstrap nudge shown
