---
name: implement
description: |
  Execute an implementation plan. Routes to compound-engineering:workflows:work
  which reads the plan, sets up a working branch, and executes systematically
  while maintaining quality.
---

# Soloship Implement

Your job is to execute an existing plan. Do NOT start implementing without a plan
file in `docs/plans/`. If no plan exists, tell the user to run `/plan` first.

## Step 1: Find the Plan (with Freshness Check)

Look for the most recent plan file in `docs/plans/` that isn't archived.
Read it completely — understand the phases, tasks, key decisions, and execution
strategy.

**Freshness check:** If the plan has frontmatter with `date` and `ttl_days`,
check whether today exceeds date + ttl_days. If stale, warn:
"This plan is N days old (expires after M days). Verify it still reflects current
intent before executing." Do not block — warn and proceed.

## Step 2: Route to Execution

Invoke `compound-engineering:workflows:work` with the plan file path as input.
It will:
- Read the plan completely and clarify ambiguities before starting
- Set up the correct branch
- Execute the plan systematically while maintaining quality
- Ship complete features rather than half-built ones

The CE workflow handles both sequential and parallelizable work internally —
you do not need to separately choose "subagent-driven" vs "parallel agents."
Pass the plan as-is; if the plan's Execution Strategy section calls for
parallelism, surface that in your hand-off to CE so it can fan out.

**Exception — trivial changes:** If the plan truly describes a 1-2 step direct
change (typo fix, single-file tweak, obvious rename), skip the CE workflow and
implement it directly. The CE workflow has real setup overhead; don't pay it
for five-minute changes.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "I don't need a plan for this, it's straightforward" | If it were straightforward, you wouldn't be using `/implement`. No plan = no shared understanding of what "done" means. Run `/plan` first. |
| "I'll adjust the plan as I go" | Adjustments are fine — but update the plan file. An executed plan that doesn't match the written plan is worse than no plan at all. |
| "I'll skip CE's workflow and just code it" | CE:workflows:work handles branch setup, clarification gates, and quality checks that are easy to forget when coding solo. Use it unless the change is genuinely trivial. |
| "I'll skip `/learn` — this was routine" | "Routine" work that needed a plan and an implementation skill is, by definition, not trivial. Capture what you learned. |

---

## Step 3: After Implementation

When implementation is complete:

1. If the work was non-trivial, suggest: "Run `/learn` to capture what you learned."
2. Then suggest: "Run `/shipfast` for a quick deploy or `/shipthorough` for full due diligence."

## Verification

Implementation is not complete until ALL of these are true:

- [ ] Plan file was read and understood before any code was written
- [ ] All tasks in the plan are addressed (completed or explicitly deferred with reason)
- [ ] Tests pass (`npm test` or equivalent — show the output)
- [ ] Build succeeds (`npm run build` or equivalent — show the output)
- [ ] No unrelated changes introduced (diff stays within plan scope)
