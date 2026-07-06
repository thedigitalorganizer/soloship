---
name: status
description: |
  One read-only dashboard for "what's going on in this project": active
  sessions (who's working where), the plan board (every plan by status with
  progress), and deploy state (what's live vs what's merged and waiting).
  Use when asked "what's in flight", "what's the status", "who's working on
  what", "what's waiting to deploy", or at the start of a session in a busy
  repo. Never mutates anything — repairs belong to /soloship:cleanup.
---

## Host Compatibility

If you are running this skill in Codex, read `../references/codex-compatibility.md` before following host-specific tool instructions. Claude Code should continue to use the Claude-specific tools and command wrappers described here.

# Soloship Status

One glance that answers "what's going on in this project" — without probing
git logs, without running the heavyweight `/cleanup`. **Strictly read-only:**
this skill never fixes, prunes, or rewrites anything. When it spots something
wrong, it says so and points at `/soloship:cleanup` (the reconciler) or the
responsible skill.

All live state comes from the shared coordination dir (the break-room
whiteboard every worktree of this repo can see):

```bash
COORD="$(cd "$(git rev-parse --git-common-dir)" && pwd -P)/soloship"
# thresholds (defaults if config.json absent: active 15, idle 60, lock stale 45)
cat "$COORD/config.json" 2>/dev/null
```

If `COORD` doesn't exist yet, say so ("no session coordination state yet — it
appears after the first Claude session with Soloship hooks installed") and
still render Sections 2 and 3, which only need the filesystem and git.

## Section 1: Sessions

For each `$COORD/sessions/*.json`, compute heartbeat age from the file's
mtime and classify with the config thresholds:

- **active** — heartbeat younger than `session_active_min`
- **idle** — younger than `session_idle_min`
- **presumed dead** — older than that (SessionStart prunes files older than
  `session_prune_hours`; do NOT delete anything here)

Read `dir` and `branch` from each file; label the location "main checkout" or
"worktree <basename>". Overlay claims: if a `$COORD/claims/*.json` names this
session_id, show which plan it's implementing.

```
SESSIONS
  ● this session      main checkout, main
  ● worktree feat-x   on feat-x — implementing 2026-07-05-feature-x-plan.md (heartbeat 2 min ago)
  ○ worktree fix-y    on fix-y — idle 34 min
  ✝ 1 presumed-dead session file (no heartbeat for 3h) — /soloship:cleanup prunes these
```

Mark which one is the current session (its `pid` equals this shell's `$PPID`).

## Section 2: Plan Board

List every `docs/plans/*.md` (excluding `archive/`), read each frontmatter,
and group by status using the unified vocabulary (see the plan skill's
Artifact Contract). **Apply the legacy mapping when rendering old plans**:
`Not started → planned`, `active → in-progress`, `completed → done`. Statuses
outside both vocabularies (`proposed`, `Implemented`, missing frontmatter, …)
render in an **unknown — needs triage** group with their literal value; map
the obvious ones by meaning (e.g. `Implemented` reads as done) but say you
did. `/soloship:cleanup` normalizes them.

**Live claims overlay frontmatter.** Frontmatter edited inside a worktree
branch isn't visible in other checkouts until merge, so for in-flight work the
claim files are the real-time truth and frontmatter is the durable record that
catches up on merge: a plan with a live claim renders as **in-progress
(claimed)** even if the frontmatter here still says `planned`.

```
PLAN BOARD
  in-progress
    2026-07-05-feature-x-plan.md      2/5 · session worktree feat-x · branch feat-x · updated today
  planned
    2026-05-18-deploy-autorollback…   planned 49 days ago, never started
  backlog (2) · blocked (0) · done (12, archived) · abandoned (1)
```

Cheap disagreement flags only (no deep git analysis — that's `/cleanup`):
- status `done`/`abandoned` but file still outside `archive/` → note the
  lifecycle action pending
- status `in-progress` with no live claim and no fresh heartbeat → "may be
  stale — /soloship:cleanup reconciles"
- claim file whose session is presumed dead → "orphaned claim — /soloship:cleanup clears it"
- freshness (ttl_days) warnings for `planned`/`in-progress` only; `backlog`,
  `done`, `abandoned` are exempt.

## Section 3: Deploy State

```bash
git fetch --tags origin 2>/dev/null   # read-only against the working tree; skip silently if offline
# Targets: every prod* tag (multi-target repos use prod-<target>; also honor soloship-prod)
git tag -l "prod*" "soloship-prod*"
# Per tag: what's live, and what's merged-but-undeployed
git log -1 --format="%h %ad %s" --date=relative <tag>
git log <tag>..origin/main --oneline
```

Also check the deploy lock: `$COORD/deploy.lock` — holder session, age vs
`deploy_lock_stale_min`.

```
DEPLOY
  prod → 3f2c1a9 "fix: rate limiter" (deployed 2 days ago)
  waiting on main: 4 merged, undeployed changes
    a1b2c3 feat: session presence
    …
  deploy lock: not held        (or: HELD by worktree feat-x, 12 min — fresh, a deploy is running)
```

- No `prod*` tag at all → "no tracked deploys yet — the first production
  deploy through /soloship:shipfast or /soloship:shipthorough creates the
  prod tag."
- Lock held and older than `deploy_lock_stale_min` → "presumed stale — only
  the user may clear it (the deploy sequence explains how)."

## Output Rules

- Plain English, compact — the three sections above and nothing else. It
  should read in ten seconds.
- Relative times ("2 min ago", "49 days"), not raw timestamps.
- **Never mutate.** No pruning, no frontmatter fixes, no lock clearing, no
  tag operations (`git fetch --tags` is the only network call, and it only
  updates refs). Every problem gets a one-line pointer to the fixing command
  instead.
- If nothing is in flight anywhere: say exactly that in one line per section.
