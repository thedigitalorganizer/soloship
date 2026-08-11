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
