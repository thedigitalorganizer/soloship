---
name: verification-before-completion
description: Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming output before making any success claims; evidence before assertions always
---

## Host Compatibility

If you are running this skill in Codex, read `../references/codex-compatibility.md` before following host-specific tool instructions. Claude Code should continue to use the Claude-specific tools and command wrappers described here.

<!-- Vendored from superpowers v6.0.3 (Jesse Vincent). See skills/vendored/superpowers/LICENSE. Base content unchanged from 4.1.1 through 6.0.3; bumped to confirm currency. Soloship's Scope Ledger Gate extension below is unaffected. -->

# Verification Before Completion

## Overview

Claiming work is complete without verification is dishonesty, not efficiency.

**Core principle:** Evidence before claims, always.

**Violating the letter of this rule is violating the spirit of this rule.**

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you haven't run the verification command in this message, you cannot claim it passes.

## The Gate Function

```
BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim

Skip any step = lying, not verifying
```

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

## Red Flags - STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification ("Great!", "Perfect!", "Done!", etc.)
- About to commit/push/PR without verification
- Trusting agent success reports
- Relying on partial verification
- Thinking "just this once"
- Tired and wanting work over
- **ANY wording implying success without having run verification**

## Rationalization Prevention

| Excuse | Reality |
|--------|---------|
| "Should work now" | RUN the verification |
| "I'm confident" | Confidence ≠ evidence |
| "Just this once" | No exceptions |
| "Linter passed" | Linter ≠ compiler |
| "Agent said success" | Verify independently |
| "I'm tired" | Exhaustion ≠ excuse |
| "Partial check is enough" | Partial proves nothing |
| "Different words so rule doesn't apply" | Spirit over letter |

## Key Patterns

**Tests:**
```
✅ [Run test command] [See: 34/34 pass] "All tests pass"
❌ "Should pass now" / "Looks correct"
```

**Regression tests (TDD Red-Green):**
```
✅ Write → Run (pass) → Revert fix → Run (MUST FAIL) → Restore → Run (pass)
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

From 24 failure memories:
- your human partner said "I don't believe you" - trust broken
- Undefined functions shipped - would crash
- Missing requirements shipped - incomplete features
- Time wasted on false completion → redirect → rework
- Violates: "Honesty is a core value. If you lie, you'll be replaced."

## When To Apply

**ALWAYS before:**
- ANY variation of success/completion claims
- ANY expression of satisfaction
- ANY positive statement about work state
- Committing, PR creation, task completion
- Moving to next task
- Delegating to agents

**Rule applies to:**
- Exact phrases
- Paraphrases and synonyms
- Implications of success
- ANY communication suggesting completion/correctness

## The Bottom Line

**No shortcuts for verification.**

Run the command. Read the output. THEN claim the result.

This is non-negotiable.

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

**Before the terminal commit of ANY task** (the incremental commit that closes
a task, or the final ship commit/merge), you MUST emit a **Scope Ledger** and
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

### Rationalizations — STOP

| Excuse | Reality |
|--------|---------|
| "I only changed one file, no ledger needed" | The one-file assumption is exactly the stale-state bug. Grep first, then decide. |
| "It's obviously just this constant" | Constants get copied into copy, configs, seeds, and tests. Grep proves it; intuition doesn't. |
| "I'll note what's left in the commit message" | A buried caveat is not a Scope Ledger. Emit the three columns where the user sees them. |
| "The task is basically done" | "Basically done" = REMAINING is non-empty. Say what remains. |
| "Grepping the whole repo is overkill" | One missed call site is a revert + a backfill. The grep is 5 seconds. |

## When this gate applies

- Every incremental commit that closes a task in `/soloship:implement`.
- The final ship commit/merge in `/soloship:shipfast` and `/soloship:shipthorough`.
- Any point you are about to say a task/phase is done, complete, or shipped.

This gate is **in addition to** the Iron Law, not a replacement. Run the
verification command (Iron Law) *and* emit the Scope Ledger + Touch Map (this
gate) before the terminal commit.
