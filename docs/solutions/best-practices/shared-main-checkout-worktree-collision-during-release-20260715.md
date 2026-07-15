---
title: The shared main checkout is not yours during a release — commit+push early, isolate multi-step work
date: 2026-07-15
producer: soloship-learn
version: 1
ttl_days: 90
content_hash: 4124a7d9c993
problem_type: best_practice
category: best-practices
components: [release-process, multi-session, git-worktrees]
files: [package.json, CHANGELOG.md, skills/references/evidence-loop.md, scripts/validate-plugin-metadata.js]
symptoms: [another session's uncommitted changes appear in your git status, your committed working-file edit is reverted in the working tree by a parallel merge, npm version refuses to run because the tree is dirty with someone else's WIP, main is red from a parallel release]
root_cause: missing_workflow_step
resolution_type: workflow_improvement
tags: [parallel-sessions, worktrees, release, shared-checkout, working-tree, commit-early, deploy-train]
---

# The shared main checkout is not yours during a release

## Problem

While implementing a plan (Phases 0–4 committed on a `feat/` worktree, then
merged to `main`), the worktree was removed and the final release (Phase 5) was
run from the **shared main checkout**. With 2–5 parallel Claude sessions active in
the same repo, that checkout was a contested space:

- **Another session's uncommitted WIP appeared in my `git status`** — a whole
  `vitest` test suite (`package.json` `test` script + devDep, regenerated
  `package-lock.json`, `.github/workflows/ci.yml`, `__arch__/fitness.test.ts`).
  Not mine, but sitting in the working tree I was about to release from.
- **A parallel merge silently reverted my committed edit in the working file.**
  My Phase 4 change to `skills/references/evidence-loop.md` (already committed as
  `cce5c27` and pushed) showed the *old* pre-edit text in the working tree,
  because another session's in-flight branch carried the older version.
- **`npm version` was blocked** — it refuses a dirty tree, and forcing it would
  have swept the other session's WIP into my release commit.
- **`main` was already red** — the parallel 0.16.0 release added a 14th rule to
  `src/rules.ts` but left the validator's `REQUIRED_RULE_COUNT` at 13, shipping a
  failing `validate:plugins` in a published version.

## Solution

**Committed + pushed work is the only durable state; the shared working tree is
not.** My Phase 4 survived every collision because it was committed and pushed —
`git merge-base --is-ancestor cce5c27 HEAD` confirmed it stayed in history, and
`git show HEAD:skills/references/evidence-loop.md` confirmed the merged HEAD kept
my edit. The scary working-tree revert was a transient view, never touched
history.

Discipline that held it together:

```bash
# 1. Never trust a working-file readback in a shared checkout — check HEAD/history.
git merge-base --is-ancestor <your-commit> HEAD   # did my work survive?
git show HEAD:<path> | grep <marker>              # what does the merged tree actually have?

# 2. Before a release, re-fetch and confirm you are current, then check the tree
#    is dirty with ONLY your own staged release files.
git fetch origin main -q && git rev-list --count HEAD..origin/main   # 0 = current
git status --short                                                   # anything you don't own?

# 3. If the tree carries another session's WIP, do NOT stash-race it and do NOT
#    sweep it into your commit. Either wait for them to commit/merge, or run the
#    release from a fresh worktree checked out at origin/main (clean, isolated).
```

## Prevention

- **Run multi-step, irreversible work (a release, a backfill) from an isolated
  worktree off `origin/main`, not the shared main checkout.** Removing your
  feature worktree and finishing "just the release" in `main` drops you back into
  the contested tree. This is the release-side application of the always-on
  `use-worktrees` rule.
- **Commit and push early and often.** The working tree in a shared checkout can
  be reverted, overwritten, or polluted by a parallel session at any instant;
  history cannot. If it matters, it is committed and pushed — not "saved in the
  working file."
- **A dirty tree with files you did not touch is a stop sign, not a nuisance.**
  `npm version` blocking on it is the guardrail working. Never `git stash`-race
  another session's live edits (see the repo's cross-worktree stash footgun).
- **Do the release as one clean commit** (`npm version --no-git-tag-version` +
  manually sync the 4 version files + CHANGELOG in a single commit + tag) rather
  than the `npm version` auto-commit + `--amend` + `--force-with-lease` dance —
  the force-push is the step most likely to collide under concurrency.
- **When you find `main` red, fix it even if another session caused it** — a
  red default branch is load-bearing for every session. Here: bump
  `REQUIRED_RULE_COUNT` to match the actually-registered rule count.

## Related

- `docs/solutions/best-practices/parallel-session-release-collision-verify-before-npm-version-20260706.md`
  — the version-*number* sibling of this working-*tree* collision (check the
  registry before minting a version).
- The `use-worktrees` and cross-worktree stash/index footgun rules in
  `.claude/rules/` — the mechanical discipline this reinforces.
