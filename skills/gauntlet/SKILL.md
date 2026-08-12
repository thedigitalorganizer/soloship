---
name: gauntlet
description: |
  Design and run a blind bake-off comparing models (Opus, Sonnet, Fable,
  Codex/GPT, Grok) with and without the Soloship harness on one sealed task.
  Independent judges score anonymized diffs, mechanical acceptance tests score
  correctness, and nothing is ever merged — you pick the winner.
args:
  - name: task
    description: The task to use as the course (optional; the skill will help design one)
    required: false
---

## Host Compatibility

If you are running this skill in Codex, read `../references/codex-compatibility.md`
before following host-specific tool instructions.

# Gauntlet

A gauntlet answers questions that opinion cannot: *is Opus actually better than
Sonnet on my work? Does Soloship earn its keep, or is it overhead? Is Codex or
Grok faster for the same quality?*

One sealed task. Many agents attempt it independently. Hidden tests score
correctness, blind judges score craft, and you merge whichever branch you
like — **the tool has no merge path at all**.

**Announce at start:** "I'm using the gauntlet skill to set up a blind
model bake-off."

## Model posture

Every gate in this skill is binding in both postures (see the `model-mode`
rule). The gates are: the **calibration gate** (Stage 3), the **blinding
gate** (Stage 5 — a leaked submission stops the review), the **QA Plan** for
any code you change, and the **never merge** rule in Stage 7. Everything else
— the order you draft the brief in, how you word the questions — is
choreography.

## The vocabulary

| Term | What it is |
|---|---|
| **Course** | The sealed task: a brief, hidden acceptance tests, a reference solution, and trap files. |
| **Arm** | One attempt: `model × condition × rep`. `opus5-harnessed-r2` is one arm. |
| **Condition** | `harnessed` (Soloship loaded and invoked) or `bare` (all customizations off). The variable under test. |
| **Rep** | A repeat of the same cell. Three is the default, because one run cannot tell a model difference from luck. |
| **Codename** | What judges see instead of a model name. |

## Stage 1 — Decide whether a gauntlet is the right instrument

A gauntlet costs real money and hours: arms × models × conditions × reps, each
a full agent run, plus a judging pass. It is worth it when the answer will
change how you work for months. It is not worth it for "which model should I
use for this one ticket."

Say the verdict out loud. If the user wants a quick read rather than evidence,
say so and offer to run a single cheap arm instead.

## Stage 2 — Design the course

**This is the stage that determines whether the run means anything.** Read
`references/course-design.md` before drafting. The short version:

1. **Pick a task that resembles the work you actually do.** A result on a toy
   task generalizes to toy tasks.
2. **The brief carries FACTS, never METHOD.** How to run the tests, where the
   code lives, what "done" means — yes. How to approach the work, what order
   to do things in, "write a plan first" — no. Method is what the harness
   supplies; putting it in the brief hands the control condition the very
   thing being measured and guarantees a null result.
3. **Write hidden acceptance tests that discriminate.** They must fail on the
   untouched baseline and pass on a reference solution you write yourself.
4. **Plant at least one trap.** A file that looks refactorable but must not be
   touched. This is the scope-discipline probe, and it is where harnessed and
   bare runs most often diverge.
5. **Check for leakage.** The brief must not contain the answer.

Draft all of it yourself from the repo first, then show the user the draft and
ask only about what you genuinely could not infer — usually just "is this the
kind of task you care about?"

## Stage 3 — Scaffold and calibrate

```bash
npx soloship gauntlet init --run <YYYY-MM-DD-slug> \
  --plugin-root <path-to-soloship> --reps 3
```

Fill in `.gauntlet/<run>/course/BRIEF.md`, the sealed tests in
`course/acceptance/`, and `course/reference.patch`. Set `trapPaths`,
`acceptanceCommand`, and the model list in `gauntlet.json`
(`npx soloship gauntlet adapters` lists the built-in agent adapters; see
`references/adapters.md` to add Codex or Grok).

**The calibration gate is binding:**

```bash
npx soloship gauntlet calibrate --run <run>
```

It refuses to proceed unless acceptance **fails on the baseline** and **passes
on the reference**. A course that passes on an untouched repo measures
nothing, and a course that fails even on a correct solution measures its own
tests. If the gate refuses, fix the course — never reach for
`--skip-calibration` to make the message go away.

## Stage 4 — Run the arms

```bash
npx soloship gauntlet run --run <run>
```

