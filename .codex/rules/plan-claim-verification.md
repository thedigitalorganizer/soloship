# Plan Claims Verified Against Live Codebase (Auto-Loaded)

## The Rule

A plan is a set of assertions about a codebase that does not exist in the
agent's context — it exists on disk. **Every factual claim in a plan must be
verified against the actual repo before the plan is allowed to proceed** to
review or implementation. This runs every time. It does not depend on anyone
remembering to ask for it.

## What Counts As A Factual Claim

- "X is already implemented / already done / already handled"
- File, function, module, or route locations ("the handler is in src/...")
- "There are tests for Y" / any coverage assertion
- Config / pricing / rate / limit / threshold values
- Dependency claims ("Z calls W", "nothing else uses this", "A depends on B")

## How To Verify

For each claim, run the check before proceeding — never restate from memory or
trust the plan's own wording:

| Claim | Check |
|-------|-------|
| "already implemented" | `git grep` the symbol/behavior; open the file; confirm it does X |
| location | `git grep` / `ls` the exact path or symbol |
| "tests exist for Y" | `git grep` the test; confirm it asserts Y, not just that a file exists |
| numeric value | `git grep` the constant; read the current on-disk value |
| dependency | `git grep` the call site; confirm direction; one hit disproves "nothing uses this" |

Emit a Claims Table (claim | verified TRUE/FALSE | evidence). If any
load-bearing claim is FALSE or unverifiable, the plan is wrong — correct it to
match reality or mark the claim as an explicit assumption to validate first.
A plan with an unverified load-bearing claim does not pass.

## Why This Exists

"Already done" claims that turned out false are the most expensive plan defect:
they send the next agent to build on a foundation that isn't there, which ends
in a full revert. The grep is seconds; the rework is hours. This was a
load-bearing audit done by hand every time — this rule makes it automatic.

## When This Triggers

- Any plan enforcement/validation gate (`/soloship:plan` Step 4).
- `/soloship:autoplan` Phase 0, before the review pipeline runs.
- Any time an agent is about to act on a plan's factual assertion.
