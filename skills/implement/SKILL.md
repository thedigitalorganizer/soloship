---
name: implement
description: |
  Execute an implementation plan. Routes to subagent-driven development for
  sequential work or parallel agents for independent modules.
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

## Step 2: Route Based on Execution Strategy

The plan should have an **Execution Strategy** section. Follow it:

**"Direct implementation":**
Just do the work yourself. No orchestration overhead needed.

**"Subagent-driven" (sequential):**
Invoke `superpowers:subagent-driven-development`. This launches a fresh agent
per task with two-stage review.

**"Agent Teams" (parallel):**
Invoke `superpowers:dispatching-parallel-agents`. This launches multiple agents
working on independent modules simultaneously.

**If the plan has no Execution Strategy:**
Assess the work yourself:
- 1-2 tasks, simple scope → Direct implementation
- 3+ tasks, sequential dependencies → Subagent-driven
- 3+ tasks, independent modules with clear file ownership → Parallel agents

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "I don't need a plan for this, it's straightforward" | If it were straightforward, you wouldn't be using `/implement`. No plan = no shared understanding of what "done" means. Run `/plan` first. |
| "I'll adjust the plan as I go" | Adjustments are fine — but update the plan file. An executed plan that doesn't match the written plan is worse than no plan at all. |
| "The plan says subagent-driven but I'll just do it directly" | The execution strategy was chosen for a reason. Direct implementation on a multi-task plan means no review checkpoints and no parallelism. |
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
