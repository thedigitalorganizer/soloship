# Production Deploy Sequence (Shared Reference)

The one production deploy sequence, used by `/soloship:shipfast` (Step 6),
`/soloship:shipthorough` (Step 12), and any manual production deploy. It
implements the `deploy-from-main-only` rule: **production only ever runs the
default branch**, every deploy shows a manifest, exactly one deploy runs at a
time, and a moving `prod` tag records what is live.

**Preview/channel deploys skip this sequence entirely** (`wrangler pages
deploy --branch=<preview>`, `vercel` without `--prod`,
`firebase hosting:channel:deploy`, `netlify deploy` without `--prod`). Those
stay free — browser QA from worktrees depends on them.

Throughout, `COORD` is the shared coordination dir and `CONFIG` its thresholds
(written by the Soloship SessionStart hook; fall back to the defaults shown if
absent):

```bash
COORD="$(cd "$(git rev-parse --git-common-dir)" && pwd -P)/soloship"
mkdir -p "$COORD"
# deploy_lock_stale_min from $COORD/config.json; default 45 if missing
STALE_MIN=$(grep -oE '"deploy_lock_stale_min":[0-9]+' "$COORD/config.json" 2>/dev/null | grep -oE '[0-9]+$')
[ -z "$STALE_MIN" ] && STALE_MIN=45
```

## Step 1 — Verify place: clean, synced default branch, main checkout

```bash
# Main checkout, not a worktree
[ "$(cd "$(git rev-parse --git-dir)" && pwd -P)" = "$(cd "$(git rev-parse --git-common-dir)" && pwd -P)" ] || echo "IN A WORKTREE - stop"

# Default branch
default_branch=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')
[ -z "$default_branch" ] && default_branch=$(git rev-parse --verify -q origin/main >/dev/null && echo main || echo master)
[ "$(git branch --show-current)" = "$default_branch" ] || echo "NOT ON $default_branch - stop"

# Clean and synced
git status --porcelain              # must be empty
git fetch origin "$default_branch" && git status -sb   # must not be behind
```

If any check fails: **stop**. Merge to the default branch first (worktree work
goes through `/soloship:finish`), sync, and come back. Do not deploy around a
failed check — the PreToolUse deploy-discipline hook will block it anyway.

## Step 2 — Acquire the deploy lock (atomic, first writer wins)

Identify this session, then create the lock with `noclobber` so two sessions
racing can never both win:

```bash
# Own session id: the session file whose pid matches this shell's parent
# (hooks and skill commands share the same host process). Fallbacks: freshest
# session file, then a pid label.
SID=$(grep -l "\"pid\":$PPID," "$COORD/sessions/"*.json 2>/dev/null | head -1 | xargs -I{} basename {} .json)
[ -z "$SID" ] && SID=$(ls -t "$COORD/sessions/"*.json 2>/dev/null | head -1 | xargs -I{} basename {} .json)
[ -z "$SID" ] && SID="pid-$PPID"

TARGET="<deploy target name, e.g. the wrangler/Pages project — 'default' if single-target>"
LOCK="$COORD/deploy.lock"
if ( set -o noclobber; printf '{"session_id":"%s","target":"%s","acquired_at":"%s"}\n' \
     "$SID" "$TARGET" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$LOCK" ) 2>/dev/null; then
  echo "lock acquired"
else
  HOLDER=$(grep -oE '"session_id":"[^"]*"' "$LOCK" | head -1 | cut -d'"' -f4)
  AGE_MIN=$(( ( $(date +%s) - $(stat -f %m "$LOCK" 2>/dev/null || stat -c %Y "$LOCK") ) / 60 ))
  echo "lock held by $HOLDER, ${AGE_MIN} min old (stale threshold: ${STALE_MIN} min)"
fi
```

- **Lock held, age < stale threshold:** another deploy is in progress. Wait or
  ask the user — never proceed, never delete the lock.
- **Lock held, age ≥ stale threshold:** *presumed* abandoned, **never
  auto-broken**. Ask the user: *"A deploy lock is held by session `<id>` since
  `<time>` (`<N>` min ago — past the `<STALE_MIN>` min staleness threshold).
  Override it?"* Only on an explicit yes: `rm "$LOCK"`, then re-acquire.

**From here on, every path — success or failure — must release the lock.**

## Step 3 — Manifest + go/no-go

```bash
git fetch --tags origin   # local tags/branches can lag; never compute drift against stale refs

# Multi-target repos tag per target: prod-<target>. Single-target uses plain 'prod'.
# If the repo already uses 'prod' for something else, use 'soloship-prod'.
PROD_TAG="prod"           # or "prod-$TARGET"
if git rev-parse -q --verify "refs/tags/$PROD_TAG" >/dev/null; then
  git log "$PROD_TAG"..HEAD --oneline
else
  echo "FIRST DEPLOY: no $PROD_TAG tag yet - this deploy creates it"
fi

# Pin what this deploy ships BEFORE deploying. A deploy takes minutes; with
# parallel sessions merging into main, HEAD can advance mid-deploy, and a bare
# tag command in Step 5 would tag a commit that was never shipped.
DEPLOY_SHA=$(git rev-parse HEAD)
```

Present the manifest to the user via AskUserQuestion and get an explicit
go/no-go:

> **This deploy ships N changes** (including work merged by other sessions):
> `<the git log list, or "first tracked deploy — tag will be created">`
> Deploy now?

- N = 0 and the tag exists: nothing new — say so and stop (release the lock).
- No-go: release the lock and stop. Merged work just waits for the next train
  — batching is normal.

## Step 4 — Deploy, refreshing the lock

Run the project's deploy command (platform detection stays in the calling
skill). For long deploys, `touch "$LOCK"` between steps (build, then deploy,
then migrations) so the lock never looks abandoned mid-deploy.

## Step 5 — On success: move the prod tag

```bash
git tag -f "$PROD_TAG" "$DEPLOY_SHA" && git push -f origin "$PROD_TAG"
git rev-parse --short "refs/tags/$PROD_TAG"   # must match ${DEPLOY_SHA} (short) — if not, STOP and report
```

**Never tag bare.** The commit-ish is `$DEPLOY_SHA` from Step 3 — tagging
whatever HEAD happens to be now races concurrent merges (confirmed live,
Chloropal 2026-08-02: deployed `7050efd`, bare tag landed on `e8bb37b`). The
drift is always forward, so `git log prod..HEAD` under-reports and a later
session is told "nothing to deploy" while real work sits unshipped. The echo
line makes a mismatch loud instead of silent.

The tag moves **only after the deploy command succeeded**. It marks what was
*deployed*; observable-liveness verification (curl + browser QA per the
calling skill) is its own step and still runs.

## Step 6 — Release the lock (success AND failure)

```bash
rm -f "$LOCK"
```

On any failure path (deploy error, no-go, verification failure that aborts):
release the lock **before** stopping to report. A dead session's lock must
never queue the next deploy behind a ghost.

## Failure ordering

1. Deploy failed → do NOT move the tag → release lock → report.
2. Deploy succeeded, tag push failed → retry the tag push (it is metadata; the
   deploy is already live) → release lock → report the tag state honestly.
3. Interrupted mid-sequence → release the lock if still held, state what
   completed.
