---
name: autoplan
description: |
  Auto-review pipeline. Routes to gstack autoplan which chains CEO, design, eng,
  and DX reviews with auto-decisions. One command, fully reviewed plan.
  Use instead of running /review multiple times manually.
---

# Soloship Autoplan

Invoke the `autoplan` skill (gstack). It reads the CEO, design, eng, and DX
review skills and runs them sequentially, making routine decisions automatically
using 6 decision principles. Only taste decisions — close approaches, borderline
scope, disagreements — surface for your input at the end.

## When to Use

- You have a plan in `docs/plans/` and want it fully reviewed before building
- You'd normally run `/review` 3-4 times (eng, CEO, design) — this does all of
  them in one pass
- You want the reviews to make obvious decisions for you and only interrupt for
  the hard calls

## Before Starting

**Freshness check:** If the plan file has frontmatter with `date` and `ttl_days`,
check whether today exceeds date + ttl_days. If stale, warn before proceeding.

Confirm with the user:
1. Which plan file? (detect the most recent in `docs/plans/` or ask)
2. Any reviews to skip? (default: run all applicable)

## After Autoplan

The plan file should be updated with review findings and decisions. Present:

- Summary of auto-decisions made (and the principle behind each)
- Any taste decisions that need your call
- Final plan readiness: "Ready to implement" or "Needs [X] resolved first"

Then suggest next steps:
- "Plan is reviewed. Run `/implement` to start building."
- Or if issues remain: "Fix [specific items], then run `/implement`."

## When NOT to Use

- For code review (use `/review` directly — autoplan is for plans, not diffs)
- For a single-perspective review (just invoke `/plan-eng-review` etc. directly)
- When you want full interactive control over every decision (use `/review`
  with sequential reviews instead)

## Verification

Autoplan is not complete until ALL of these are true:

- [ ] Plan file identified and confirmed with user
- [ ] All applicable reviews ran (CEO, design, eng, DX if developer-facing)
- [ ] Auto-decisions listed with reasoning
- [ ] Taste decisions surfaced for user input (if any)
- [ ] Plan file updated with review outcomes
- [ ] Next step suggested (implement or fix)
