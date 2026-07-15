# Evidence Loop — Bounded Verification of Live-Data Claims

Shared reference for the `live-data-evidence-gate` rule. Skills that make or check
claims about live/production data invoke this as an explicit step. It is the
"factually 100% confident / find every loophole" method, **bounded** so it cannot
run away (an unbounded confidence loop is the exact token/spend-cap death Soloship
otherwise fights).

## When to run it

- Before stating a load-bearing conclusion about live/production/CRM/financial
  data (a count, a total, a "these match", an "X is already linked", a "Y doesn't
  exist", a "this is free").
- At `/soloship:plan`'s claim-verification step, for any plan claim about data.
- At the pre-deploy check in `/soloship:shipfast` and `/soloship:shipthorough`,
  for any data claim the deploy relies on.
- On demand during operational data work (`invoke the evidence loop`).

## The loop (bounded)

1. **State the claim** in one line.
2. **Hunt loopholes — factually, not by vibe.** List every concrete way the claim
   could be false: wrong table, wrong environment (prod vs staging vs local), a
   dropped `WHERE` filter, a stale read, a join that fans out rows, one
   cherry-picked query standing in for the whole set, a null/empty result read as
   zero.
3. **For each loophole, resolve it or name it.** Either run a query that rules it
   out and record a Claims-Table row, or add the loophole to a named
   **unverified list**.
4. **Terminate on exactly one of two states** — never a bare "I'm confident":
   - **confirmed** — the provenance rows are filled and support the claim, OR
   - **unverified: <named list>** — the specific open items and what each would
     need to close.

If the loop keeps finding new loopholes without closing any, stop and report the
unverified list. Do not spin.

## The Claims Table (required schema)

Every load-bearing data claim terminates as a row with **all fields filled**:

| claim | exact query | environment | timestamp | result (excerpt + row count) | verdict |
|-------|-------------|-------------|-----------|------------------------------|---------|

- `exact query` — the literal query/command, not a paraphrase.
- `environment` — prod / staging / local, stated explicitly (this kills the
  "ran it against staging" failure).
- `timestamp` — when it was run (data drifts).
- `result` — the actual excerpt AND the row count.
- `verdict` — `confirmed` only if every field is filled and the result supports
  the claim; otherwise `inferred`, stated as inference.

A row with any empty field is not `confirmed`.

## Escalation tier (financial / irreversible claims)

> Wired in the loop-spine plan (needs the resumable-orchestration pattern). Until
> then this section documents the intended trigger; do not rely on it as shipped.

When a claim drives (a) a money movement or credit change, (b) an outbound
message/report to a customer containing a figure, or (c) any irreversible write,
the single-agent verdict is not enough. Dispatch **one independent sub-agent** to
re-derive the claim from source (fresh context, no view of the first derivation),
and converge only when the independent derivation agrees. Disagreement → the
claim is unverified, full stop.

## What this loop does NOT do

It does not make the claim true by formatting a table — a filled row with a wrong
query is still wrong. It forces the evidence to exist and be inspectable; a human
or an independent agent can still catch a bad query. And it cannot police a bare
conversational assertion mechanically — that stays governed by the rule, mitigated
not blocked. Do not report "verified" when the honest state is "inferred."
