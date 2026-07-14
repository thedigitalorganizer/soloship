---
title: Plan frontmatter lies when the status flip is prose instead of a gate
date: 2026-07-14
category: workflow-issues
components: [skills/plan, skills/implement, skills/finish, src/hooks.ts]
status: current
---

# Plan frontmatter lies when the status flip is prose instead of a gate

## Symptom

Command Center's `docs/plans/` contained four plans whose frontmatter said
`status: Not started` for work that was **live in production** (sales-coach cost
telemetry, deal→client linking, the QBO import, the Stripe reconcile). A cleanup
agent had to derive every plan's real state from merged commits and live code,
because the plans could not be trusted about themselves.

The danger is not untidiness. Agents *read* plans and act on them. An agent that
reads "Not started" for the QBO import will implement the QBO import a second
time.

## Root cause

Two independent defects that compounded.

**1. The status flip had no mechanical floor.** The instructions existed and were
correct — `/plan` writes `status: planned`, `/implement` is told to flip to
`in-progress` on claim and `done` at completion, `/finish` also writes `done` on
merge. But **nothing verified any of those writes happened**, and the `done` write
sat at line 608 of a 767-line skill: step 4 of 5, in the final section.

That is the worst possible position for a load-bearing write. It only fires if
`/implement` runs to completion, in one session, uninterrupted. Every other path
produces a lying plan with ~100% probability:

- work done conversationally, without `/implement` at all
- `/implement` interrupted by context compaction before reaching its tail
- work shipped via `/shipfast` (which never touched plan status)
- multi-session work where session 2 never re-claims the plan

Soloship installed 16 hooks at the time — billing gate, deploy discipline,
recurrence gate, CHANGELOG check — and **not one read a plan's status.** Plan
status was the only Soloship invariant left as a polite request. Kathy Sierra's
collapse zone, cited in Soloship's own CLAUDE.md, predicts exactly this: *only
automated process survives.*

**2. `docs/plans/` was an unguarded namespace — and the skills themselves were
polluting it.** In Command Center, 9 of 17 files in `docs/plans/` were not plans:
drafts, grill outputs, design notes, decision logs, handoffs, a morning report.
The correlation was perfect — every real `/plan` output had status frontmatter;
every other artifact had none.

The source was not user error. **`grill-me`, `brainstorm`, and `spec` were all
writing their outputs into `docs/plans/` by design.** A fourth location,
`docs/brainstorms/`, existed as stray sprawl. So even a perfect status contract
would have governed only half the directory.

## Fix

Check the plan's claim against **git evidence** at the two moments evidence
exists — the first code commit and the merge — instead of trusting a self-report
at the tail of a skill.

- **plan-truth gate** (PreToolUse/Bash) — blocks a **code** commit on a branch
  whose plan still says `planned`. Docs-only commits pass: writing the plan is
  the one moment `planned` is honest. That discriminator (staged files ⊄ `docs/`)
  is what makes the gate usable instead of maddening.
- **plan-merge gate** (PreToolUse/Bash) — blocks merging a branch whose plan is
  still open. After the merge there is no natural moment left that would prompt
  the flip.
- **plan-namespace gate** (PreToolUse/Edit|Write) — `docs/plans/` holds live plans
  only; the block message routes the file to the folder it actually belongs in.
- **Stop backstop** — surfaces plans whose open status contradicts an already-
  merged branch. Catches work done with no branch, outside any skill — the case
  the other gates structurally cannot see.

Plus the taxonomy: `docs/drafts/` (deleted on promotion to a plan),
`docs/handoffs/` (deleted on consume), `docs/reports/` (historical), decision logs
to `docs/architecture/decisions/`. The exploration skills now write to
`docs/drafts/`.

## Prevention

- **A rule with no gate is a suggestion.** If an invariant matters, ask what
  mechanically fires when it is violated. If the answer is "the agent is supposed
  to remember," it will be violated.
- **Never put a load-bearing write at the end of a long skill.** The end is where
  context runs out. Write state at the moment reality changes, not in a cleanup
  step.
- **Verify against evidence, not self-report.** "Did the agent say it did X" is a
  weaker question than "does the repo show X happened."
- **Check whether the tooling itself is the polluter** before blaming discipline.
  Three skills were writing non-plans into the plans folder; no amount of user
  care would have fixed that.

## Bonus bug found while testing

The Stop and phone-a-friend hooks JSON-escaped their output with a hand-rolled
`sed "s/\"/\\\\\"/g"`. After TypeScript template-literal expansion **and** shell
quote expansion, this rendered as `s//\\/g` — an **empty regex**. sed exited with
`first RE may not be empty`, and the hooks emitted **nothing at all**.

Every message those two hooks ever tried to surface had been silently discarded.
It went unnoticed because the messages were advisory and their absence looks
identical to "nothing to report" — the same silent-failure shape as a dead cron.

It surfaced only because the new plan-truth backstop was the first message
reliably non-empty enough to make someone check. Both sites now delegate to a real
JSON encoder (`emitSystemMessage`) instead of escaping JSON by hand in shell.

**Lesson:** never hand-escape JSON in a shell script. Two layers of quote
expansion (TS template literal → bash) make it nearly impossible to reason about,
and the failure is silent.
