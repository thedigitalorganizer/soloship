---
name: plan
description: |
  Soloship — Create an implementation plan with enforcement gates. Routes to ce-plan
  for the planning work itself. For review of the plan, /review handles
  engineering/CEO/design review separately. Searches solutions for prior
  art and validates plan compliance before completion.
---

# Soloship Plan

Your job is to create a thorough implementation plan that a fresh agent with
zero context can execute correctly.

## Step 0: Check for Grill-Me Rationale (and offer if missing)

Look for a sibling rationale doc at `docs/plans/YYYY-MM-DD-<slug>-grill.md` or
any recent `*-grill.md` file matching the topic.

**If a grill-me rationale exists:** Read it. It contains the premise, scope,
data model, edge cases, UX, and final scope decisions the user already made.
Pass this context to `ce-plan` so the plan inherits the rationale and doesn't
re-litigate settled questions.

**If no grill-me rationale exists AND the work is non-trivial:** Suggest
running it first.

> No grill-me rationale found for this work. For anything touching 5+ files,
> new infrastructure, data-model changes, or external integrations, run
> `/grill-me` first. The interview takes ~15-30 minutes and prevents the
> 3-revision review loop where scope cuts surface too late.
>
> Continue without grilling? (recommended only for small/mechanical work)

If the user says continue, proceed to Step 1. If the user opts to grill first,
exit and let `/grill-me` run.

## Step 1: Solution Search

Before planning anything, search `docs/solutions/` for prior art:
1. Grep for component names, file paths, and keywords related to this work
2. Search the entire directory — never limit to one category
3. If matches are found, read them and note any prevention strategies or pitfalls

Note: `ce-plan` also runs a `learnings-researcher`
agent that searches `docs/solutions/`. Doing it up front here makes the findings
explicit in the conversation before the CE workflow starts.

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

Invoke `ce-plan`. It handles repo research, learnings research, optional external research, and produces a plan file that follows project conventions. Works for all plan sizes from small features through architectural changes.

**Review is a separate step.** Do not invoke `gs-plan-eng-review`, `gs-plan-ceo-review`, or `gs-plan-design-review` from here — those are review lenses, not planning. After the plan is written and passes the enforcement gate below, `/review` handles reviewing it (or `/autoplan` for all three reviews at once).

## Artifact Contract (Plan Files)

CE's workflow writes to its own location (often `docs/plans/` or
`docs/brainstorms/` depending on phase). Regardless of which tool produced it,
the final plan file must live at `docs/plans/YYYY-MM-DD-<slug>.md` and start
with YAML frontmatter:
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

If CE wrote the plan elsewhere, move/rename it into `docs/plans/` and add the
frontmatter above so the rest of the Soloship workflow (implement, shipthorough,
cleanup) can find it.

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
| "CE's workflow already produced a plan, so I'm done" | CE produces a solid plan but doesn't know the Soloship artifact contract. Verify the file location, frontmatter, Execution Strategy, and Handoff section before declaring done. |

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
