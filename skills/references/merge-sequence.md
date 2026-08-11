# Local Merge Sequence (Shared Reference)

The one merge-to-base flow, used by `/soloship:finish` (Option 1),
`/soloship:implement` (Step 2.5), `/soloship:shipthorough` (Step 10), and any
ad-hoc "merge this" request. It exists so the merge commands live in exactly
one place — the way `references/deploy-sequence.md` is the one deploy flow —
and it encodes the multi-session invariant:

> **Integration and verification happen in YOUR worktree. The main checkout is
> never entered at all** — the merge itself runs in a throwaway detached
> worktree, and the remote's atomic push rejection is the race detector.

Why: with 2-5 parallel sessions, the main checkout is the one contested
directory in the system — every documented git incident (scrambled commits,
misplaced stash pops, stale-blob commits) happened *inside it*. The old flow
`cd`'d into it, merged, and ran a full test suite there, holding the contested
tree for minutes. This flow holds it for zero seconds.

**No lock is needed.** Two sessions merging concurrently cannot corrupt
anything: each merges in its own throwaway worktree, and when both push, the
remote accepts the first and **rejects the second** (non-fast-forward). The
rejection is the "did main move?" check and the write in one atomic operation
— it cannot race, and there is no lock file to go stale or leak.

## Step 0 — Names

```bash
# Base branch
BASE=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')
[ -z "${BASE}" ] && BASE=$(git rev-parse --verify -q origin/main >/dev/null && echo main || echo master)

# Feature branch — capture while still on it
BRANCH=$(git branch --show-current)
```

**Plan status first (Soloship):** if a plan in `docs/plans/` drove this work,
flip its frontmatter to `status: done` (with progress, updated date, merged
commit noted) and clear its claim file BEFORE merging — the `plan-merge` gate
blocks a merge whose plan is still open, and after the merge there is no
natural moment left that would prompt the flip.

## Step 1 — Integrate, in your worktree

```bash
git fetch origin "${BASE}"
git merge "origin/${BASE}"
```

Conflicts get resolved **here**, in your own worktree, where a mistake is
cheap — never on the base branch. If conflicts are non-trivial, stop and ask
the user before resolving (per the merge-conflict rule in the calling skill).

## Step 2 — Verify, in your worktree

Run the project's tests and the plan's QA Plan rows against the **integrated**
state. This is the point of the whole sequence: the combination of your work
plus current base gets verified *before* the base branch ever sees it.
Changed state requires fresh evidence (`verification-sufficiency`) — if Step 1
brought in changes, re-run; if `git merge` said "Already up to date," your
existing evidence stands.

## Step 3 — Merge in a throwaway detached worktree, push, let the remote arbitrate

```bash
TMP=$(mktemp -d "${TMPDIR:-/tmp}/merge-${BRANCH##*/}.XXXXXX")
git worktree add --detach "${TMP}" "origin/${BASE}"
(
  cd "${TMP}" &&
  git merge --no-ff "${BRANCH}" -m "Merge ${BRANCH} into ${BASE}" &&
  git push origin "HEAD:${BASE}"
)
PUSH_STATUS=$?
```

Notes that keep this correct:

- The merge is **guaranteed conflict-free** — Step 1 already integrated
  `origin/${BASE}` into the branch, so this merge only replays your own
  commits. If it conflicts anyway, something moved; treat it as a rejected
  push (below).
- The main checkout is untouched: no `cd` into it, no `checkout`, no test run
  there, its HEAD and working tree never move.
- The subshell keeps your shell's `pwd` in your worktree (the stash/cwd-drift
  footguns in `use-worktrees.md`).

**If the push is rejected** (`non-fast-forward` / "tip is behind its remote
counterpart"): another session's merge landed first. That is the mechanism
working, not an error. Recovery is a loop back to Step 1:

```bash
git worktree remove --force "${TMP}"   # discard the stale merge attempt
```

then Step 1 (fetch + integrate the new base **in your worktree**), Step 2
(re-verify — the base changed, so fresh evidence is required), Step 3 again.

## Step 4 — Clean up (success path)

Order matters — each step unblocks the next, and your shell must never sit in
a directory being removed:

```bash
# 1. Stand in the throwaway worktree (stable ground while the feature
#    worktree goes away).
cd "${TMP}"

# 2. Remove YOUR feature worktree (a branch can't be deleted while a worktree
#    has it checked out; and a worktree can't be removed from inside itself).
git worktree remove "<path-to-your-feature-worktree>"

# 3. Delete the branch FROM HERE — the tmp worktree's HEAD contains the merge,
#    so -d succeeds. (From the main checkout it would fail: local BASE is
#    still behind origin and doesn't contain the branch yet.)
git branch -d "${BRANCH}"

# 4. Leave TMP, then remove it. The cd into the main checkout directory is
#    only a place to stand — no git mutation runs there.
cd "$(git worktree list --porcelain | awk '/^worktree / { print $2; exit }')"
git worktree remove "${TMP}"
git worktree prune
```

On ANY failure path, still remove the throwaway worktree
(`git worktree remove --force "${TMP}"`) — a leaked tmp worktree pins its
directory and confuses `git worktree list` for every other session.

If the calling skill runs from a harness-owned workspace (detached HEAD, or a
worktree the harness created), skip removing the feature worktree — the
harness owns it; follow the calling skill's provenance rules.

## Local `${BASE}` staying behind is normal

After the push, the main checkout's local `${BASE}` is **behind origin** until
something pulls it. This is by design — updating it would mean entering the
main checkout, which is the thing this sequence exists to avoid. Do not "fix"
it: the deploy sequence's Step 1 (`checkout` + sync check + pull) self-heals
it at the next deploy, and any session that needs current base uses
`origin/${BASE}` (which `git fetch` keeps fresh) rather than the local ref.

## Exception — repos with no remote

Push atomicity needs an `origin`. In a remoteless repo (local-only projects),
fall back to merging in the main checkout directly: `git checkout ${BASE}` →
`git merge --no-ff ${BRANCH}` → cleanup. There is no server to arbitrate, so
this is the one case where entering the main checkout is the documented path —
state that you are on the fallback when you use it.

## Explicit PR opt-in

If the user explicitly asked for a PR ("open a PR," "push this up for
review"), skip this sequence entirely: push the feature branch, `gh pr
create`, keep the worktree alive for iteration. Inferring "work is done, PR is
next" does not count as explicit (the no-auto-pr rule).
