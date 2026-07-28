# Delegation Discipline — the delegation-discipline contract

<!-- concern:delegation-discipline (reference — single source of truth for this concern) -->

## The problem this solves

Current-generation models (the Claude 5 family onward) reach for subagents far
more readily than the models Soloship's skills were tuned on. Every dispatch
multiplies cost and latency: the subagent re-establishes context, re-explores,
reports back, and the controller re-reads the report. When a skill already
mandates a dispatch set — reviewer lenses, research pairs, per-batch workers —
an eager model adds *more* dispatches around them: an extra verification
subagent here, a parallel pair for a task one worker could do there. The
mandated orchestration and the model's instinct stack, and the run pays twice
for the same assurance.

## The contract

**A skill's mandated dispatches are the ceiling, not the floor.**

- Run every dispatch the skill names — a fixed lens set, an Adversarial Review
  pair, a per-group worker requirement is the floor *and* the ceiling. Never
  collapse a mandated multi-dispatch set down to fewer.
- Do not add discretionary dispatches on top of the named set. No extra
  verification or review subagents beyond the roles the skill defines — review
  and verification happen where the skill puts them, not wherever an extra
  check would feel reassuring.
- Do not split one modest task across parallel workers. Parallel dispatch is
  for genuinely independent, sizeable tracks the skill fans out — not for
  dividing a single small job into pieces.
- Where a skill marks a dispatch **optional**, treat the option as a decision
  to make once, with a stated reason — not a default-yes.
- Brief a subagent precisely the first time, and commit to the delegation:
  never redo a subagent's work or re-derive its findings after it reports.

## Exemption test (who this concern does NOT bind)

Exempt only skills whose **explicit purpose is unbounded, dynamic fan-out** —
where no ceiling exists by design. Sole current member: `deepen-plan`
("discover every available agent and run them ALL… The goal is MAXIMUM
coverage, not efficiency"). Its breadth *is* the product; capping it would
break the skill.

Skills with a **fixed, named dispatch count** — even a large one — are not
exempt. They get wired, and the template's job there is to affirm the named
count as the ceiling.

## A capping rule is not a skipping license (counter-pressure)

This concern removes dispatches an agent *added on its own*; it never removes
dispatches a *skill mandates*. If you find yourself citing
delegation-discipline to skip a reviewer the skill names, to run one lens
where the skill lists six, or to answer "dispatch the task reviewer?" with
"unnecessary" — stop: that is the skipping misread, and it is wrong. When a
mandated dispatch genuinely seems wasteful, that is a finding to surface to
the user, not a license to skip.

## Canonical pointer template

Wired skills paste this text at their anchor, immediately after the marker
comment. Keep it word-identical — the concerns fitness test checks the first
line's key phrase:

```markdown
<!-- concern:delegation-discipline -->
This skill's mandated dispatches are the ceiling, not the floor — run the
dispatches it names, and do not add discretionary subagents on top (no extra
verification or review dispatches, no splitting one modest task across
parallel workers); see `references/delegation-discipline.md`.
```

(Touchpoints at a mandated multi-dispatch site may append one sentence
affirming the site's own count — e.g. "The lens set above is that ceiling." —
but the template lines above stay verbatim.)

## Vendored-anchor note

Most of this concern's touchpoints sit inside vendored upstream blocks — that
matches the component-reuse precedent and is accepted vendor-refresh risk by
design: a refresh that wipes a marker turns `npm test` red, and the fix is
re-pasting the template from this file, never deleting the manifest entry.

## Touchpoint update protocol (the meta-concern)

The manifest `skills/references/concerns.json` lists every skill carrying this
concern's marker; `__arch__/concerns.test.ts` enforces the mapping both ways
plus the template wording. Therefore:

- **Adding a touchpoint** = paste marker + template at the anchor AND add the
  skill to `concerns.json`, same commit.
- **Removing/moving a touchpoint** = update `concerns.json`, same commit.
- **A vendored-skill refresh that wipes a marker** turns `npm test` red — the
  fix is to re-apply the template from this file.
