---
name: checkpoint
description: |
  Save and resume working state. Routes to gstack checkpoint for git state,
  decisions, and remaining work snapshots. Pairs with /onboard for session recovery.
---

# Soloship Checkpoint

Invoke the `checkpoint` skill (gstack). It captures a snapshot of where you are:
git state, decisions made during the session, and what remains to be done.

## When to Save

- Before running `/clear` (context boundary — checkpoint preserves what matters)
- When switching branches or projects
- End of a work session
- Before a long break
- After completing a major phase of a plan

## What Gets Captured

1. **Git state** — current branch, uncommitted changes, recent commits
2. **Decisions made** — choices from this session that a fresh agent needs to know
3. **Remaining work** — what's left to do, with enough context to pick up cold
4. **Plan reference** — if a plan in `docs/plans/` drove this work, link to it

## Resuming from a Checkpoint

When the user says "where was I" or "resume":
1. Read the most recent checkpoint for the current branch
2. Present a summary: what was done, what's left, any decisions to remember
3. Offer to continue: "Ready to pick up from [last task]. Want me to continue?"

This is how `/onboard` should start for returning users — read the checkpoint
first, then fill gaps from CLAUDE.md and git history.

## Freshness

Checkpoints older than 7 days are informational only. The codebase may have
changed significantly. Note the age and suggest reading current git history
alongside the checkpoint.

## Verification

Checkpoint is not complete until ALL of these are true:

- [ ] Git state captured (branch, status, recent commits)
- [ ] Key decisions from this session documented
- [ ] Remaining work listed with actionable specificity
- [ ] Plan file referenced (if one exists for this work)
- [ ] Checkpoint written to gstack's checkpoint storage
