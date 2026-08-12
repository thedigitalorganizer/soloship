# The model gauntlet — design and first live run, 2026-08-12

Point-in-time report. Motivating questions (Shawn, 2026-08-12): *"which
performs best — Sonnet vs Opus vs Fable, harnessed and unharnessed, with
independent agents doing the code reviews"*, and *"people are complaining about
Opus but it seems fine to me. Curious about performance and speed from OpenAI
and Grok."*

This is the design record for `/soloship:gauntlet` and `soloship gauntlet`. It
is the successor to `2026-08-11-fable-brief-ab-experiment.md`, which measured
briefing style on one model and closed by naming the two limits this instrument
exists to remove: *"n=2 scenarios, one run per arm, no variance estimate"* and
*"Both arms ran on Fable; this says nothing about Opus-vs-Fable model choice."*

## What was built

A six-stage CLI (`init` → `calibrate` → `run` → `score` → `review` → `report`)
plus a skill that drives it. One sealed task (a **course**) is attempted
independently by many **arms**, where an arm is
`agent × model × condition × rep` and condition is `harnessed` (Soloship
loaded) or `bare` (all customizations disabled).

Arms run in isolated git worktrees on `gauntlet/<run>/<arm>` branches. Hidden
acceptance tests score correctness. Independent judges score anonymized diffs.
Nothing merges — there is no merge code path, which is pinned by a test.

## Prior art consulted

The scoring design is borrowed, not invented:

- **[Harness-Bench](https://arxiv.org/html/2605.27922v1)** — the closest prior
  art to Shawn's question. Its method is "fix the task, budget, timeout, and
  evaluator; vary the harness; preserve each harness's native behavior." Two
  findings shaped the design directly: harness variance can move results 10–20
  points on identical model weights, and **harness dependence varies by
  model** — so the report gives a per-model delta and deliberately refuses to
  produce a single "does the harness help" number.
- **[Artificial Analysis Coding Agent Index](https://artificialanalysis.ai/agents/coding-agents)**
  — benchmarks harness×model combinations as variants, averaging pass@1 over
  three attempts and reporting tokens, cost, and wall-clock alongside quality.
  Reps default to 3 here for the same reason.
- **[MT-Bench / Chatbot Arena](https://arxiv.org/pdf/2306.05685)** and
  Arena-Hard — pairwise judging with a two-game order swap, Bradley-Terry
  aggregation, bootstrap confidence intervals.
- **["Style Outweighs Substance"](https://arxiv.org/pdf/2409.15268)** — LLM
  judges reward length and polish. Countered with an explicit instruction *and*
  a reported diff-size/score correlation, so the bias is measured rather than
  assumed away.

## Validity controls

| Control | What it prevents |
|---|---|
| Calibration gate: acceptance must fail on baseline, pass on reference | A course that scores every arm identically and looks like a result |
| Facts in the brief, method in the harness | Handing the control condition the very thing under test |
| Sealed tests, never in an arm's worktree | Tuning against the scorer |
| Trap paths | Scope failures that acceptance tests cannot see |
| Process artifacts excluded from the reviewed diff | A harnessed arm's plan files announcing its condition |
| Residual leak scan as a hard gate | A judge learning who wrote what |
| Two-game pairwise order swap | Position bias |
| Judges run with all customizations disabled | A reviewer grading Soloship arms with Soloship's own rulebook |
| Reps ≥ 3 required before any separation claim | Point-interval false confidence at n=1 |
| Cost/tokens report `n/a`, never `0` | Unavailable telemetry reading as free |

## First live run (self-test)

A deliberately tiny course — `slugify` handles only spaces; make it handle
punctuation, accents, repeated separators, and empty results — run as
2 models × 2 conditions × 1 rep against a throwaway fixture repo.

Calibration: **0/5 on baseline, 5/5 on reference**. All four arms then passed
5/5 acceptance, which is the expected outcome for a course this small and is
why the shipped course-design guidance says a real course must be bigger.

Two things the run surfaced that are worth recording:

1. **The regression column caught a real difference.** The fixture's own
   `npm test` script was broken (`node --test test/` fails module resolution on
   Node 22). Both Sonnet arms noticed and fixed it; neither Haiku arm did. That
   is exactly the kind of difference acceptance tests miss and the pipeline is
   meant to catch.

2. **Blinding failed on its first real diff, and the failure was instructive.**
   The harnessed arm's plan file was correctly excluded, but the `DECISIONS.md`
   every arm writes *cited the plan by path*, telling the judge which arm had
   run a planning workflow. After excluding `DECISIONS.md` and adding a
   process-path scrubber, the rubric spread across the four submissions
   narrowed from 77–94% to 88–93% — evidence the leak had been moving
   judgments, not a cosmetic issue.

## Honest limits of the instrument

- It measures one course. Two courses that disagree is a finding, not a
  contradiction.
- Arms run unattended, so harnessed workflows that would normally pause for a
  human run without one. This likely *understates* the harness.
- Blinding is strong for model identity, weaker for harness identity — a judge
  may still infer a condition from coding style.
- Multiple reviewers on one model share priors; reviewer agreement is a
  consistency check, never corroboration.
- Codex's harnessed/bare split is installation-wide rather than per-arm, so
  those two conditions must be run as separate gauntlets. That is a weaker
  control than the Claude arms get, and is documented as such.
- Grok has no first-party coding CLI, so it runs through the `generic` adapter
  with wall-clock-only telemetry and `bare` as its only honest condition.

## Status

Built, tested (92 gauntlet-specific unit tests), and exercised end to end. No
gauntlet has been run against a real project yet — Shawn chooses the course and
the repo.
