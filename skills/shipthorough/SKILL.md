---
name: shipthorough
description: |
  Full due diligence deploy pipeline. Review, coverage audit, registry update,
  CHANGELOG, plan cleanup, bisectable commits, PR, verification, deploy.
  Use after significant work when everything needs to be solid.
---

# Soloship Ship Thorough

This is the full pipeline. You've done real work — make sure it's solid before
it goes live.

## The Pipeline

### Step 1: Pre-flight
```bash
git status
git diff --stat main...HEAD 2>/dev/null || git diff --stat
```
Confirm: correct branch, changes look right, nothing unexpected staged.

### Step 2: Merge base branch
```bash
git fetch origin main && git merge origin/main
```
If conflicts exist, resolve them before proceeding.

### Step 3: Lint + Test
```bash
npm run lint 2>&1
npm test 2>&1
```
Both must pass. If tests fail, triage:
- Your changes broke it → fix before proceeding
- Pre-existing failure → note it, but don't block ship for unrelated failures

### Step 3.5: Health Gate
Run `/health` to get the composite quality score. Present the result:

```
Health: [N]/10 (was [M]/10 last check)
  TypeScript:  pass/fail
  Linter:      pass/fail
  Tests:       pass/fail
  Dead code:   pass/fail
```

- **Score 5+:** Proceed to Step 4.
- **Below 5:** Block. Show what's dragging the score down and ask:
  "Health score is [N]/10. Fix issues before shipping, or override?"
  If the user overrides, note it in the PR body under a "Health Override" section.

**Why:** Tests passing doesn't mean the codebase is healthy. A passing test suite
with 200 linter errors and dead code everywhere is not shippable. The health
score catches the category of rot that individual checks miss.

### Step 4: Coverage Audit
Assess test coverage for the changed code:
- Which changed files have tests?
- Which changed functions are tested?
- Are edge cases covered?
- Present an ASCII summary:

```
Coverage Assessment:
  src/services/auth.ts     ████████░░ 80% (missing: token refresh edge case)
  src/components/Login.tsx  ██████████ 100%
  src/hooks/useSession.ts  ████░░░░░░ 40% (no tests for timeout handling)
```

If coverage is critically low on important code, write the missing tests.

### Step 5: Code Review
Run the `/review` skill's code review process (3-pass: structural, adversarial,
design-lite if frontend changes). Fix any critical/high findings.

### Step 6: Registry Update (if registry exists)
**Freshness check:** If the registry has frontmatter with `date` and `ttl_days`,
and it's past expiration, warn before updating: "Registry is N days old — verify
entries against current code before extending."

If `docs/architecture/REGISTRY.md` exists:
1. Read the diff
2. Update component entries if dependencies changed
3. Add new components if new modules were created
4. Add decision records if Key Decisions were made
5. Include registry changes in the commit

### Step 7: CHANGELOG
Ensure `CHANGELOG.md` is updated for all `feat:`, `fix:`, `refactor:` changes.
Add entries to the [Unreleased] section if missing.

### Step 8: Plan Lifecycle
Check if a plan file in `docs/plans/` drove this work:
- **Small plan** (< 3 tasks, < 5 files, no key decisions) → `git rm` the plan
- **Large plan** (multi-phase, 5+ files, architectural decisions) → `git mv` to `docs/plans/archive/`
- Include cleanup in the commit

### Step 9: Bisectable Commits
Review the commit history on this branch. If it's one giant commit, consider
splitting into logical, bisectable commits:
- One commit per logical change
- Each commit should build and pass tests independently
- Use `git rebase` to reorganize if needed (ask user first)

### Step 10: Push + Create PR
```bash
git push -u origin HEAD
```

Create a PR with structured body:
```
gh pr create --title "SHORT_TITLE" --body "$(cat <<'EOF'
## Summary
- [bullet points of what changed and why]

## Coverage
[ASCII coverage assessment from Step 4]

## Review
[Summary of review findings — count by severity, critical items listed]

## Test Plan
- [ ] [verification steps]

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Step 11: Verification Gate
After PR is created, re-run tests to verify nothing broke during review fixes:
```bash
npm test 2>&1
npm run build 2>&1
```

### Step 12: Deploy
Same deployment detection as `/shipfast`:
- `firebase.json` → `firebase deploy`
- `vercel.json` → `vercel --prod`
- `netlify.toml` → `netlify deploy --prod`
- `fly.toml` → `fly deploy`

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Tests pass, I can skip the coverage audit" | Tests passing means existing tests pass. Coverage audit asks: do tests exist for the NEW code? Different question. |
| "I'll clean up commits later" | Non-bisectable commits become permanent the moment you push. Rewriting history after push requires force-push, which is destructive. Do it now. |
| "The registry doesn't need updating — my changes are minor" | Minor changes that affect imports shift the dependency graph. If the registry exists, it's there because dependencies matter. Update it. |
| "Code review is redundant — I already reviewed as I wrote" | The 3-pass review (structural, adversarial, design-lite) catches categories of issues that authoring doesn't. You don't proofread your own essay. |
| "I'll skip the verification gate — it passed before the PR" | Review fixes, merge conflict resolution, and commit reorg can all introduce regressions. The verification gate exists to catch them. |
| "CHANGELOG is busywork" | CHANGELOGs are the only human-readable record of what shipped and when. They're the first thing users and future-you check. |

**Ship thorough uses checklists from `references/code-review-axes.md`, `references/testing-patterns.md`, and `references/performance-checklist.md`.**

---

### Done

```
Shipped (thorough).
  PR: [URL]
  Commit(s): [count] commits
  Coverage: [overall assessment]
  Review: [findings summary]
  Deployed to: [platform]

  Plan: [archived/deleted/none]
```

## Verification

Ship thorough is not complete until ALL of these are true:

- [ ] Lint passes (show output)
- [ ] Tests pass (show output)
- [ ] Build succeeds (show output)
- [ ] Health score computed (5+ to proceed, or user override documented)
- [ ] Coverage audit presented (ASCII chart with per-file assessment)
- [ ] Code review ran (3-pass) and no unresolved Critical/Important findings
- [ ] CHANGELOG updated for all feat:/fix:/refactor: changes
- [ ] PR created with Summary, Coverage, Review, and Test Plan sections
- [ ] Verification gate passed after PR creation (tests + build re-run)
- [ ] Plan file archived or deleted per lifecycle rules
