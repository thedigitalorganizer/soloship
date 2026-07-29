# Delegation Discipline — Mandated Dispatches Are The Ceiling (Auto-Loaded)

## The Rule

**A skill's mandated dispatches are the ceiling, not the floor.**

Current-generation models (the Claude 5 family onward) reach for subagents far
more readily than the models these workflows were tuned on. Every dispatch
multiplies cost and latency: the subagent re-establishes context, re-explores,
reports back, and the controller re-reads the report. When a skill already
mandates a dispatch set — reviewer lenses, research pairs, per-batch workers —
an eager model adds *more* dispatches around them: an extra verification
subagent here, a parallel pair for a task one worker could do there. The
mandated orchestration and the model's instinct stack, and the run pays twice
for the same assurance.

## The Contract

- Run every dispatch the skill names — a fixed lens set, a review pair, a
  per-group worker requirement is the floor *and* the ceiling. Never collapse
  a mandated multi-dispatch set down to fewer.
- Do not add discretionary dispatches on top of the named set. No extra
  verification or review subagents beyond the roles the skill defines — review
  and verification happen where the skill puts them, not wherever an extra
  check would feel reassuring.
- Do not split one modest task across parallel workers. Parallel dispatch is
  for genuinely independent, sizeable tracks a skill fans out — not for
  dividing a single small job into pieces.
- Where a skill marks a dispatch **optional**, treat the option as a decision
  to make once, with a stated reason — not a default-yes.
- Brief a subagent precisely the first time, and commit to the delegation:
  never redo a subagent's work or re-derive its findings after it reports.

The only exemption is a skill whose explicit purpose is unbounded, dynamic
fan-out (maximum-coverage skills like `/soloship:deepen-plan`) — there,
breadth is the product and no ceiling exists by design.

## A capping rule is not a skipping license (counter-pressure)

This rule removes dispatches an agent *added on its own*; it never removes
dispatches a *skill mandates*. If you find yourself citing
delegation-discipline to skip a reviewer the skill names, to run one lens
where the skill lists six, or to answer "dispatch the task reviewer?" with
"unnecessary" — stop: that is the skipping misread, and it is wrong. When a
mandated dispatch genuinely seems wasteful, that is a finding to surface to
the user, not a license to skip.

## When This Triggers

- Any time a skill's workflow names a dispatch set (reviewer lenses, research
  pairs, per-batch workers) and you are tempted to add subagents around it.
- Any time you are about to dispatch a discretionary subagent for verification
  or review that no skill step names.
- Any time you are about to split one modest task across parallel workers.
- Any time you are tempted to cite this rule to skip a dispatch a skill
  mandates — that is the misread; run the dispatch, and surface the concern
  to the user instead.
