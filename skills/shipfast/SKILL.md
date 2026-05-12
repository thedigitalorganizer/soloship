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
- [ ] "Shipped." summary presented with commit hash and deploy target
