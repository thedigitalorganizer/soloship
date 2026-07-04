# Recurrence Gate — Escape-Hatch Discipline (Auto-Loaded)

## What the gate does (mechanically, without your help)

A `PreToolUse` hook reads `.ai/learnings.jsonl` on every commit and blocks a
commit that matches a failure class already recorded there (1st recurrence =
block; 2nd+ = hard stop with full history). A `PostToolUse` complement records
script-issued commits that bypassed the block. **You are not asked to "check"
for recurrences — the hook does that deterministically.** This rule is not a
reminder to look; looking is automated on purpose.

## The one thing this rule governs: the escape hatch

The gate stands down when `.ai/.recurrence-ack` exists. That file is the
escape hatch, exactly like `.ai/.billing-ack`. It exists for the genuine case
where a patch really is correct *this* time and a mechanical fix is not yet
possible.

**Writing `.ai/.recurrence-ack` to make the block go away — without a real,
written reason that a mechanical fix is genuinely not the right call here —
defeats the entire instrument and violates this rule.** The block is telling
you the same thing was patched before; the correct default response is to
escalate to a *mechanical* fix (a hook, a test, or a structural change that
makes the failure impossible to recur), not to re-patch and ack.

Only write the ack when you can state, in the ack line itself, why a one-off
patch is correct and a mechanical fix is not — and prefer surfacing that
judgment to the user over deciding it silently.

## Why

The value here is cross-session pattern detection that survives `/clear`.
Trivially acking around it reintroduces exactly the failure it removes: the
same non-fix, applied again, with no one noticing it is the second (or third)
time. The hook is the floor; this rule is the anti-gaming clause on its only
bypass.
