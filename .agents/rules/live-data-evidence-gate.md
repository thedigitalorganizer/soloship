# Live-Data Evidence Gate (Auto-Loaded)

## The Rule

**Evidence is the currency of confidence.** A load-bearing claim about live or
production data — a count, a total, a "these match", a "this is already linked",
an "X doesn't exist", a "this is free" — is **confirmed** only when it is backed
by a query you actually ran, with its provenance shown. No shown query means the
claim is **inferred**, and it must be labeled that way. This is the read-side
twin of the billing-confirmation-gate: that gate guards *mutations* to money;
this one guards *assertions* about data.

This exists because the single most-cited, highest-cost friction is asserting a
data fact that was never verified — "the numbers matched exactly", "linking is
free", "that person isn't in the system", a hallucinated link — and being wrong,
on real customer and financial data. A green query readback that was run against
staging, missing a filter, or cherry-picked is not evidence; it is evidence
theater.

## The Claims Table (required schema, not a freeform table)

When a data claim is load-bearing — it drives a decision, a mutation, a message
to a customer, or a written conclusion — record it as a Claims-Table row with
**every field filled**:

| field | what it must contain |
|-------|----------------------|
| claim | the specific assertion, in one line |
| exact query | the literal query/command run (not a paraphrase) |
| environment | prod / staging / local — say which, explicitly |
| timestamp | when the query was run (data drifts) |
| result | the actual result excerpt **and** row count |
| verdict | `confirmed` (all fields filled, query supports the claim) or `inferred` |

A row missing any field is not `confirmed`. A claim with no query is `inferred`
— state it as inference and name what you would need to confirm it.

## The Bounded Evaluator (how to reach a verdict)

Before stating a load-bearing data conclusion, run the loop: **are you factually
confident?** For each way the conclusion could be false — wrong table, wrong
environment, a dropped filter, a stale read, one cherry-picked query — either
fill a Claims-Table row that rules it out, or add it to a named unverified list.
Terminate on one of exactly two states:

- **confirmed** — the provenance rows are filled and support the claim, or
- **here is what I could not verify** — the explicit named list of open items.

Never terminate on a bare "I'm confident." Confidence that isn't backed by a
filled row is inference wearing a confident voice — the exact failure this gate
exists to stop.

## Honest Scope (what this gate does NOT do)

This gate does not, and cannot, mechanically block a claim you make in
conversation — prose has no tool boundary to intercept. It makes evidence cheap
to demand and its **absence visible** at the boundaries that do occur: the
durable write (a solution doc, a report, a plan) and the data-publishing action
(an email or report carrying a figure). A bare conversational assertion stays
governed by this rule and the evaluator above — mitigated, not blocked. Do not
overstate the guarantee; claiming "no unverified assertion ever" is itself the
kind of vibe-check this gate forbids.

## When This Triggers

- Before asserting any load-bearing fact about live/production/CRM/financial
  data — in prose, in a written artifact, or as the basis for an action.
- Before writing a solution doc, report, or plan that records a data conclusion:
  it must carry the filled Claims Table (a warn-only `PostToolUse` hook flags a
  matching artifact that lacks one — that warn is this rule's mechanical floor at
  the write boundary).
- Whenever you catch yourself about to write "matched exactly", "already linked",
  "is free", "reconciles to", "none exist", or a bare total — stop and fill the
  row, or label it inferred.
