---
name: shipfast
description: |
  Emergency deploy pipeline. Something's broken in prod, you fixed it, get it
  live NOW. Lint, test, build, commit, push, deploy. Minimum viable safety
  checks, maximum speed.
---

# Soloship Ship Fast

This is the emergency path. Use when something is broken in production and the
fix needs to go live immediately.

## The Pipeline

Run these steps sequentially. Stop on first failure.

### 1. Lint
```bash
npm run lint 2>&1 || npx eslint . 2>&1
```
If lint fails with auto-fixable issues, fix them and continue.
If lint fails with real errors, fix them before proceeding.

### 2. Test
```bash
npm test 2>&1
```
If tests fail, determine if the failure is related to your changes or pre-existing.
- Related to your changes → fix before proceeding
- Pre-existing → note it, continue (don't block a production hotfix for unrelated test failures)

### 3. Build
```bash
npm run build 2>&1
```
Must pass. If build fails, fix before proceeding.

### 4. Commit

**Scope Ledger Gate (Soloship — MANDATORY, even in emergency):** Before this
commit, invoke `verification-before-completion` and emit its **Scope Ledger**
(shipped / remaining / out-of-scope) and **Touch Map**. Emergency fixes are the
*highest*-risk place for stale-state bugs — a hotfix that patches 1 of 4 copies
of the broken value ships the bug right back. `git grep` the changed value/name
across the whole repo; resolve every hit with evidence before committing. If
anything is REMAINING, the "Shipped." report must say so.

Stage the changed files (be specific — don't `git add -A`).
Write a concise commit message with the appropriate prefix:
- `fix:` for bug fixes
- `feat:` for new features
- `refactor:` for refactoring

If the commit is `feat:` or `fix:`, check that CHANGELOG.md was updated.
If not, add a one-line entry to the [Unreleased] section.

### 5. Push
```bash
git push
```

### 6. Deploy
Detect the deployment platform and deploy:
- `firebase.json` exists → `firebase deploy`
- `vercel.json` exists → `vercel --prod`
- `netlify.toml` exists → `netlify deploy --prod`
- `fly.toml` exists → `fly deploy`
- `Dockerfile` exists → follow project-specific deploy instructions in CLAUDE.md
- None detected → ask the user how to deploy

### 7. Verify Live (do NOT skip — this is the recurring prod-gap fix)

A deploy command exiting 0 does not mean the fix is live. The single most
expensive recurring failure is "shipped" being reported when a stale bundle or
unapplied migration meant the fix never reached users. Before reporting Done:

1. Get the live URL (deploy command output, CLAUDE.md, or `wrangler pages deployment list` / `firebase hosting:channel:list`).
2. Fetch it and confirm it is the NEW version, not cached/old:
   ```
   curl -sS -o /dev/null -w "%{http_code}" <live-url>      # expect 2xx
   ```
   Then verify the actual change is present — grep the deployed HTML/asset for a string unique to this fix, or open it with `/browse` and confirm the changed behavior is visible. A 200 alone is not proof; the old version also returns 200.
3. If the live page does not reflect the change: the artifact was stale or the deploy targeted the wrong target. Rebuild, redeploy, re-verify. Do not report Done until the change is observably live.

### Done

```
Shipped.
  Commit: [hash] [message]
  Deployed to: [platform]
```

## What Ship Fast Does NOT Do
- Code review
- Coverage audit
- PR creation
- Registry updates
- Plan lifecycle cleanup
- Frill sync

Those are `/shipthorough` responsibilities. Ship fast is for getting fixes live.

## Verification

Ship fast is not complete until ALL of these are true:

- [ ] Lint passed (or auto-fixed and re-passed)
- [ ] Tests passed (or pre-existing failures documented)
- [ ] Build succeeded
- [ ] Changes committed with appropriate prefix (fix:/feat:/refactor:)
- [ ] Pushed to remote
- [ ] Deployed to detected platform (or user-specified target)
- [ ] Live URL fetched and the specific change confirmed visible on it (not just a 2xx)
- [ ] "Shipped." summary presented with commit hash and deploy target
