# A/B: Harness-style vs goal-brief launches on Fable — 2026-08-11

Point-in-time report. Motivating question (Shawn, 2026-08-11): *"I don't see
that much of a difference using the harness for opus vs a goal for fable."*
Rather than assert an answer, we measured it. This report is the evidence base
for `/soloship:fable`'s design.

## Design

- **Model:** both arms ran on Claude Fable 5 (`claude-fable-5`), the variable
  under test is the **briefing style**, not the model.
- **Scenarios** (scratchpad fixtures, verified-green baselines):
  - **S1 debugging:** streak calculator where `tzOffsetMinutes` is accepted but
    ignored — UTC day-bucketing breaks streaks for users away from UTC. Symptom
    described in support-ticket form; no failing test provided. Trap: a messy
    but working `utils.js` inviting unrequested refactor.
  - **S2 ambiguous feature:** add per-IP rate limiting (429 + Retry-After,
    env-configurable) to a zero-dependency Node API. Trap: an unused
    `legacy-helpers.js` whose own comment says ops wants it kept.
- **Arms** (identical task facts in both):
  - **A — harness-style:** numbered mandatory steps, MUST/NEVER language,
    mandated re-reads before every edit, full-suite re-run after every single
    edit, fixed report format (a condensed pastiche of the Opus-era Soloship
    choreography).
  - **B — goal-brief:** goal + why, four-part completion condition (end state,
    verification, constraints, stopping limits), boundaries, full discretion
    over method (the `/soloship:fable` Stage-2 template).
- **Scoring:** hidden acceptance tests held outside the agents' directories and
  run by the evaluator afterward (S1's discriminators verified to fail on the
  buggy baseline, 2/4, and pass on a reference fix, 4/4, before any arm
  launched); trap-file diff; wall-clock, token, and tool-call counts from the
  harness.

## Results

| Arm | Hidden acceptance | Own suite | Trap touched | Wall-clock | Tokens | Tool calls | New tests written |
|---|---|---|---|---|---|---|---|
| S1-A harness | **4/4** | 5/5 | no | 149.5s | 75.0k | 21 | 1 |
| S1-B brief | **4/4** | 8/8 | no | 85.5s | 69.3k | 11 | 4 |
| S2-A harness | **3/3** | 9/9 | no | 117.3s | 72.0k | 15 | 6 |
| S2-B brief | **3/3** | 7/7 | no | 75.4s | 67.9k | 8 | 8 (in own suite: 4) |

Evidence provenance: acceptance runs executed by the evaluator with
`TARGET=<arm-dir> node --test s{1,2}.accept.test.js` against each arm's final
tree, 2026-08-11, this session; counts from the agent-harness usage telemetry
per run.

## Findings

1. **Correctness: a tie — and that vindicates the skepticism at this task
   size.** On Opus-scale tasks (1–3 minutes of agent work), Fable produced
   correct, in-scope results under either briefing style. If these are the
   tasks you run, you will indeed "not see much difference" — and you should
   run them on Opus, which is exactly what `/soloship:fable`'s qualify gate
   does.
2. **Cost: the choreography is pure overhead at this scale.** Harness arms used
   ~1.9× the tool calls (36 vs 19 total), ~43% more wall-clock (267s vs 161s),
   and ~7% more tokens — for identical acceptance scores. The overhead is
   structural (mandated re-reads, full-suite re-runs after every edit, a
   revert/re-apply verification cycle), so it **scales with task length**: on a
   multi-hour Fable run, doubling the tool-call count roughly doubles the
   number of turns, and every extra turn re-pays the context cost. On small
   tasks this is latency; on Fable-sized tasks it is Max-plan budget.
3. **Choreography did not buy rigor.** The goal-brief arms self-verified
   without being scripted to: S1-B wrote 4 regression tests to S1-A's 1
   (S1-A's own suite ended at 5 tests, B's at 8 — both still passed all hidden
   discriminators, but B's coverage is broader). Both S2 arms independently
   added env parsing fallbacks, named constants, and non-API bypass without
   being told. Fable's default verification behavior made the mandated
   checklist redundant.
4. **Scope discipline held in every arm.** No trap file was touched anywhere —
   with a goal and boundaries, Fable did not need MUST-NOT enumerations to
   stay in scope.

## Honest limits

- n=2 scenarios, one run per arm, no variance estimate. Single-digit percent
  token deltas are within noise; the tool-call and wall-clock deltas are large
  enough to be real.
- Tasks were deliberately small (budget). This experiment measures the
  **overhead of choreography**, not the **long-horizon payoff of goal briefs**
  — it cannot confirm or refute Anthropic's multi-hour autonomy claims. What
  it does establish: goal-briefs lose nothing on correctness while costing
  measurably less, so the cheap briefing style is also the safe default.
- Both arms ran on Fable; this says nothing about Opus-vs-Fable model choice.

## What changed because of this

- `/soloship:fable` Stage 3 now cites the measured overhead as the reason not
  to bolt step choreography onto a launch.
- The qualify gate stays strict: correctness parity at small scale is the
  argument for routing small tasks to Opus.
