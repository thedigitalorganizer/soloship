---
name: shipthorough
description: |
  Full due diligence deploy pipeline. Review, coverage audit, registry update,
  CHANGELOG, plan cleanup, bisectable commits, PR, verification, deploy.
  Use after significant work when everything needs to be solid.
---

## Host Compatibility

If you are running this skill in Codex, read `../references/codex-compatibility.md` before following host-specific tool instructions. Claude Code should continue to use the Claude-specific tools and command wrappers described here.

# Soloship Ship Thorough

## Model posture (see .claude/rules/model-mode.md)

**Standard posture** (Opus/Sonnet/Codex — the default): run the pipeline
exactly as written.

**Fable posture** (model id contains `fable`/`mythos`): read this carefully —
this pipeline is nearly ALL gates. Every one of these remains binding:
pre-flight, base merge, lint+test evidence, the inline quality gate's
findings, coverage audit, the mandated code-review dispatch, registry update,
CHANGELOG, plan lifecycle flips, the Scope Ledger Gate, the Browser QA Gate
with fix-and-re-verify and teardown, the Live-Data Claim Gate, merge
mechanics, the Verification Gate, the deploy sequence, and Verify Live.

What the Fable posture buys you here is narrow: ordering flexibility where
steps are causally independent (e.g. CHANGELOG and registry can happen while
tests run), delegating independent gate-evidence production to subagents in
parallel, and freedom in the *method* behind Step 9 — the binding outcome is
that commits land reviewable and bisectable, not the specific re-staging
ritual. A shipping pipeline is where gates earn their keep; if you feel this
skill "slowing you down," that is the gate working.

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

### Step 3.5: Inline quality gate
Run each available quality tool sequentially and show a compact status block. This replaces the old `/health` gate (the separate health skill was cut during the 2026-04-24 vendoring pass; its core checks live inline here).

Detect and run:
- **TypeScript** (if `tsconfig.json` present): `npx tsc --noEmit`
- **Linter** (if `biome.json`, `.eslintrc*`, or lint script in `package.json`): the configured lint command
- **Dead code** (if `knip.json` or knip in devDependencies): `npx knip`
- **ShellCheck** (if shell scripts in `bin/` or `scripts/`): `shellcheck` over them

Present:
```
Quality gate:
  TypeScript:  pass / fail (N errors)
  Linter:      pass / fail (N issues)
  Dead code:   pass / fail (N unused exports)
  ShellCheck:  pass / fail (N issues)   [only if shell scripts exist]
```

- **All pass, or all fails are in files untouched by this PR:** proceed to Step 4.
- **Any fail in files this PR touched:** block. Ask: "Quality gate failed on changes introduced by this work. Fix before shipping, or override?" If the user overrides, note it in the PR body under a "Quality Gate Override" section.

**Why:** Tests passing doesn't mean the codebase is healthy. A passing test suite with 200 linter errors and dead code everywhere is not shippable. This step catches the category of rot that individual checks miss — without requiring a separate health skill.

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

### Step 9.5: Scope Ledger Gate (Soloship — required)

Before the merge (the point of no return where "shipped" gets claimed), invoke
the `verification-before-completion` skill and emit its **Scope Ledger**
(shipped / remaining / out-of-scope) and **Touch Map** for the entire change
set. `git grep` every value, name, field, and config key this work introduced
or changed across the whole repo — one row per hit, each resolved with
evidence. Do not proceed to Step 10 until the ledger is emitted and every
Touch-Map row is resolved. If REMAINING is non-empty, the "Shipped (thorough)"
report must state exactly what shipped and what remains — do not claim the plan
is fully delivered when it is not. This is the in-run catch for stale-state
bugs and premature phase-done over-claims.

<!-- concern:verification-sufficiency -->
This gate's named evidence, once produced for the current state, is sufficient —
stacking further passes or reviewer dispatches on top is scope creep, not rigor.
A changed state (post-fix, post-edit) still requires fresh evidence; see
`references/verification-sufficiency.md`.

### Step 9.6: Browser QA Gate (Soloship — required)

Before the merge, the user-facing surface must have been exercised in a real
browser — not just "tests pass." Per the auto-loaded `browser-qa-gate` rule:
drive every affected page/route/flow this change touches with `/soloship:browse`
(happy path **and** the states it affects), using a **test account** for any
authenticated flow. If the project has no documented test account
(`docs/testing/test-accounts.md`) and a flow needs a login, **stop and ask the
user** whether to create and document one — do not ship an untested authenticated
flow. Any issue found is fixed and **re-verified by re-running the flow** before
proceeding. Capture evidence (screenshots / observed results).

The only exemption is a change with no browser-reachable surface (pure CLI /
config / infra / non-UI migration) — state it explicitly and verify the outcome
another way. "Tests pass" / "build is green" does NOT satisfy this gate. Do not
proceed to Step 10 until it passes.

**When the gate passes, tear down before proceeding** (per the auto-loaded
`browser-tooling-priority` rule): close every Claude in Chrome tab you created
(`tabs_close_mcp`), release credential grants (`release_credentials`), close
built-in-browser pages. Leave the `/soloship:browse` daemon running — it is
shared state by design. Shipping while still holding the user's browser is what
makes the next session's QA report a phantom "browser in use."

### Step 9.7: Live-Data Claim Gate (Soloship — required when applicable)

If this change asserts or depends on any fact about live/production/CRM/financial
data — a row count, a reconciled total, a backfill size, "these now match", "X no
longer exists" — run the **evidence loop** (`references/evidence-loop.md`) and
show a provenance-complete Claims-Table row (exact query, environment, timestamp,
result + row count, verdict) before the merge. Per the `live-data-evidence-gate`
rule, a data claim with no shown query is `inferred`, not `confirmed` — never
report a reconciliation or count as fact on a query you did not run and show. If
the change asserts no live-data fact, state that and skip.

