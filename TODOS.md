# TODOS

## Spike: concurrent worktree phases with merge-time conflict gate

**What:** Run independent plan phases concurrently in separate git worktrees,
integrating with a merge-time conflict check, instead of Soloship's current
sequential-only execution.

**Why:** Independent phases run one-at-a-time today. Concurrent execution could
cut multi-phase plan wall-time substantially. Deferred from the
2026-05-18 deploy plan during eng-review — the concurrency model is unproven
and generated repeated "well, except…" in review, which is the signal it is
experiment-ready, not plan-ready.

**Starting model (operator's instinct, judged sound in review — start the
spike here):** Don't build runtime locking / claim-board coordination. Instead:
N worktrees + branches, agents work independently, and at *integration* time
analyze each branch with `git merge-tree` before merging; on conflict, resolve
that file (rebase/manual) and continue. The merge-time gate is the authoritative
safety net for textual conflicts. Residual risk: *semantic* conflicts (cleanly
mergeable files that are broken together) — surfaces as a failed test/build at
integration, acceptable and already gated.

**Prove before planning:**
- Can the orchestrator reliably dispatch N background agents and join on all
  completions before integrating? (The join protocol is the unproven part.)
- Does `git merge-tree` pre-merge analysis catch the real conflict cases in
  practice on a throwaway 2-phase example?
- Is the semantic-conflict residual genuinely caught by the integration
  test/build gate, or does it slip through silently?

**Cons / risks:** reverses Soloship's deliberate "never parallel-dispatch"
safety default (`subagent-driven-development:171`); join protocol unproven;
semantic-conflict residual.

**Depends on / blocked by:** nothing. Pure spike. Do it as a throwaway
prototype, not a plan, until a model survives contact with reality.

## Platform-level deploy protection (backstop for local deploy discipline)

**What:** Configure each deploy platform (Cloudflare Pages/Workers, Firebase,
Vercel) so production deploys can only come from `main` — platform-side branch
controls, not just local tooling.

**Why:** The 2026-07-06 deploy-discipline plan enforces main-only deploys with
local hooks and a machine-local lock. Anything that deploys *without* the local
toolchain — a CI job, a git-integration auto-deploy, a click in the platform
dashboard — bypasses all of it. Today Shawn deploys manually via CLI, so the
gap is theoretical; it becomes real the day any project adopts auto-deploys.

**Pros:** Closes the only bypass class the local system can't see; per-platform
setting, no code.
**Cons:** Per-platform config work; some platforms gate this behind plan tiers;
must be repeated for each new project/target.

**Context:** Surfaced by the outside-voice (Codex) review of
`docs/plans/2026-07-06-feat-deploy-discipline-and-session-coordination-plan.md`
(finding: "production only ever runs main is not enforced at the production
system"). Start with the project that has the slow deploys, then Command
Center. The moving `prod-*` tags from that plan tell you which targets exist.

**Depends on / blocked by:** The deploy-discipline plan landing first (so the
local system exists for the platform side to backstop).

## BUG: `git tag -f prod` races concurrent merges — tags HEAD, not what shipped

**What:** Step 5 of the deploy sequence runs `git tag -f "$PROD_TAG"` with no
commit-ish, so it tags whatever HEAD is *at the moment it runs* rather than the
commit that was actually deployed. Fix: pin the SHA before deploying and tag
that value.

```bash
DEPLOY_SHA=$(git rev-parse HEAD)          # before the deploy
# ... deploy ...
git tag -f "$PROD_TAG" "$DEPLOY_SHA"      # after — never bare
git push -f origin "$PROD_TAG"
git rev-parse --short "refs/tags/$PROD_TAG"   # confirm it matches
```

**Why:** A production deploy takes minutes. With parallel sessions merging into
a shared main checkout — the exact environment `deploy-from-main-only` exists to
protect — `main` advances *during* the deploy, and the tag lands on a commit
that was never shipped. This is the third member of the shared-`.git` family
already documented for the index and the stash (`use-worktrees.md`); here the
shared mutable thing is HEAD itself.

The failure is silent and **directional**: the tag always drifts *forward*, so
`git log prod..HEAD` under-reports. A session asking "what still needs
deploying?" is told "nothing" while real changes sit unshipped. That is the
dangerous direction for this error to run, and it defeats contract 2 (the
manifest gate) as well as contract 1.

**Confirmed, not theoretical.** Hit on 2026-08-02 during a Chloropal functions
deploy: deployed `7050efd`, tag landed on `e8bb37b` (another session's merge
that arrived mid-deploy). Caught only because the push output echoed a SHA that
did not match. Full write-up in Chloropal:
`docs/solutions/workflow-issues/prod-tag-races-concurrent-merges.md`.

**Four places to fix (all currently carry the bare command):**
- `skills/references/deploy-sequence.md:115` — Step 5. **Highest priority** —
  this is the executable path `/shipfast` and `/shipthorough` run, so the race
  is live in every Soloship-driven deploy in every project.
- `src/rules.ts:878` — the generator that emits both rule files below; the
  upstream fix.
- `.claude/rules/deploy-from-main-only.md:35` and
  `.codex/rules/deploy-from-main-only.md:35` — regenerate from `src/rules.ts`
  rather than hand-editing.

Chloropal's local copy of the rule was already corrected on 2026-08-02, but that
fix is project-local and will be re-overwritten by the generated version.

**Also worth adding while in there:** after tagging, echo
`git rev-parse --short "refs/tags/$PROD_TAG"` and compare to `$DEPLOY_SHA`. One
line, catches the whole class, and makes the failure loud instead of silent.

**Depends on / blocked by:** nothing. Small, self-contained, and the deploy
sequence is already the file being touched.
