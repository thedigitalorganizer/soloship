# Verification Sufficiency — Named Evidence Is Enough (Auto-Loaded)

## The Rule

**The gate's named evidence, once produced for the current state, is sufficient —
stacking more on top is scope creep, not rigor.**

Current-generation models (the Claude 5 family onward) verify their own work
without being told. This project's gates already mandate specific evidence —
fresh command output before any completion claim, the QA Plan's per-surface
runs, the browser-QA gate's observed flows. An eager model runs the mandated
evidence *and then keeps going*: a second test pass over code that didn't
change, a reviewer subagent to double-check a checklist that's already
resolved, a re-audit of a claim whose evidence is minutes old and untouched.
The gate and the instinct stack, and the run pays twice for one assurance.

## The Contract

- When a gate's checklist is satisfied with evidence — the command ran, the
  output is shown, every ledger row is resolved — the gate is passed. Do not
  re-verify a claim whose underlying state has not changed since its evidence
  was produced.
- Do not add verification passes, reviewer dispatches, or audit layers beyond
  what the gate names. The gates define where verification lives; extra layers
  belong in the gate's definition (a change to propose to the user), not
  improvised per-run.
- Evidence another always-on rule mandates is part of the gate, not an
  addition — e.g. a QA Plan row's per-surface run is mandated evidence, never
  "extra."

## Changed state still requires fresh evidence (counter-pressure)

This rule bans re-verifying **unchanged** state. It never weakens the
verification of **changed** state:

- The fix-and-re-verify loop stands in full. After ANY fix, re-execute the
  failing QA row and observe the fix working — each iteration verifies a *new*
  state, which is exactly what evidence-before-claims demands. Citing this
  rule to skip that re-run is the misread, and it is wrong.
- No completion claim without fresh evidence *for the state being claimed*.
  If you edited anything after the last run, the state changed — run it again.
- If you find yourself citing verification-sufficiency to skip a mandated
  gate, ledger row, or QA Plan row, stop: this rule caps stacking, it never licenses skipping.

## When This Triggers

- Any time a gate's checklist is fully satisfied with shown evidence and you
  are tempted to add another pass, reviewer dispatch, or audit layer anyway.
- Any time you are about to re-verify a claim whose underlying state has not
  changed since its evidence was produced.
- Any time you are tempted to cite this rule to skip a re-run after a fix or
  edit — changed state requires fresh evidence; run it again.
