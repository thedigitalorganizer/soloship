---
name: finish
description: Use when implementation is complete, all tests pass, and you need to decide how to integrate the work - guides completion of development work by presenting structured options for merge, PR, or cleanup
---

## Host Compatibility

If you are running this skill in Codex, read `../references/codex-compatibility.md` before following host-specific tool instructions. Claude Code should continue to use the Claude-specific tools and command wrappers described here.

<!-- Vendored from superpowers v6.0.3 (Jesse Vincent). See skills/vendored/superpowers/LICENSE. Renamed `finishing-a-development-branch` → `finish` for Soloship's user-facing `/soloship:finish` command. Soloship keeps `gh pr create` in Option 2 because that menu pick is Soloship's explicit PR opt-in surface (see the no-auto-PR rule); upstream went forge-neutral and only pushes. -->

# Finishing a Development Branch

## Model posture (see .claude/rules/model-mode.md)

**Standard posture** (Opus/Sonnet/Codex — the default): run the process
exactly as written.

**Fable posture** (model id contains `fable`/`mythos`): this skill sits at
the merge/delete boundary, so it is mostly gates. Binding: Step 1's test
verification before any option is offered, and re-verifying tests on the
merged result in Option 1 · Step 4's menu as a real user checkpoint — wait
for the user's pick, never auto-select, PR only when the user explicitly
chooses Option 2 · Option 4's typed "discard" confirmation before anything
is deleted · the plan status flip (`done`/`abandoned`) and claim-file clear
BEFORE the merge · the artifact sweep (consumed handoffs/drafts removed in
the same commit) · Step 6's browser teardown and the worktree provenance
check — never remove a worktree you didn't create, and Options 2/3 always
keep theirs.

**Choreography (adaptable in Fable posture):** Step 2/3's exact detection
commands, the announce line, and the menus' fixed wording — the binding part
is that the choice is the user's, not the template. Sequence the detection
and base-branch checks however the situation calls for; every gate above
still happens, in the order its dependencies require (tests before menu,
status flip before merge, merge before cleanup).

## Overview

Guide completion of development work by presenting clear options and handling chosen workflow.

**Core principle:** Verify tests → Detect environment → Present options → Execute choice → Clean up.

**Announce at start:** "I'm using the finishing-a-development-branch skill to complete this work."

## The Process

### Step 1: Verify Tests

**Before presenting options, verify tests pass:**

```bash
# Run project's test suite
npm test / cargo test / pytest / go test ./...
```

**If tests fail:**
```
Tests failing (<N> failures). Must fix before completing:

[Show failures]

Cannot proceed with merge/PR until tests pass.
```

Don't proceed to Step 2 with failing tests. Fix the failures yourself, re-run the suite, and start again from the top of Step 1. If a failure genuinely can't be fixed right now (external blocker, needs a product decision), report it and ask the user how to proceed rather than merging around it.

**If tests pass:** Continue to Step 2.

### Step 2: Detect Environment

**Determine workspace state before presenting options:**

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
```

This determines which menu to show and how cleanup works:

| State | Menu | Cleanup |
|-------|------|---------|
| `GIT_DIR == GIT_COMMON` (normal repo) | Standard 4 options | No worktree to clean up |
| `GIT_DIR != GIT_COMMON`, named branch | Standard 4 options | Provenance-based (see Step 6) |
| `GIT_DIR != GIT_COMMON`, detached HEAD | Reduced 3 options (no merge) | No cleanup (externally managed) |

### Step 3: Determine Base Branch

```bash
# Try common base branches
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null
```

Or ask: "This branch split from main - is that correct?"

### Step 4: Present Options

**Normal repo and named-branch worktree — present exactly these 4 options:**

```
Implementation complete. What would you like to do?

1. Merge back to <base-branch> locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)
4. Discard this work

Which option?
```

**Detached HEAD — present exactly these 3 options:**

```
Implementation complete. You're on a detached HEAD (externally managed workspace).

1. Push as new branch and create a Pull Request
2. Keep as-is (I'll handle it later)
3. Discard this work

Which option?
```

**Don't add explanation** - keep options concise.

> **Soloship note:** Option 1 (local merge) is Soloship's default finishing path — there's no reviewer waiting on a PR for solo work. Present the menu as written; never auto-select Option 2. Picking Option 2 is the user's explicit opt-in to the PR path.

### Step 5: Execute Choice

#### Option 1: Merge Locally

```bash
# Get main repo root for CWD safety
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"

# Merge first — verify success before removing anything
git checkout <base-branch>
git pull
git merge <feature-branch>

# Verify tests on merged result
<test command>

# Only after merge succeeds: cleanup worktree (Step 6), then delete branch
```

Then: Cleanup worktree (Step 6), then delete branch:

```bash
git branch -d <feature-branch>
```

**Plan status (Soloship):** if a plan file in `docs/plans/` drove this work,
update its frontmatter — `status: done`, `progress: "<total>/<total>"`,
`updated: <today>`, note the merged commit hash, remove `claimed_by` — and
clear its claim file:

```bash
COORD="$(cd "$(git rev-parse --git-common-dir)" && pwd -P)/soloship"
rm -f "$COORD/claims/<plan-filename>.json"
```

**Do this BEFORE the merge, not after** — the `plan-merge` gate blocks a merge
whose plan is still open, and once the merge lands there is no natural moment
left that would prompt the flip. A plan left at `in-progress` after its work
went live is a plan that lies to the next agent forever.

**Artifact sweep (the self-cleaning contracts):** in the same commit, delete the
artifacts this work consumed —

```bash
git rm -q docs/handoffs/<file>   # if the plan's frontmatter names a `handoff:`
git rm -q docs/drafts/<file>     # if the plan's frontmatter names a `promoted_from:`
```

**Component inventory nudge (UI branches):**
<!-- concern:component-reuse -->
If `docs/architecture/COMPONENTS.md` exists, read it before creating or
specifying UI components — reuse or extend an existing component on purpose
match, cite what you found, and apply the rule of three (see
`references/component-inventory.md`). If this branch added, removed, or
renamed components, remind the user the inventory can be refreshed with
`/soloship:component-inventory` — a reminder only; /cleanup owns freshness.

#### Option 2: Push and Create PR

The user explicitly chose the PR path. Push the branch, then create the PR:

```bash
# Push branch
git push -u origin <feature-branch>

# Create PR
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
<2-3 bullets of what changed>

## Test Plan
- [ ] <verification steps>
EOF
)"
```

**Do NOT clean up worktree** — user needs it alive to iterate on PR feedback.

#### Option 3: Keep As-Is

Report: "Keeping branch <name>. Worktree preserved at <path>."

**Don't cleanup worktree.**

#### Option 4: Discard

**Confirm first:**
```
This will permanently delete:
- Branch <name>
- All commits: <commit-list>
- Worktree at <path>

