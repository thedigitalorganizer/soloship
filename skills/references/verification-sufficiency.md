# Verification Sufficiency — the verification-sufficiency contract

<!-- concern:verification-sufficiency (reference — single source of truth for this concern) -->

## The problem this solves

Current-generation models (the Claude 5 family onward) verify their own work
without being told. Soloship's gates already mandate specific evidence — the
Iron Law's fresh command output, the Scope Ledger's three columns, the Touch
Map's resolved rows, the QA Plan's per-surface runs. An eager model runs the
mandated evidence *and then keeps going*: a second test pass over code that
didn't change, a reviewer subagent to double-check a ledger that's already
resolved, a re-audit of a claim whose evidence is minutes old and untouched.
The gate and the instinct stack, and the run pays twice for one assurance.

## The contract

**The gate's named evidence, once produced for the current state, is
sufficient — stacking more on top is scope creep, not rigor.**

- When a gate's checklist is satisfied with evidence — the command ran, the
  output is shown, every ledger row is resolved — the gate is passed. Do not
  re-verify a claim whose underlying state has not changed since its evidence
  was produced.
- Do not add verification passes, reviewer dispatches, or audit layers beyond
  what the gate names. The gates define where verification lives; extra layers
  belong in the gate's definition (a change to propose to the user), not
  improvised per-run.
- Evidence mandated by another wired concern is part of the gate, not an
  addition — e.g. component-reuse's required Touch-Map row is mandated
  evidence, never "extra."

## Changed state still requires fresh evidence (counter-pressure)

This concern bans re-verifying **unchanged** state. It never weakens the
verification of **changed** state:

- The fix-and-re-verify loop stands in full. After ANY fix, re-execute the
  failing QA row and observe the fix working — each iteration verifies a *new*
  state, which is exactly what the Iron Law demands. Worked example:
  `/soloship:implement` Step 2.6 mandates re-driving a flow after every fix
  until every row passes clean; citing this concern to skip that re-run is the
  misread, and it is wrong.
- The Iron Law stands in full: no completion claim without fresh evidence *for
  the state being claimed*. If you edited anything after the last run, the
  state changed — run it again.
- If you find yourself citing verification-sufficiency to skip a mandated
  gate, ledger row, or QA Plan row, stop: this concern caps stacking, it never
  licenses skipping.

## Canonical pointer template

Wired skills paste this text at their anchor, immediately after the marker
comment. Keep it word-identical — the concerns fitness test checks the key
phrase in the second line:

```markdown
<!-- concern:verification-sufficiency -->
This gate's named evidence, once produced for the current state, is sufficient —
stacking further passes or reviewer dispatches on top is scope creep, not rigor.
A changed state (post-fix, post-edit) still requires fresh evidence; see
`references/verification-sufficiency.md`.
```

(Touchpoints inside a fix-and-re-verify loop may append one sentence — e.g.
"Each loop iteration verifies a new state and remains mandatory." — but the
template lines above stay verbatim.)

## Touchpoint update protocol (the meta-concern)

The manifest `skills/references/concerns.json` lists every skill carrying this
concern's marker; `__arch__/concerns.test.ts` enforces the mapping both ways
plus the template wording. Therefore:

- **Adding a touchpoint** = paste marker + template at the anchor AND add the
  skill to `concerns.json`, same commit.
- **Removing/moving a touchpoint** = update `concerns.json`, same commit.
- **A vendored-skill refresh that wipes a marker** turns `npm test` red — the
  fix is to re-apply the template from this file.
