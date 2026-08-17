# Plan Truth + Artifact Lifecycle (Auto-Loaded)

## The Rule

**A plan's status must never lie, and `docs/plans/` holds plans only.**

Agents READ plans and act on them. A plan whose frontmatter says `planned` for
work that is already live in production will send the next agent to build that
work a second time. This is not hypothetical — it is the defect this rule exists
to prevent, found in the wild in 2026-07 with four plans claiming "Not started"
for shipped features.

## The status vocabulary

| Status | Means | Written by |
|--------|-------|-----------|
| `planned` | plan written, work not started | `/soloship:plan` |
| `in-progress` | a session has claimed it and is executing | `/soloship:implement` on claim |
| `blocked` | started, cannot proceed (say why in the plan) | whoever hits the blocker |
| `done` | the work is merged and live | `/soloship:implement` / `/soloship:finish` on merge |
| `abandoned` | will not be built | whoever decides |
| `superseded` | replaced by another plan (name it) | the replacing plan's author |

Legacy values map on read: `Not started` → `planned`, `active` →
`in-progress`, `completed` → `done`.

**Flip the status at the moment the reality changes** — when you claim the plan,
and when the work merges. Never "at the end," because the end is where context
runs out and the write silently never happens. That is exactly how plans came to
lie in the first place.

## The document taxonomy

`docs/plans/` is not a folder for plan-shaped documents. It is a folder for
**live plans**, and everything in it must carry a valid status.

| If it is… | It goes in… | Lifecycle |
|---|---|---|
| A live plan | `docs/plans/` | Archived or deleted when done (see plan-lifecycle) |
| A draft, design note, brainstorm, or grill output | `docs/drafts/` | **Deleted when promoted into a plan** |
| A session handoff | `docs/handoffs/` | **Deleted when consumed** |
| A point-in-time report or snapshot | `docs/reports/` | Historical; never actionable, never cleaned |
| A decision log / ADR | `docs/architecture/decisions/` | Durable |

**The self-cleaning contracts are mandatory:**

- **Draft → plan:** when a draft becomes a plan, the plan records
  `promoted_from: docs/drafts/<file>` and the draft is `git rm`'d **in the
  same commit**. Two live copies means the next agent must guess which is current.
- **Handoff → consumed:** a handoff is consumed exactly once. The skill that
  executes it deletes it. A handoff that outlives its execution describes a world
  that no longer exists.

## Mechanical floor

Five gates enforce this; they are the floor, not the rule:

- **plan-truth gate** (PreToolUse/Bash) — blocks a **code** commit on a branch
  whose plan still says `planned`. Docs-only commits pass (writing the plan is
  when `planned` is honest).
- **plan-merge gate** (PreToolUse/Bash) — blocks merging a branch whose plan is
  still `planned`/`in-progress`.
- **plan-namespace gate** (PreToolUse/Edit|Write) — blocks writing a file into
  `docs/plans/` without valid status frontmatter, and names the folder it
  belongs in instead.
- **plan-done-checklist gate** (PreToolUse/Edit|Write) — blocks setting
  `status: done` while the plan body still lists an unchecked `- [ ]` box or a
  PENDING/BLOCKED/IN PROGRESS marker. A merged branch or a self-report is not
  the same claim as "this plan is finished" — the gate makes the plan's own
  body the tiebreaker.
- **Stop backstop** — surfaces any plan whose open status contradicts a merged
  branch, and any statusless file sitting in `docs/plans/`. It reads the plan
  body, not just frontmatter: with no open-item markers present, the message
  is a direct command to flip the status (the frontmatter is provably stale).
  With open items still listed, "merged" and "done" are not the same claim —
  the message prompts a review of the Cutover/QA Plan/Done-When sections
  instead of asserting the work is finished.

Escape hatch: `.ai/.plan-status-ack`. As with the billing and recurrence gates,
creating it without a real, written reason removes the protection the gate
provides — don't do it; if the gate seems wrong, surface that to the user
instead. If a gate fires, the default correct response is to **fix the status**,
not to silence the gate.

## When This Triggers

- Any commit of code that a plan describes.
- Any merge of a branch a plan describes.
- Any write into `docs/plans/`.
- Any time a draft becomes a plan, or a handoff is executed.
