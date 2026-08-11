---
name: fable
description: |
  Decide whether a task deserves Fable, build the goal brief Fable needs
  (completion condition, boundaries, verification, memory), then launch the
  run and harvest lessons afterward. Budget-aware: routes non-Fable-shaped
  work back to Opus and the standard Soloship harness.
args:
  - name: task
    description: The task or goal being considered for a Fable run (optional)
    required: false
---

## Host Compatibility

If you are running this skill in Codex, read `../references/codex-compatibility.md`
before following host-specific tool instructions.

# Fable Launch Brief

Fable is a different operating mode, not a faster Opus. It runs for hours
against a goal, delegates to parallel subagents, and self-verifies — **if** it
is launched with a complete goal and left alone. Launched like an Opus task
(step lists, close supervision, drip-fed context), it performs like an
expensive Opus. This skill exists to prevent that.

The skill has four stages. Move through them in order, but this is a
conversation, not a form: infer everything you can from the repo and the
request, and ask the user only for what you genuinely cannot know.

## Stage 1 — Qualify (the budget gate)

Fable costs roughly 2× Opus per token and burns Max-plan usage fast. Most
tasks should NOT run on Fable. Score the task honestly:

**Fable-shaped** (any two of these):
- A person would need days, not hours — or it spans many sessions today.
- Judgment-heavy: the hard part is decisions, not typing (architecture,
  migration strategy, root-causing across systems, large refactors).
- Cross-cutting: touches many files/subsystems whose interactions matter.
- Goal is clear but the path is genuinely ambiguous.
- Prior attempts on Opus stalled, looped, or needed constant correction.

**Not Fable-shaped** (route to Opus + the standard Soloship harness):
- Well-understood change with a known path, however large the diff.
- Routine CRUD, copy changes, config edits, dependency bumps.
- Anything the existing skills already execute reliably.

**Say the verdict out loud with the reasoning.** If it's not Fable-shaped,
recommend the model and skill that fit (usually Opus + `/soloship:plan` →
`/soloship:implement`) and stop here. Protecting the budget IS the skill
working, not the skill failing.

## Stage 2 — Build the brief

A Fable run needs six things. Draft all six yourself from the repo and the
request first, then present the draft and ask the user to correct only the
parts you flagged as guesses. One round of questions, not an interrogation.

1. **Goal and why.** What done looks like, who it's for, and what it enables.
   Fable performs measurably better when it knows the intent behind the
   request, not just the request.
2. **Completion condition** — four parts, all concrete:
   - *Measurable end state*: "all 240 call sites migrated and the old API
     deleted", not "improve the code".
   - *Verification method*: the commands, tests, or observations that prove
     it — and the QA Plan rows per `qa-plan-in-plans` (method matched to the
     work type).
   - *Constraints*: public API unchanged, no new dependencies, etc.
   - *Stopping limits*: when to stop and report instead of pushing on
     (e.g. "if the test suite can't be made green in 3 attempts on one
     module, isolate it and continue; report at the end").
3. **Boundaries.** Files/systems not to touch, actions requiring the user
   (deploys, anything under the billing gate, external messages), and what to
   do when tempted to expand scope: note it, don't do it.
4. **Effort.** `high` is the default. `xhigh` only when the task is truly
   capability-bound. If the task has big mechanical stretches, say in the
   brief that routine subtasks go to Sonnet subagents — that is the single
   biggest cost lever on a long run.
5. **Memory.** Name the files the run reads first and writes lessons to:
   `docs/solutions/` (prior art — search it, per `solution-search`),
   `.ai/learnings.jsonl` if present, and a per-run notes file
   `docs/plans/<brief-slug>.notes.md`. One lesson per entry, corrections and
   confirmed approaches alike; delete notes that turn out wrong.
6. **Check-in shape.** How the user wants to hear about progress
   (end-of-run only, or milestone pings), and that progress claims must be
   auditable against tool results from the session — no asserted status.

Write the brief to `docs/plans/YYYY-MM-DD-<slug>.md` with standard plan
frontmatter (`status: planned`, flipped to `in-progress` at launch). A brief
is a plan; every plan gate applies to it.

## Stage 3 — Launch

Assemble the launch prompt: the brief, then the Fable-mode preamble below,
verbatim. Then start the run — in this session if the user is handing the
task over now, or hand the user the assembled prompt to paste into a fresh
session if they prefer a clean context.

> **Fable-mode preamble (include with every launch):**
>
> Work autonomously toward the completion condition. When you have enough
> information to act, act — don't re-derive settled facts or survey options
> you won't pursue. Delegate independent subtasks to subagents and keep
> working while they run; use cheaper models for routine mechanical work.
> Establish a method for checking your own work and run it at the interval
> the brief names, using fresh-context subagents to verify against the
> completion condition rather than critiquing your own output in place.
> Before reporting progress, audit each claim against a tool result from
> this session; report only what you can point to evidence for, and say
> plainly what is not yet verified. Record lessons in the run-notes file as
> you learn them. Don't add features, refactor, or introduce abstractions
> beyond what the task requires. Pause for the user only for a destructive
> or irreversible action, a real scope change, or input only they can
> provide — otherwise finish, then report.

Do not bolt the full step choreography of other skills onto the launch. The
always-on rules (QA gates, plan lifecycle, evidence gates) still apply — they
are floors, and Fable handles floors well. What it doesn't need is a script
for the middle. Measured, not assumed: on identical tasks, step-choreographed
launches used ~1.9× the tool calls and ~43% more wall-clock than goal-brief
launches for identical acceptance-test scores — and the brief arms wrote
*more* regression tests, unprompted
(`docs/reports/2026-08-11-fable-brief-ab-experiment.md`). Choreography
overhead compounds with run length; on a multi-hour run it is the difference
between finishing on budget and not.

## Stage 4 — Harvest

When the run ends (either exit: complete with evidence, or stopped at a
limit):

1. Verify the completion condition yourself against the named verification
   method — fresh commands, not the run's own claims.
2. Move durable lessons from the run-notes file into `docs/solutions/` (and
   prune the notes file). This is what makes the *next* Fable run better;
   skipping it throws away the compounding.
3. Flip the brief's status (`done` / `blocked` with why), archive or delete
   per `plan-lifecycle`.
4. Note what the brief got wrong (a missing boundary, a vague stopping
   limit) and fix the template gap it exposed — in this skill file if the
   gap is general.

## Anti-rationalization table

| Temptation | Why it's wrong |
|---|---|
| "It's a big diff, so it's Fable-shaped" | Size isn't the test. A large mechanical migration with a known path runs fine — and far cheaper — on Opus. |
| "I'll skip the completion condition, the goal is obvious" | Without a measurable end state the run has no way to know it's done; that's how hours of budget vanish into polish. |
| "Fable is smart, it doesn't need boundaries" | Unstated boundaries aren't boundaries. Fable takes initiative; the brief is where initiative gets a fence. |
| "Run everything at xhigh to be safe" | Effort is the cost dial. `high` matches `xhigh` on most work; xhigh is for capability-bound problems only. |
| "The run said it's done, ship it" | Self-reported completion is the thing the evidence rules exist for. Verify with the brief's named method, fresh. |