### Step 10: Merge to Base Branch Locally (default)

**Soloship default — no PR.** Soloship's user is a solo developer; the PR step adds latency without adding review value. Merge the feature branch into the base branch locally, push the base branch, delete the feature branch, clean up the worktree.

```bash
# Detect base branch
default_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
[ -z "$default_branch" ] && default_branch=$(git rev-parse --verify origin/main >/dev/null 2>&1 && echo "main" || echo "master")

# Capture feature branch name BEFORE switching
feature_branch=$(git branch --show-current)

# If we are inside a worktree, the merge happens in the main checkout
toplevel=$(git rev-parse --show-toplevel)
case "$toplevel" in
  *.worktrees/*|*/superpowers/worktrees/*)
    main_checkout=$(git worktree list --porcelain | awk '/^worktree / { print $2; exit }')
    cd "$main_checkout"
    ;;
esac

# Merge, push, clean up
git checkout "$default_branch"
git pull origin "$default_branch"
git merge --no-ff "$feature_branch" -m "Merge $feature_branch into $default_branch"
git push origin "$default_branch"
git branch -d "$feature_branch"

# Remove worktree if one existed
git worktree list | grep -q ".worktrees/$feature_branch" && \
  git worktree remove ".worktrees/$feature_branch"
```

**Merge conflicts:** stop immediately, report the conflicting files, ask the user how to proceed. Do not auto-resolve.

**Explicit PR opt-in:** if the user said "open a PR" or "push this up for review" earlier in the conversation, use the original PR flow instead:

```bash
git push -u origin HEAD
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

See the project rule set (`.codex/rules/` or `.claude/rules/`) for the global rule that drives this default.

### Step 11: Verification Gate

After the merge (or PR creation, if opt-in), re-run tests + build to verify nothing broke during review fixes / merge resolution:

```bash
npm test 2>&1
npm run build 2>&1
```

### Step 12: Deploy (via the shared production deploy sequence)

This is a **production** deploy, so it runs the shared sequence in
`references/deploy-sequence.md` (the deploy-from-main-only rule): verify
clean, synced default branch in the main checkout → acquire the deploy lock →
`git fetch --tags origin` → show the manifest (`git log prod..HEAD --oneline`,
which includes other sessions' merged work) → explicit go/no-go → deploy →
move + push the `prod` tag → release the lock (on failure paths too).

Same deployment detection as `/shipfast`:
- `firebase.json` → `firebase deploy`
- `vercel.json` → `vercel --prod`
- `netlify.toml` → `netlify deploy --prod`
- `fly.toml` → `fly deploy`

### Step 13: Verify Live (do NOT skip)

A deploy exiting 0 is not proof the fix reached production — stale bundles and
unapplied migrations are the most expensive recurring prod gap. After deploy:

1. Resolve the live URL (deploy output, CLAUDE.md, `wrangler pages deployment list`, `firebase hosting:channel:list`).
2. `curl -sS -o /dev/null -w "%{http_code}" <live-url>` → expect 2xx.
3. Confirm the **specific change** is present on the live page — grep the served HTML/asset for a string unique to this change, or open it with `/browse` and observe the new behavior. A 2xx alone is not proof; the old version returns 2xx too.
4. If a D1/Postgres migration shipped, confirm it was applied against the prod database (`wrangler d1 migrations list <DB>` or equivalent), not just committed.
5. If the live state doesn't reflect the change: rebuild, redeploy, re-verify. Do not proceed to Done until it is observably live.

## Common misreads

- "Tests pass, I can skip the coverage audit" → tests passing means existing tests pass. The coverage audit asks whether tests exist for the new code — a different question.
- "I'll clean up commits later" → non-bisectable commits become permanent the moment you push; rewriting pushed history requires a destructive force-push. Do it now.
- "The registry doesn't need updating — my changes are minor" → minor changes that affect imports shift the dependency graph. If the registry exists, it's there because dependencies matter. Update it.
- "Code review is redundant — I already reviewed as I wrote" → the 3-pass review (structural, adversarial, design-lite) catches categories of issues that authoring doesn't. You don't proofread your own essay.
- "I'll skip the verification gate — it passed before the PR" → review fixes, merge conflict resolution, and commit reorg can all introduce regressions. The verification gate exists to catch them.
- "CHANGELOG is busywork" → CHANGELOGs are the only human-readable record of what shipped and when. They're the first thing users and future-you check.

**Ship thorough uses checklists from `references/code-review-axes.md`, `references/testing-patterns.md`, and `references/performance-checklist.md`.**

---

### Done

```
Shipped (thorough).
  Merged to: [base-branch] (commit [hash])
  Commit(s) on feature branch: [count]
  Coverage: [overall assessment]
  Review: [findings summary]
  Deployed to: [platform]

  Plan: [archived/deleted/none]

  # Only if user explicitly opted into a PR:
  # PR: [URL]
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
- [ ] Feature branch merged into base branch locally; base branch pushed; feature branch deleted (default), OR PR created with Summary/Coverage/Review/Test Plan sections (only if user explicitly requested PR)
- [ ] Verification gate passed after merge or PR creation (tests + build re-run)
- [ ] Shared deploy sequence followed (`references/deploy-sequence.md`): manifest shown + go/no-go answered, deploy lock acquired and released, `prod` tag moved + pushed after success
- [ ] Live URL fetched post-deploy and the specific change confirmed visible (and any migration confirmed applied to prod) — not just a 2xx
- [ ] Plan file archived or deleted per lifecycle rules
