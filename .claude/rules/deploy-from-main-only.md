# Deploy From Main Only (Auto-Loaded)

## The Rule

**Production only ever runs the default branch.** A production deploy means:
merge to the default branch (`main`/`master`) first, then deploy from a
**clean, synced default-branch checkout in the main working copy** — never from
a worktree, never from a feature branch, never with uncommitted changes.

**Preview/channel deploys are exempt** and stay allowed from worktrees and
feature branches (`wrangler pages deploy --branch=<preview>`, `vercel`
without `--prod`, `firebase hosting:channel:deploy`, `netlify deploy`
without `--prod`). Browser QA depends on worktree sessions deploying previews
to test against — that must keep working.

## Why

With parallel agent sessions in worktrees, deploying from a worktree breaks the
one invariant that makes multi-session deploys safe: **what is live is always a
commit on the default branch's history**. Once production runs a worktree
commit, a later (perfectly correct) deploy from the default branch silently
rolls back the worktree's fix — the most expensive multi-session failure mode.

## The Deploy Train

Merge freely, deploy deliberately. Merging to the default branch and deploying
are separate decisions: merged-but-undeployed work simply waits for the next
train. Batching several merged changes into one deploy is normal and good —
especially when deploys are slow. Never treat "it merged" as "it must deploy
now," and never deploy around the queue because another session is mid-deploy.

## The Contracts

1. **The `prod` tag marks what is live.** Pin the SHA before deploying
   (`DEPLOY_SHA=$(git rev-parse HEAD)`), then after every successful
   production deploy: `git tag -f prod "$DEPLOY_SHA" && git push -f origin
   prod` — never a bare `git tag -f prod`, which tags whatever HEAD is at
   that moment and races concurrent merges. Repos that deploy
   multiple targets use `prod-<target>` per target. If a repo already uses a
   `prod` tag for something else, fall back to `soloship-prod`. The tag
   answers "what's live" for every session and machine; it marks what was
   *deployed*, not what is observably *live* (post-deploy verification is its
   own gate).
2. **Every production deploy shows a manifest first.** `git fetch --tags
   origin`, then `git log prod..HEAD --oneline` → present "this deploy ships
   these N changes" (including other sessions' merged work) → explicit
   go/no-go from the user. First deploy (no `prod` tag yet) is stated
   explicitly and creates the tag.
3. **One deploy at a time.** Acquire the deploy lock
   (`<git-common-dir>/soloship/deploy.lock`) before deploying; release it on
   success and failure. A fresh lock owned by another session = wait or ask,
   never proceed. A stale lock (older than the `deploy_lock_stale_min`
   threshold in `<git-common-dir>/soloship/config.json`) is *presumed*
   abandoned but never auto-broken — surface it and let the user decide.

The full step-by-step sequence lives in the Soloship skill reference
`references/deploy-sequence.md` and is what `/soloship:shipfast` and
`/soloship:shipthorough` run. Follow it for any manual production deploy too.

## When This Triggers

- Any production deploy command, from any skill or ad-hoc request.
- The PreToolUse deploy-discipline hook is the mechanical floor: it blocks
  production deploys from a worktree, from a non-default branch, with a dirty
  tree, or past another session's fresh deploy lock. The manifest and go/no-go
  conversation are skill-level (hooks cannot converse) — this rule is what
  makes them mandatory.
- Platform-side auto-deploys (git-integration, CI) bypass local enforcement;
  if a project adopts them, platform branch controls become the enforcement
  point.
