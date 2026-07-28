---
name: verification-before-completion
description: Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming output before making any success claims; evidence before assertions always
---

## Host Compatibility

If you are running this skill in Codex, read `../references/codex-compatibility.md` before following host-specific tool instructions. Claude Code should continue to use the Claude-specific tools and command wrappers described here.

<!-- Vendored from superpowers v6.0.3 (Jesse Vincent). See skills/vendored/superpowers/LICENSE. Tone softened for Claude 5 (2026-07-28): register calmed, gate semantics unchanged; deliberately diverges from upstream wording (see Superpowers issue #1878). Soloship's Scope Ledger Gate extension below is unaffected. -->

# Verification Before Completion

## Overview

A completion claim without verification is a false claim — run the verification first. Skipping it is not efficiency.

**Core principle:** evidence before claims, always.

The rule applies in spirit, not just letter: rewording a claim does not exempt it.

## The Iron Law

**The rule: no completion claims without fresh verification evidence for the current state.**

If you haven't run the verification command in this message, you cannot claim it passes.

## The Gate Function

```
Before claiming any status or expressing satisfaction:

1. Identify: what command proves this claim?
2. Run: execute the full command (fresh, complete)
3. Read: full output, check exit code, count failures
4. Verify: does the output confirm the claim?
   - If no: state the actual status, with evidence
   - If yes: state the claim, with evidence
5. Only then: make the claim
```

A claim made with any of these steps skipped is unverified — state the actual status instead.

## Common Failures

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| Tests pass | Test command output: 0 failures | Previous run, "should pass" |
| Linter clean | Linter output: 0 errors | Partial check, extrapolation |
| Build succeeds | Build command: exit 0 | Linter passing, logs look good |
| Bug fixed | Test original symptom: passes | Code changed, assumed fixed |
| Regression test works | Red-green cycle verified | Test passes once |
| Agent completed | VCS diff shows changes | Agent reports "success" |
| Requirements met | Line-by-line checklist | Tests passing |

## Signs you're off the process

If any of these apply, stop and run the verification before saying anything about status:

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification ("Great!", "Perfect!", "Done!", etc.)
- About to commit/push/PR without verification
- Trusting agent success reports
- Relying on partial verification
- Wanting the work to be over and reaching for "just this once"
- Any wording implying success without having run verification

## Common misreads

- "Should work now" → "should" is a prediction, not evidence. Run the verification.
- "I'm confident" → confidence is not evidence.
- "Linter passed" → a linter is not a compiler and not a test suite. Each claim needs the command that proves that claim.
- "The agent said success" → verify independently; check the VCS diff.
- "A partial check is enough" → a partial check proves nothing about the part you didn't check.
- "I used different words, so the rule doesn't apply" → the rule covers paraphrases, synonyms, and implications of success. Spirit over letter.

## Key Patterns

**Tests:**
```
✅ [Run test command] [See: 34/34 pass] "All tests pass"
❌ "Should pass now" / "Looks correct"
```

**Regression tests (TDD Red-Green):**
```
✅ Write → Run (pass) → Revert fix → Run (must fail) → Restore → Run (pass)
❌ "I've written a regression test" (without red-green verification)
```

**Build:**
```
✅ [Run build] [See: exit 0] "Build passes"
❌ "Linter passed" (linter doesn't check compilation)
```

**Requirements:**
```
✅ Re-read plan → Create checklist → Verify each → Report gaps or completion
❌ "Tests pass, phase complete"
```

**Agent delegation:**
```
✅ Agent reports success → Check VCS diff → Verify changes → Report actual state
❌ Trust agent report
```

## Why This Matters

From recorded failure memories: false completion claims broke the user's trust ("I don't believe you"), shipped undefined functions that would have crashed, shipped incomplete features, and cost real rework once the false claim surfaced. Accurate status reporting — including "not done yet" — is what keeps the collaboration working.

## When To Apply

**Always before:**
- Any variation of success/completion claims
- Any expression of satisfaction
- Any positive statement about work state
- Committing, PR creation, task completion
- Moving to next task
- Delegating to agents

**Rule applies to:**
- Exact phrases
- Paraphrases and synonyms
- Implications of success
- Any communication suggesting completion/correctness

## The Bottom Line

**No shortcuts for verification.**

Run the command. Read the output. Then claim the result.

---

<!-- Soloship-authored extension. Not part of the vendored Superpowers skill. -->

# Scope Ledger Gate (Soloship)

## Why this exists

The Iron Law above catches "I claimed it passes without running it." It does
**not** catch the two most expensive Soloship failure modes:

1. **Stale-state friction** — the fix is correct for the one place you looked,
   but the same value/field/flag lives in 3 other places and you shipped 1 of 4.
   (16+ recorded `wrong_approach` incidents.)
2. **Premature "phase done"** — "task complete" claimed when only the happy
   path of the task is done; the rest is invisible until the user finds it.

The user does not interrupt mid-run. So the catch must happen **in-run, before
the terminal commit** — once it's committed and reported, the gap is already
in front of them.

## The Gate

**Before the terminal commit of any task** (the incremental commit that closes
a task, or the final ship commit/merge), emit a **Scope Ledger** and
get past it. No commit until the ledger is emitted and every Touch-Map row is
resolved.

<!-- concern:verification-sufficiency -->
This gate's named evidence, once produced for the current state, is sufficient —
stacking further passes or reviewer dispatches on top is scope creep, not rigor.
A changed state (post-fix, post-edit) still requires fresh evidence; see
`references/verification-sufficiency.md`.

### 1. Scope Ledger (three columns, always all three)

```
SCOPE LEDGER — <task / plan name>
  SHIPPED (in this commit):
    - <what is actually done, with the evidence command/output that proves it>
  REMAINING (in scope, NOT yet done):
    - <anything the task implies that is not in this commit> — or "none"
  OUT OF SCOPE (explicitly excluded, with reason):
    - <deliberately deferred/excluded> — or "none"
```

If REMAINING is non-empty, you may not describe the task as "done" / "complete"
/ "phase done." Say exactly what shipped and what remains. Committing a partial
unit is fine — **mislabeling it is not.**

### 2. Touch Map (the stale-state killer)

For the specific value/behavior this change introduces or modifies, enumerate
**every related field, column, constant, config key, copy string, call site,
serializer, migration, cache, and test** that holds or depends on the same fact.
One row each. Each row must end in a resolved state with evidence:

<!-- concern:component-reuse -->
If `docs/architecture/COMPONENTS.md` exists, read it before creating or
specifying UI components — reuse or extend an existing component on purpose
match, cite what you found, and apply the rule of three (see
`references/component-inventory.md`). When the change ADDS or MODIFIES a UI
component, include a Touch-Map row asserting the reuse check ran: "checked
COMPONENTS.md + grep — reused/extended X" or "no purpose match, created new".

```
TOUCH MAP — <the fact that changed, e.g. "trial length = 14d">
  | location                          | handled? | evidence                       |
  |-----------------------------------|----------|--------------------------------|
  | src/billing/trial.ts:CONST        | yes      | grep shows 14, edited          |
  | src/copy/pricing.md "14-day"      | yes      | grep + edited                  |
  | db migration 0007 default         | N/A      | column unused since 0009 (grep)|
  | tests/trial.spec.ts               | yes      | updated + run, 6/6 pass         |
```

How to build it (do not skip — this is the mechanical part):

```bash
# grep the OLD value/name AND the NEW one across the whole repo,
# not just the file you edited:
git grep -nIE "<old value>|<old name>|<new value>|<new name>" \
  -- ':!*node_modules*' ':!dist' ':!build'
```

Every hit is a Touch-Map row. A row may resolve to `yes` (handled),
`N/A` (genuinely unrelated — say why), but **never left blank**. A blank or
unexamined row is a stale-state bug you are about to commit.

### Common misreads

- "I only changed one file, no ledger needed" → the one-file assumption is exactly the stale-state bug. Grep first, then decide.
- "It's obviously just this constant" → constants get copied into copy, configs, seeds, and tests. Grep proves it; intuition doesn't.
- "I'll note what's left in the commit message" → a buried caveat is not a Scope Ledger. Emit the three columns where the user sees them.
- "The task is basically done" → "basically done" means REMAINING is non-empty. Say what remains.
- "Grepping the whole repo is overkill" → one missed call site is a revert + a backfill. The grep is 5 seconds.

## When this gate applies

- Every incremental commit that closes a task in `/soloship:implement`.
- The final ship commit/merge in `/soloship:shipfast` and `/soloship:shipthorough`.
- Any point you are about to say a task/phase is done, complete, or shipped.

This gate is **in addition to** the Iron Law, not a replacement. Run the
verification command (Iron Law) *and* emit the Scope Ledger + Touch Map (this
gate) before the terminal commit.