Type 'discard' to confirm.
```

Wait for exact confirmation.

If confirmed:
```bash
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"
```

Then: Cleanup worktree (Step 6), then force-delete branch:
```bash
git branch -D <feature-branch>
```

**Plan status (Soloship):** if a plan file drove this work, update its
frontmatter — `status: abandoned`, `updated: <today>`, remove `claimed_by` —
and clear its claim file (same `rm -f "$COORD/claims/<plan-filename>.json"`
as Option 1). An abandoned plan stays on the board as a record of the
decision, exempt from freshness nagging.

### Step 6: Cleanup Workspace

**Only runs for Options 1 and 4.** Options 2 and 3 always preserve the worktree.

**Browser teardown first (all options, per `browser-tooling-priority`):** if this
session drove any browser during QA, release it now — close Claude in Chrome tabs you
created (`tabs_close_mcp`), release credential grants (`release_credentials`),
close built-in-browser pages. Leave the `/soloship:browse` daemon running (its
logins are shared by design). Finishing while still holding the user's browser
is why the next session finds it "busy."

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
WORKTREE_PATH=$(git rev-parse --show-toplevel)
```

**If `GIT_DIR == GIT_COMMON`:** Normal repo, no worktree to clean up. Done.

**If worktree path is under `.worktrees/` or `worktrees/`:** This skill (via using-git-worktrees) created this worktree — we own cleanup.

```bash
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"
git worktree remove "$WORKTREE_PATH"
git worktree prune  # Self-healing: clean up any stale registrations
```

**Otherwise:** The host environment (harness) owns this workspace. Do NOT remove it. If your platform provides a workspace-exit tool, use it. Otherwise, leave the workspace in place.

## Quick Reference

| Option | Merge | Push | Keep Worktree | Cleanup Branch |
|--------|-------|------|---------------|----------------|
| 1. Merge locally | yes | - | - | yes |
| 2. Create PR | - | yes | yes | - |
| 3. Keep as-is | - | - | yes | - |
| 4. Discard | - | - | - | yes (force) |

## Common Mistakes

**Skipping test verification**
- **Problem:** Merge broken code, create failing PR
- **Fix:** Always verify tests before offering options

**Open-ended questions**
- **Problem:** "What should I do next?" is ambiguous
- **Fix:** Present exactly 4 structured options (or 3 for detached HEAD)

**Cleaning up worktree for Option 2**
- **Problem:** Remove worktree user needs for PR iteration
- **Fix:** Only cleanup for Options 1 and 4

**Deleting branch before removing worktree**
- **Problem:** `git branch -d` fails because worktree still references the branch
- **Fix:** Merge first, remove worktree, then delete branch

**Running git worktree remove from inside the worktree**
- **Problem:** Command fails silently when CWD is inside the worktree being removed
- **Fix:** Always `cd` to main repo root before `git worktree remove`

**Cleaning up harness-owned worktrees**
- **Problem:** Removing a worktree the harness created causes phantom state
- **Fix:** Only clean up worktrees under `.worktrees/` or `worktrees/`

**No confirmation for discard**
- **Problem:** Accidentally delete work
- **Fix:** Require typed "discard" confirmation

## Red Flags

**Never:**
- Proceed with failing tests
- Merge without verifying tests on result
- Delete work without confirmation
- Force-push without explicit request
- Auto-create a PR — Option 2 only runs when the user explicitly picks it
- Remove a worktree before confirming merge success
- Clean up worktrees you didn't create (provenance check)
- Run `git worktree remove` from inside the worktree

**Always:**
- Verify tests before offering options
- Detect environment before presenting menu
- Present exactly 4 options (or 3 for detached HEAD)
- Get typed confirmation for Option 4
- Clean up worktree for Options 1 & 4 only
- `cd` to main repo root before worktree removal
- Run `git worktree prune` after removal

## Integration

**Called by:**
- **subagent-driven-development** (Step 7) - After all tasks complete
- **executing-plans** (Step 5) - After all batches complete

**Pairs with:**
- **using-git-worktrees** - Cleans up worktree created by that skill
