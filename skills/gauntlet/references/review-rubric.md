# Blind review — rubric, blinding, and judge failure modes

Acceptance tests answer *did it work*. They cannot see a correct solution
written unmaintainably, and they cannot see an incorrect one written
beautifully. That is what reviewers are for.

Reviewers are also the least trustworthy part of the pipeline, which is why
this file spends more space on their failure modes than on the rubric itself.

## The blinding protocol

Every step is mechanical. None depends on a reviewer being well-behaved.

1. **Path filtering.** The reviewed diff is restricted to `review.includePaths`
   and stripped of `review.excludePaths` — by default `docs/`, `.ai/`,
   `.claude/`, `.codex/`, `AGENTS.md`, `CLAUDE.md`.

   This one is not cosmetic. A harnessed arm writes plan files and solution
   docs; leaving them in the bundle tells every judge which condition it is
   reading, and the harness comparison collapses. Those artifacts are still
   scored mechanically — they are just not shown to judges.

2. **Metadata removal.** Commit lines, authorship, dates, and `index` hashes
   are redacted.

3. **Identity scrubbing.** Model and vendor names are replaced wherever they
   appear as whole words — every Claude tier, OpenAI/GPT/Codex, Grok/xAI,
   Gemini, Llama, Mistral, Qwen, DeepSeek, and "soloship" itself.

4. **The residual scan is a gate.** After scrubbing, the diff is re-scanned. If
   anything survived, the review **stops**. It does not warn and continue. A
   leaked diff would silently corrupt every judgment downstream, and a warning
   in a scrollback is not a control.

5. **Codenames.** Deterministic per run, so a re-run does not reshuffle the
   report. Deliberately meaningless words — anything evocative (`ALPHA`,
   `FLAGSHIP`) is itself a hint.

6. **Order shuffling.** Each reviewer sees submissions in a different order.

## The rubric

| Criterion | Weight | What it asks |
|---|---|---|
| `correctness` | 0.35 | Does it accomplish the task, including edge cases and failure paths? |
| `robustness` | 0.20 | Will it hold under real input — boundaries, bad data, errors? |
| `scope` | 0.15 | Confined to what was asked, no drive-by rewrites? |
| `maintainability` | 0.20 | Could a different engineer change this in six months? |
| `process` | 0.10 | Evidence the author verified their own work with tests that assert behavior? |

Scored 1–5, weighted, normalized to 0–1. The weights are printed in the
scorecard, because a composite whose weights are invisible is an opinion
wearing a number's clothes.

`process` exists on the strength of Harness-Bench's finding that completion
alone hides where agents actually differ. An arm that reached the right answer
by thrashing is not equivalent to one that reasoned to it — but note that
judges see only the diff, so this criterion reads *evidence of verification in
the code*, not the trajectory.

## Pairwise, and why both

LLM judges are materially more reliable at "which of these two is better" than
at "score this out of five" — the finding that underpins Arena-Hard and
MT-Bench. But pairwise alone tells you the ranking without telling you whether
*anything* was good. So the run does both, and the scorecard reports both.

**Every pair is judged twice, with the sides swapped.** This is the two-game
setup Arena-Hard uses, and it exists because position bias in LLM judges is
well documented and cheap to cancel. Results aggregate through Bradley-Terry
with a small symmetric prior, so an undefeated submission yields a finite
strength instead of diverging.

Cost scales as `n(n-1)` calls. With 12 submissions that is 132 comparisons. Set
`review.pairwise` to `"off"` when the field is large and you only need the
rubric.

## Judge failure modes, and what the tool does about each

| Failure mode | Countermeasure |
|---|---|
| **Position bias** — favouring whichever came first | Every pair judged in both orders |
| **Style bias** — rewarding length and polish over substance ([arXiv 2409.15268](https://arxiv.org/pdf/2409.15268)) | Explicit instruction to prefer the shorter correct diff, **plus** a reported correlation between diff size and rubric score so the bias is measured, not merely discouraged |
| **Self-preference** — a judge favouring its own family | Judge model held fixed; if it is also a contestant, the scorecard prints a warning and you compare against the mechanical column |
| **Harness sympathy** — a judge loaded with Soloship's rules grading Soloship's arms | Judges always run with all customizations disabled |
| **Identity guessing** | Blinding protocol above, plus an instruction to ignore any hunch about authorship |
| **Single-judge noise** | `reviewersPerSubmission` independent reviewers, averaged |

## Reading the diagnostics

The scorecard reports two correlations. Both are diagnostics about the
*judges*, not about the arms:

- **Judge vs mechanical (rubric score vs acceptance ratio).** Strongly positive
  is reassuring. Near zero or negative means judges and tests disagree about
  what good means — go read the diffs yourself before trusting either. The
  most common cause is a course whose tests check something narrower than what
  the brief asked for.

- **Style bias (diff size vs rubric score).** Strongly positive means judges
  rewarded volume. Discount the rubric column and lean on acceptance and
  pairwise. This is the single most likely way a gauntlet produces a confidently
  wrong answer.

## What blinding cannot do

Be honest about this in any writeup:

- A judge may still infer a *condition* from coding style even with artifacts
  stripped. Blinding is strong for model identity, weaker for harness identity.
- Judges see a diff, not a trajectory. They cannot assess how the work was
  done, only what it left behind.
- Multiple reviewers on the same model are not independent in the way two
  humans are — they share priors. Treat reviewer agreement as a consistency
  check, never as corroboration.
