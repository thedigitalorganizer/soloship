# Reading the scorecard without fooling yourself

Every number here is a measurement of a few agent runs on one task. The most
common way a gauntlet goes wrong is not a bug in the arithmetic — it is reading
a real number as a bigger claim than it can carry.

## The columns

| Column | What it is | What it is not |
|---|---|---|
| `Accept` | Hidden acceptance tests passed / total | Not a quality score — a solution can pass all of them and still be awful |
| `Regress` | The project's own suite still green | Not coverage of the new work |
| `Scope` | Trap paths untouched | Only catches the traps you planted |
| `Wall` | Wall-clock seconds | Includes queueing and retries; the only metric comparable across vendors |
| `Cost` | Vendor-reported spend | `n/a` means the adapter had no telemetry, **never** that it was free |
| `Rubric` | Mean weighted judge score, 0–1 | An LLM's opinion, with the biases in `review-rubric.md` |
| `Pairwise` | Normalized Bradley-Terry strength | Relative only. Meaningless with one submission |
| `Composite` | Weighted blend, weights printed below the table | Not a truth. A convenience for sorting |

### Why the composite renormalizes

An arm missing a component (no judge verdict, say) is scored on the components
it has, with the weights renormalized over those. The alternative — treating a
missing component as zero — would rank an unjudged arm below a terrible one,
which is a measurement artifact masquerading as a finding.

## The cell table

Aggregates each `model × condition` across its reps.

- **mean** — the headline. This is pass@1 averaged over attempts, the same
  convention the Artificial Analysis Coding Agent Index uses.
- **95% CI** — percentile bootstrap over the reps. With 3 reps this interval is
  wide. That width is information, not a defect of the report.
- **std dev** — run-to-run spread. A model with a good mean and a large spread
  is a model you cannot rely on unattended.
- **reliability** — the share of reps that passed acceptance *completely*. This
  is the column people skip and shouldn't. A mean of 0.6 from two perfect runs
  and one total failure is a completely different animal from three mediocre
  runs, and only reliability tells them apart.

## The harness question

The delta table is harnessed minus bare, **per model** — never as a single
number. Harness-Bench's central finding is that harness dependence varies by
model: a stronger model is often less sensitive to the execution layer, so
"does the harness help" has no model-independent answer.

`separated` means the two bootstrap intervals do not overlap. That is the
weakest honest claim that a difference is not noise, and it is not a
significance test.

**With 3 reps, expect `no` even for real effects.** The correct report is *"the
harnessed mean was higher, but this run cannot distinguish that from run-to-run
variance"* — not *"the harness helped."* If the delta matters to a decision,
raise `--reps` and run it again.

## Cost and speed

Quality per dollar and quality per minute are usually what actually decides the
answer, which is why they get their own table rather than being folded into the
composite. A model that scores 5 points lower for a third of the cost is the
right choice for most work, and no blended number will tell you that.

Two cautions:

- Wall-clock includes queueing, retries, and rate-limit backoff. Re-run at a
  different time of day before concluding one vendor is slower.
- Cost is vendor-reported and includes cache effects. The first arm of a run
  often pays cache-creation costs that later arms read for free, so compare
  medians across reps rather than single arms.

## Statistical honesty

The prior Soloship experiment closed by naming its own top limitation: *"n=2
scenarios, one run per arm, no variance estimate."* This tool fixes the reps.
It cannot fix the rest, and neither can you by staring harder at the table:

1. **One course.** Results generalize to tasks resembling this one and no
   further. Two courses that disagree is a finding, not a contradiction.
2. **Small n.** Three reps gives a wide interval. Differences under ~10 points
   at n=3 are usually not separable.
3. **Unattended runs.** Harnessed workflows that would normally pause for a
   human ran without one. This is a real difference from day-to-day use and
   likely *understates* the harness.
4. **Judges are correlated.** Multiple reviewers on one model share priors.
5. **Vendors move.** A result is a measurement of a model version on a date.

## How to state a conclusion

Good:

> On this course, Sonnet harnessed and Opus bare scored within a point of each
> other (0.71 vs 0.70), and their intervals overlap heavily — this run cannot
> separate them. Sonnet cost a fifth as much. Across 3 reps Opus never failed
> acceptance and Sonnet failed once, so Opus was more reliable.

Bad:

> Opus beat Sonnet. The harness improved results by 8%.

The first states what was measured and what it cannot say. The second states
two claims the data does not support: an unqualified ranking from overlapping
intervals, and a percentage from n=3 with no interval at all.

## When the numbers disagree with each other

That is the pipeline working. The mechanical and judged halves are deliberately
independent so they can disagree.

- **Tests pass, judges hate it** → probably correct but unmaintainable, or the
  tests are narrower than the brief. Read the diff.
- **Judges love it, tests fail** → probably style bias, or the arm solved a
  different problem well. Check the style-bias correlation first.
- **Reps disagree wildly** → the task is at the edge of that model's ability.
  That instability *is* the finding; report it rather than averaging it away.
