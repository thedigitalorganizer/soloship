---
name: implement
description: |
  Soloship — Execute an implementation plan. Routes to ce-work
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

## Step 1.5: Pre-Execution State Verification

**Required for every multi-phase plan, every phase, every time.** Plans embed
concrete factual claims about the codebase — version numbers, file paths,
identifier names, "is X done" assumptions — that are correct at write time and
can be wrong at execute time. Intervening commits land. The author guesses a
location without grepping. A prior phase changed something this phase depends on.

Before invoking `ce-work` or editing any file, spend ≤2 minutes grepping every
concrete assertion the phase you're about to execute makes:

- **Version constants:** plan says "bump CONST N → N+1"? Grep the constant.
  If it's already N+1 or N+2, the literal numbers are stale — bump from current.
- **File locations:** plan names a file path for a CSS variable, identifier,
  palette override, or alias? `grep -rn "<construct>" src/ functions/src/` and
  confirm it actually lives where the plan says.
- **Identifier renames:** plan assumes a prior phase renamed `OldName` to `NewName`?
  `git log --oneline -p -S "OldName"` across the touched files. Use the new name
  if the rename happened, the old name if it didn't.
- **"Is X done" assumptions:** plan assumes a prior phase did or did not do
  something? Grep for the artifact (renamed tab, deleted file) before re-doing it
  or before assuming it still needs to be done.

Cap at 2 minutes per phase. The point is to surface mismatches, not to re-derive
the plan.

**Document every delta in the phase handoff under "Plan-vs-reality adjustments
documented:".** Empty if none — empty *signals* that verification ran. Populated
with each delta if found. The next phase's executor reads the handoff and inherits
the corrected mental model.

If a project follows the auto-loaded `plan-materialization.md` rule, this step is
already mandated there; this skill restates it because it's the highest-leverage
discipline `/implement` can enforce. See
`docs/solutions/workflow-issues/plan-state-decay-during-multi-phase-execution-20260503.md`
(in any project that has compounded this learning) for surfaced incidents.

**Skip this step ONLY if** the plan is single-phase or the work is the trivial
1-2 step direct change documented in the Step 2 exception.

## Step 2: Route to Execution

Invoke `ce-work` with the plan file path as input.
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
| "I'll skip CE's workflow and just code it" | ce-work handles branch setup, clarification gates, and quality checks that are easy to forget when coding solo. Use it unless the change is genuinely trivial. |
| "I'll skip `/learn` — this was routine" | "Routine" work that needed a plan and an implementation skill is, by definition, not trivial. Capture what you learned. |

---

## Step 3: After Implementation

When implementation is complete:

1. If the work was non-trivial, suggest: "Run `/learn` to capture what you learned."
2. Then suggest: "Run `/shipfast` for a quick deploy or `/shipthorough` for full due diligence."

## Verification

Implementation is not complete until ALL of these are true:

- [ ] Plan file was read and understood before any code was written
- [ ] **Pre-execution state verification ran** (Step 1.5) and any deltas are documented in the phase handoff under "Plan-vs-reality adjustments documented:" (empty if none — empty signals verification ran)
- [ ] All tasks in the plan are addressed (completed or explicitly deferred with reason)
- [ ] Tests pass (`npm test` or equivalent — show the output)
- [ ] Build succeeds (`npm run build` or equivalent — show the output)
- [ ] No unrelated changes introduced (diff stays within plan scope)
