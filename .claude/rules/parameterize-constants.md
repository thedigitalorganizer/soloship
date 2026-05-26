# Parameterize Values — No Magic Literals (Auto-Loaded)

## The Rule

When writing or changing code, give meaningful values a name. Pull numbers, URLs, keys, limits, timeouts, thresholds, file paths, repeated strings, and similar values into named constants, variables, or config — anything that has one definition and one place to change.

"Meaningful" = (a) appears more than once, (b) carries business meaning, or (c) someone might reasonably want to change it later. Trivial one-shot literals (loop indices, an obvious `0` or `1`, single-use formatting) stay inline.

## When You Encounter Un-Parameterized Values

This rule has two beats — the silent fix, then the explicit ask:

1. **The section you're already editing:** refactor it as part of your current change. Do not ask first — just do it. Extracting a literal into a named constant is part of the change, not a separate decision.
2. **Other places with the same problem:** finish your current task without touching them. Then, in your final report, list each location and ask whether to refactor those too. Example: "I parameterized `BASE_URL` in `api.ts`. The same hardcoded value also appears in `webhook.ts:42`, `health.ts:18`, and `tests/setup.ts:7` — want me to do those next?"
3. **After refactoring, verify:** confirm the named value is used everywhere the literal was, and that behavior is unchanged (run tests, re-read the diff, search for any remaining literal instances).

## Why

Named values are the line between maintainable software and software that decays. One definition to change beats hunting copies; a wrong copy left behind is a bug waiting to be found in production. The cost of naming a value now is seconds; the cost of fixing the wrong-copy bug later is hours. The maintainer has stated they always want the more thorough fix here — when uncertain, parameterize.

## Honest Limit

No mechanical hook can detect "this should have been a constant" — it's a judgment call. This rule is reloaded every session, but in very long editing sessions it can drift out of attention. If you've been editing for a while without checking, re-read it.

## When This Triggers

- Any time you write new code that contains a literal value matching the "meaningful" criteria above.
- Any time you read existing code while making a change and notice a literal that meets the criteria.
- Any time you copy-paste a value from one place to another — that's a parameterization opportunity by definition.