Each arm gets its own git worktree on its own `gauntlet/<run>/<arm>` branch,
starting from the pinned baseline, bounded by a wall-clock timeout and a
dollar cap. Arms cannot see each other. Tell the user the arm count and the
budget ceiling before starting — this is where the money goes.

Arms run unattended, so every arm's brief carries the same autonomy clause
(make a reasonable call, write it in `DECISIONS.md`, keep going). Without it,
harnessed arms would stall at checkpoints designed for a human and the run
would measure the absence of a user.

## Stage 5 — Score and review

```bash
npx soloship gauntlet score  --run <run>   # sealed tests, regression, traps
npx soloship gauntlet review --run <run>   # blind judges
```

Scoring runs the hidden tests against each arm's final tree in a throwaway
checkout — the tests never enter an arm's worktree, so nothing can be tuned
against them.

Review anonymizes first: process artifacts (`docs/`, `.ai/`, `.claude/`)
stripped so a harnessed arm's plan files don't announce its condition, git
metadata removed, model and vendor names scrubbed, codenames assigned, order
shuffled per reviewer. **The blinding gate is binding:** if any submission
still names a model after scrubbing, the review stops rather than showing a
judge who wrote what. Add the offending string to `review.extraScrubPatterns`
and re-run.

Judges score twice — an absolute rubric and an order-balanced pairwise
tournament (every pair judged in both directions, aggregated with
Bradley-Terry). Details and the reasoning in `references/review-rubric.md`.

## Stage 6 — Read the scorecard honestly

```bash
npx soloship gauntlet report --run <run>
```

Walk the user through it in this order, in plain language:

1. **Did anything actually work?** Acceptance ratios and reliability first.
   A high composite on an arm that failed the tests is a judging artifact.
2. **The harness question.** The harnessed-minus-bare delta per model. Report
   whether the confidence intervals separate — and if they don't, say the
   honest thing: *this run cannot tell those apart.*
3. **The model question.** Ranking at fixed condition.
4. **Cost and speed.** Quality per dollar and per minute, which is usually
   what actually decides the answer.
5. **Judge diagnostics.** If judges and tests disagree, or if rubric scores
   track diff size, say so and discount the rubric accordingly.

Read `references/scoring.md` before interpreting anything. The single most
common misreading is treating a 3-rep difference as settled; with n=3 most
differences are not statistically separable, and saying so is the finding.

## Stage 7 — Hand off. Never merge.

The scorecard ends with a merge command per arm. **You do not run them.** Not
with confirmation, not "since it's obviously the best one." Present the
ranking, name your recommendation with reasons, and stop. The user merges.

Delete nothing: the arm branches are the evidence. Offer to push them
(`git push -u origin <branch>`) so they survive the worktrees.

## Enforcement gates

| Gate | What it blocks | How to satisfy it |
|---|---|---|
| Calibration | Running arms on a course that cannot discriminate | Make acceptance fail on baseline, pass on reference |
| Blinding | Showing a judge a diff that names its author | Add the leaked string to `extraScrubPatterns` |
| No merge | Any merge, by anyone, from this skill | Present the ranking; the user merges |
| Evidence | Reporting a winner without a scorecard | Run `score` and `review` before `report` |

## Anti-rationalization

| Tempting shortcut | Why it is wrong |
|---|---|
| "Skip calibration, the tests obviously work" | An acceptance suite that passes on the baseline scores every arm identically and looks like a real result. This has happened; it is the reason the gate exists. |
| "One rep is enough, the difference is huge" | Agent runs vary a lot run to run. The prior Soloship A/B named n=1 as its own top limitation. |
| "Put 'write a plan first' in the brief so it's fair" | That IS the harness. Handing it to the bare arm guarantees a null result and wastes the whole run. |
| "The judge can know which is which, it's objective" | It is not. That is the single most-studied failure mode in LLM judging. |
| "Just merge the winner, the user will want that" | The user said they merge. A bake-off that merges its own winner is not an evaluation, it is an unsupervised deploy. |
| "Report the composite, it's one clean number" | The composite hides the cost/quality tradeoff that is usually the actual decision. |

## References

- `references/course-design.md` — designing a course that measures something
- `references/review-rubric.md` — the rubric, the blinding protocol, judge bias
- `references/scoring.md` — what each number means and how to not overread it
- `references/adapters.md` — adding Codex, Grok, or any other agent CLI
