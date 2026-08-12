# Designing a course that measures something

The course is the experiment. Everything downstream — the arms, the judges, the
scorecard — inherits its validity from this file's advice being followed. A
beautifully executed run on a badly designed course produces confident numbers
about nothing.

## The one rule that matters most

**The brief carries FACTS. The harness carries METHOD.**

| Belongs in the brief | Belongs to the harness |
|---|---|
| What the product needs to do | "Write a plan first" |
| How to run the tests | "Verify before claiming done" |
| Where the relevant code lives | "Search for prior art" |
| What must not change | "Use a worktree" |
| What "done" looks like, observably | Any ordering of steps |

If you put method in the brief, you have handed the bare arm the exact thing
the harnessed arm was supposed to supply. The run will show no difference, and
that null result will be an artifact of your brief, not a fact about Soloship.

The reverse error is just as bad: withholding facts from the bare arm so it
"has to figure it out." That measures whether the project has a `CLAUDE.md`,
which is not the question. Both conditions get identical facts.

## Picking the task

Pick something that resembles your real work. In rough order of how much they
discriminate:

| Task shape | Discriminates? | Notes |
|---|---|---|
| Ambiguous feature in an unfamiliar area | **Strongly** | Judgment, scope, and verification all get exercised. The best default. |
| Bug with a described symptom but no failing test | **Strongly** | Root-causing separates models sharply. Describe it as a support ticket would. |
| Cross-cutting refactor with a correctness invariant | Strongly | Long-horizon; favours models that keep state. Expensive to run. |
| Well-specified small feature | Weakly | Most models do this correctly; you learn about cost, not quality. |
| Anything with one obvious right answer | Not at all | Everyone ties. Wasted run. |

Two useful shapes borrowed from the prior Soloship A/B, both of which worked:

- **Symptom, not diagnosis.** "Users away from UTC lose their streaks" beats
  "fix the timezone bug in `bucketByDay`". The second one does the hard part
  for the agent.
- **A tempting distraction.** Nearby messy-but-working code invites an
  unrequested refactor. Whether an arm resists is a real quality signal.

## Sizing the task

Long enough that the difference between models can show up; short enough that
you can afford `models × conditions × reps` of it.

- Under ~5 minutes of agent work: expect ties on correctness. You will learn
  about cost and speed only.
- 15–45 minutes: the sweet spot for most comparisons.
- Multi-hour: only worth it if the question is specifically about long-horizon
  autonomy, and budget accordingly — this is where a run gets genuinely
  expensive.

## Hidden acceptance tests

These are the objective half of the score, and they never enter an arm's
worktree.

1. **Test the observable behavior, not the implementation.** An arm that
   solves the problem a different way must pass. If your test asserts that a
   particular helper exists, you are scoring conformity, not correctness.
2. **Cover the edges the brief named.** One assertion per bullet in the "done
   when" list is a good starting shape.
3. **Include at least one case the brief implies but does not spell out.**
   This is where thorough arms separate from literal ones.
4. **Make them fail on the baseline.** Verified by the calibration gate.
5. **Make them pass on a reference solution you write yourself.** Also
   verified by the gate. Writing the reference is not optional busywork — it
   is how you find out your tests were impossible before you spend the budget.

### Granularity matters

Acceptance is the highest-weighted component of the composite. Point
`acceptanceCommand` at the test files so the runner reports per-assertion
results:

```jsonc
"acceptanceCommand": "node --test \"gauntlet-acceptance/*.test.js\""   // 4/5
"acceptanceCommand": "node --test gauntlet-acceptance"                // 0/1
```

Runners that spawn a process per file report one pass per *file*, which turns a
five-case suite into a pass/fail coin flip and erases the difference between an
arm that got four cases right and one that got none. When in doubt, have your
suite print `GAUNTLET_ACCEPT <passed>/<total>` and the ratio is read directly.

## Traps

A trap is a path listed in `trapPaths` that a correct solution never touches.
The classic is a file that looks like dead code but carries a comment saying an
external system depends on it.

Traps measure scope discipline, which is where harnessed and bare runs most
often actually differ — and unlike correctness, it is invisible to acceptance
tests. Include at least one. Two is better.

The trap must be *plausible*, not a booby trap: real dead-looking code with a
real-sounding reason to keep it. A trap nobody would touch measures nothing.

## Leakage

The calibration gate scans the brief for lines lifted from the reference
solution, but it cannot catch paraphrase. Check yourself:

- Does the brief name the exact function, regex, or algorithm to use?
- Does it describe the fix rather than the symptom?
- Would someone who only read the brief be able to write the reference patch
  without understanding the codebase?

If yes to any, you are scoring prompt-following, not engineering.

## Baseline hygiene

The baseline commit is pinned at `init` and never re-resolved. Before running:

- The working tree must be clean (the tool enforces this).
- The project's own test suite should pass on the baseline, or the regression
  signal is meaningless.
- `.gauntlet/` must be gitignored, or arms will see each other's state.

## A worked example

The self-test course shipped with this tool:

- **Task:** `slugify` handles only spaces; make it handle punctuation, accents,
  repeated separators, and edge cases. Described as an editor-facing bug.
- **Facts given:** where the function is, how to run tests, that slugs are
  permanent public URLs (the *why*), the signature constraint.
- **Method withheld:** nothing about normalization, regexes, or approach.
- **Hidden tests:** five assertions, one per stated rule plus the empty-input
  case.
- **Reference:** an eight-line NFD-normalize-and-collapse implementation.
- **Trap:** `src/legacy-helpers.js`, unimported, with a comment saying an
  external nightly job calls it.
- **Calibration:** 0/5 on baseline, 5/5 on reference.

It is deliberately small — small enough to be a self-test, too small to
discriminate on quality. Your real course should be bigger.
