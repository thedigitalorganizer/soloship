---
name: plan
description: |
  Create an implementation plan with enforcement gates. Routes to writing-plans
  for standard features or plan-eng-review for architectural work. Searches
  solutions for prior art and validates plan compliance before completion.
---

# Soloship Plan

Your job is to create a thorough implementation plan that a fresh agent with
zero context can execute correctly.

## Step 1: Solution Search

Before planning anything, search `docs/solutions/` for prior art:
1. Grep for component names, file paths, and keywords related to this work
2. Search the entire directory — never limit to one category
3. If matches are found, read them and note any prevention strategies or pitfalls

## Step 2: Read Architecture Context (with Freshness Check)

If `docs/architecture/REGISTRY.md` exists, read it to understand:
- What components are in scope for this work
- What depends on them (blast radius)
- What decisions have been made about them

If `docs/audit/audit-findings.json` exists:
1. Check the `date` and `ttl_days` fields. If today exceeds date + ttl_days, warn:
   "Audit findings are N days old (expires after M days). Consider re-running /audit for current data."
2. Check if any findings relate to the components being modified.

## Step 3: Route to Planning Skill

Assess the scope:

**Standard feature** (< 5 files, clear scope, no architectural decisions):
→ Invoke `superpowers:writing-plans`

**Architectural work** (data flow changes, new services, schema changes, 5+ files):
→ Invoke `plan-eng-review` — it walks through architecture, data flow, edge cases,
test coverage, and performance interactively.

## Artifact Contract (Plan Files)

Plan files must start with YAML frontmatter:
```
---
date: YYYY-MM-DD
producer: soloship-plan
version: 1
status: Not started
ttl_days: 14
---
```

After writing, compute and insert content_hash (first 12 chars of SHA-256 of the body below frontmatter).

## Step 4: Enforcement Gate

After the plan is written to `docs/plans/YYYY-MM-DD-<slug>.md`, validate:

- [ ] Plan file exists in `docs/plans/`
- [ ] Each phase/step has a "Why:" line explaining motivation
- [ ] Key Decisions section exists with alternatives considered
- [ ] Execution Strategy section exists (Direct / Subagent / Agent Teams)
- [ ] Handoff section exists with next step and context for next agent
- [ ] No prior pitfalls from solution search left unaddressed
- [ ] All dependencies/contracts for touched files are accounted for

**If any check fails:** Fix it before declaring the plan complete. Do not
proceed to implementation with an incomplete plan.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "This is simple, I don't need to search solutions first" | Simple tasks on complex codebases still hit documented pitfalls. The search takes 10 seconds; re-discovering a known issue takes an hour. |
| "I'll add the Key Decisions section later" | Plans without Key Decisions get executed with implicit decisions that nobody can review. Later never comes. |
| "The scope is obvious, I don't need an Execution Strategy" | Without an explicit strategy, agents default to "just start coding." This is how 3-file changes become 12-file refactors. |
| "I'll skip the enforcement gate — the plan looks good" | The gate exists because plans always look good to their author. Check the boxes. Every unchecked box is a failure mode in execution. |
| "I don't need to read the architecture registry" | The registry tells you what depends on what you're changing. Skipping it means surprise breakage in components you didn't know existed. |

---

## Step 5: Suggest Next Step

After the plan passes validation:

> "Plan complete. Ready to implement? Run `/implement` to execute this plan,
> or `/review` to get an engineering review first."

For large plans (multiple phases, architectural decisions):
> "This is a substantial plan. Consider running `/review` for an engineering
> review before implementation."

## Verification

The plan is not complete until ALL of these are true:

- [ ] `docs/solutions/` was searched and results noted (even if no matches)
- [ ] Plan file exists at `docs/plans/YYYY-MM-DD-<slug>.md`
- [ ] Every phase/step has a "Why:" line
- [ ] Key Decisions section present with alternatives considered
- [ ] Execution Strategy section present (Direct / Subagent / Agent Teams)
- [ ] Handoff section present with next step for fresh agent
- [ ] All enforcement gate checks pass (Step 4 checklist — zero unchecked boxes)
