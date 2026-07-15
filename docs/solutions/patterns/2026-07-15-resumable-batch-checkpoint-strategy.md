---
title: Resumable-batch checkpoint strategy — chosen by kill-test, not assertion
date: 2026-07-15
category: patterns
components: [skills/references/resumable-orchestration.md, skills/cron, skills/implement]
status: current
plan: docs/plans/2026-07-15-feat-loop-spine-plan.md
phase: "Phase 0 (discovery loop)"
---

# Resumable-batch checkpoint strategy — chosen by kill-test, not assertion

This is the **Phase 0 answers doc** for the Goal-Anchored Loop Spine plan. The
eng review flagged the loop's runtime mechanics as underspecified (assumed, not
established). Rather than guess, three candidate strategies were built against a
toy 5-item batch harness and **`kill -9`'d at random points**, restart-until-done,
asserting: every side effect happens exactly once, completed items are skipped on
resume, and a token budget is respected across the resumed run.

No Phase 3 code is written from a guess — this doc's demonstrated results are the
input to `skills/references/resumable-orchestration.md`.

## The experiment (reproducible)

Harness: `scratchpad/harness/{worker.mjs,killtest.sh}` (kept out of tree — it is
throwaway scaffolding; the reference implementation it produced is what ships).

Per-item timeline uses **real async sleeps** so an uncatchable `SIGKILL` timer can
fire anywhere, including the dangerous window:

```
[ mark start ] -> work(half) -> SIDE EFFECT -> COMMIT GAP(half) -> [ mark done ]
                                               ^^^^^^^^^^^^^^^^
        a crash here strands "side effect happened but was never recorded"
```

The side effect is an append to an output file; a **duplicate line = a duplicated
side effect** (the money-movement / double-send failure this whole plan fights).

### Result — 15 random kill points per strategy

| Strategy | Correct under kill? | Result | Why |
|---|---|---|---|
| **naive** — record done *after* the side effect, non-idempotent sink | ❌ | **9/15** (6 duplicate side effects) | A kill in the commit gap leaves the item looking not-done; resume re-runs it and the non-idempotent sink appends a **second** side effect |
| **atomic** — single JSON checkpoint, explicit item states, atomic rename, **idempotent sink** | ✅ | **15/15** | Resume re-runs an in-progress item, but the keyed sink makes the repeat a no-op |
| **applog** — append-only event log, state rebuilt by replay, idempotent sink | ✅ | **15/15** | Same idempotency; state reconstructed from the log |

Budget cap (BUDGET=300, COST=100 → only 3 of 5 items affordable), killed mid-run
then resumed: **both correct strategies stop at exactly 3 items, spent=300** — the
resumed run does not overspend.

**The decisive finding is not "atomic beats applog." Both are correct.** The
decisive finding is that **correctness comes from the idempotent sink, not from
where the checkpoint is written.** No file checkpoint can be transactionally bound
to an external side effect, so "commit after the side effect" (naive) is
fundamentally racy. State transitions **plus idempotency keys** are the only
correct model.

## Chosen strategy: atomic single-file state machine + idempotent sink

Both correct strategies were kept side-by-side; **atomic wins on operational
grounds**, all demonstrated:

- **Bounded & inspectable.** The checkpoint is one JSON object, one entry per item.
  `cat checkpoint.json` shows the exact state of the whole batch at a glance —
  which matters for a non-coder operator. The append-log grows one line per event
  (13 lines and 3 duplicate `start:c` entries for a single 5-item run with one
  retry) and requires a replay to answer "where is the batch now?".
- **Atomic rename removes the only advantage of the log.** The append-log's sole
  edge is "append avoids rewrite races." Writing `tmp` then `rename()` (atomic on
  one filesystem) already eliminates the rewrite race, so the log buys nothing and
  costs unbounded growth + replay.
- **Rewrite cost is O(items), negligible** at the batch sizes this governs.

## Answers to the open design questions (Q1–Q6)

| # | Question | Demonstrated answer |
|---|---|---|
| **Q1** | Checkpoint atomicity — file write vs git commit? | **Atomic file write (`tmp`+`rename`).** Survived 15/15 random kills. Git commit is unnecessary and rejected (see Q5). |
| **Q2** | Item state model + idempotency keys? | **`pending → in-progress → done` / `failed`, per item, with an idempotency key (item id) applied at the sink.** This is what makes resume safe; without the key, naive duplicated 6/15. |
| **Q3** | Retry / dead-letter policy? | **Retry up to `MAX_RETRIES` (default 2 beyond the first attempt), then mark `failed` (dead-letter) and continue the batch.** Demonstrated: a permanently-poison item dead-lettered after 3 tries while `a,b,d,e` still completed; a transient item (fails once) was retried and applied exactly once. A defensive iteration ceiling backstops against infinite retry loops. Spend is **not** charged for a failed attempt. |
| **Q4** | Can a markdown skill *enforce* a token budget, or only *instruct*? | **Only the tool surface can enforce; markdown only instructs.** The harness *models* budget accounting (stops at the cap, doesn't overspend on resume), but real enforcement requires the **Claude Code Workflow/Agent tools**, whose `budget.remaining()` throws at the cap and expose `model`/`effort`/`isolation`. Therefore the pattern targets the Workflow/Agent surface for enforcement and uses the file checkpoint purely for resumability. A pure-markdown skill must **state** the budget as guidance, never claim to enforce it. |
| **Q5** | Remove "per-item commit" — checkpoint must not depend on git? | **Confirmed git-independent.** The whole experiment uses plain files, no git. Forcing per-item commits would pollute history, fail on dirty repos, and break entirely for non-code batches (emails, API calls). The checkpoint is a plain file the run owns. |
| **Q6** | Retrofit scope — new automations only, or existing long runs too? | **New `cron add` automations get it wired in by contract; existing/ad-hoc long runs get it as an opt-in reference, not an auto-retrofit.** You cannot safely rewrite a running job's internals from a skill; the reference (`resumable-orchestration.md`) is what an existing long run adopts when it next fails a cap. `cron` add mode requires it for anything batch-shaped. |

## Prevention / how to apply

- When building any batch that has side effects and could be interrupted: **make
  the sink idempotent first** (natural key or explicit idempotency key), then add
  the atomic state-machine checkpoint. Idempotency is the load-bearing part.
- Never bind "mark done" to "did the side effect" by ordering alone — that is the
  naive strategy and it is racy by construction.
- For real budget/spend caps, put the batch behind the Workflow/Agent tools where
  the cap is enforced by the runtime; a markdown skill can only advise.
- The shipping reference implementation lives in
  `skills/references/resumable-orchestration.md` (Phase 3).
