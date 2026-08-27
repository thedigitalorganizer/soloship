# Recurrence Gate — Escape-Hatch Discipline (Auto-Loaded)

## What the gate does (mechanically, without your help)

A `PreToolUse` hook reads `.ai/learnings.jsonl` on every commit and blocks a
commit that matches a failure class already recorded there (1st recurrence =
block; 2nd+ = hard stop with full history). A `PostToolUse` complement records
script-issued commits that bypassed the block. **You are not asked to "check"
for recurrences — the hook does that deterministically.**

## The one thing this rule governs: the escape hatch

The gate stands down when `.ai/.recurrence-ack` exists. Write that file only
when you can state, in the ack line itself, why a one-off patch is correct
*this* time and a mechanical fix (a test, a hook, a structural constraint) is
not yet the right call — and prefer surfacing that judgment to the user.

The default response to a block is to escalate to a mechanical fix, not to
re-patch and ack. Trivially acking around it reintroduces the failure the
gate exists to stop.
