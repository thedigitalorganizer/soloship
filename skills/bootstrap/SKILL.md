---
name: bootstrap
description: |
  Configure project governance from audit findings or interactive questions.
  Creates/updates CLAUDE.md, AGENTS.md files, rules, and hooks tailored to the
  actual project. Use after /audit on existing projects, or standalone on new projects.
---

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
- Related Documentation table (point to all docs that exist)
- Project Structure (from actual file tree — run `ls` or `find`)
- Quick Commands (parse from package.json scripts)
- Key Files table (the 5-8 most important files based on import frequency or audit component map)
- Intent Layer (list all directories that have AGENTS.md)
- Cross-Cutting Contracts (from audit findings or placeholder)
- Global Invariants (from audit conventions or placeholder)
- Workflow section (Soloship workflow: THINK → PLAN → WORK → LEARN → SHIP)

**If CLAUDE.md already exists:** Read it. Check for:
- Missing sections (add them)
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

Install rules to `.claude/rules/` based on what the project needs.

**Always install (core methodology):**
- `solution-search.md` — search docs/solutions/ before planning
- `plan-materialization.md` — write plan files immediately after planning
- `plan-rationale.md` — every plan needs Key Decisions and Why lines
- `plan-lifecycle.md` — archive or delete plans after completion

**Install if audit findings suggest them:**
- If audit found a consistent error handling pattern → create a rule enforcing it
- If audit found naming conventions → create a rule documenting them
- If audit found cross-cutting contracts → create a rule listing them
- If audit found security patterns (e.g., always validate input at boundaries) → create a rule

**Don't install:**
- Rules that fight existing conventions
- Rules for problems that don't exist in this codebase
- More than 8 rules total (cognitive overload)

Check what rules already exist in `.claude/rules/`. Don't duplicate.

---

## Step 5: Hooks

Check `.claude/settings.local.json` for existing hooks.

**If Soloship hooks are already installed** (from `npx soloship init`):
- Verify they're still correct for the project
- Update the madge/dependency graph hook if the source directory isn't `src/`
- Add project-specific hooks if the audit recommends them

**If no hooks exist:**
- Install the Soloship hook set (same as what `npx soloship init` creates)
- Adapt to the detected stack

---

## Step 6: Post-Bootstrap Nudge

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

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "I'll use the template defaults, the project is standard" | No project is standard. Defaults that don't match the project's actual conventions create rules that fight the codebase. Read the audit or ask questions. |
| "Existing AGENTS.md looks stale, I'll replace it" | Stale AGENTS.md was written by someone who knew the directory. Update it, don't replace it. Existing content has context you don't. |
| "I'll add more than 8 rules to be thorough" | More rules = less compliance. Cognitive overload makes agents ignore all rules. Pick the 4-8 that matter most. |
| "This directory only has 2 files, but it's important enough for AGENTS.md" | The 3-file threshold exists because AGENTS.md overhead exceeds value for tiny directories. Important directories will grow past 3 files when they need governance. |
| "I'll skip the audit and go straight to bootstrap" | Bootstrapping without audit data means guessing at conventions, components, and gaps. Audit-informed mode exists for a reason. |

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
  - .claude/rules/solution-search.md
  - src/contexts/AGENTS.md

[Post-bootstrap nudge]
```

## Verification

Bootstrap is not complete until ALL of these are true:

- [ ] CLAUDE.md exists and contains project-specific content (not just a template)
- [ ] AGENTS.md files created for directories with 3+ source files
- [ ] No existing AGENTS.md files were overwritten
- [ ] 4 core rules installed in `.claude/rules/`
- [ ] Total rules ≤ 8
- [ ] Hooks verified in `.claude/settings.local.json`
- [ ] Output summary presented listing all created/updated/skipped items
- [ ] Post-bootstrap nudge shown
