---
name: implement
description: |
  Execute an implementation plan. Finds the most recent plan in
  docs/plans/, sets up a working branch, then runs the Compound-Engineering-
  derived execution methodology with branching, clarification gates,
  and quality checks. Freshness check warns on stale plans.
---

# Soloship Implement

Your job is to execute an existing plan. Do NOT start implementing without a plan
file in `docs/plans/`. If no plan exists, tell the user to run `/plan` first.

## Step 1: Find the Plan (with Freshness Check)

Look for the most recent plan file in `docs/plans/` that isn't archived.
Read it completely — understand the phases, tasks, key decisions, and execution
strategy.

**Freshness check:** If the plan has frontmatter with `date` and `ttl_days`,
check whether today exceeds date + ttl_days. If stale, warn:
"This plan is N days old (expires after M days). Verify it still reflects current
intent before executing." Do not block — warn and proceed.

## Step 1.5: Pre-Execution State Verification

**Required for every multi-phase plan, every phase, every time.** Plans embed
concrete factual claims about the codebase — version numbers, file paths,
identifier names, "is X done" assumptions — that are correct at write time and
can be wrong at execute time. Intervening commits land. The author guesses a
location without grepping. A prior phase changed something this phase depends on.

Before running the execution methodology or editing any file, spend ≤2 minutes grepping every
concrete assertion the phase you're about to execute makes:

- **Version constants:** plan says "bump CONST N → N+1"? Grep the constant.
  If it's already N+1 or N+2, the literal numbers are stale — bump from current.
- **File locations:** plan names a file path for a CSS variable, identifier,
  palette override, or alias? `grep -rn "<construct>" src/ functions/src/` and
  confirm it actually lives where the plan says.
- **Identifier renames:** plan assumes a prior phase renamed `OldName` to `NewName`?
  `git log --oneline -p -S "OldName"` across the touched files. Use the new name
  if the rename happened, the old name if it didn't.
- **"Is X done" assumptions:** plan assumes a prior phase did or did not do
  something? Grep for the artifact (renamed tab, deleted file) before re-doing it
  or before assuming it still needs to be done.

Cap at 2 minutes per phase. The point is to surface mismatches, not to re-derive
the plan.

**Document every delta in the phase handoff under "Plan-vs-reality adjustments
documented:".** Empty if none — empty *signals* that verification ran. Populated
with each delta if found. The next phase's executor reads the handoff and inherits
the corrected mental model.

If a project follows the auto-loaded `plan-materialization.md` rule, this step is
already mandated there; this skill restates it because it's the highest-leverage
discipline `/implement` can enforce. See
`docs/solutions/workflow-issues/plan-state-decay-during-multi-phase-execution-20260503.md`
(in any project that has compounded this learning) for surfaced incidents.

**Skip this step ONLY if** the plan is single-phase or the work is the trivial
1-2 step direct change documented in the Step 2 exception.

## Step 1.7: Branch/Worktree Discipline (Soloship Override)

The CE methodology below offers three branch-setup options at the start of Phase 1 (new branch / worktree / stay on default). **Soloship's default differs from CE's: default to a worktree (CE's Option B), not a bare new branch (CE's Option A).**

**Why:** Soloship users frequently run 2-5 parallel agent processes against the same repo at the same time. New feature work on a fresh branch in the *same* working directory will trip over the other processes — dirty state from one agent's WIP shows up in another's diffs, builds run against the wrong files, and `git status` becomes unreadable. A worktree gives each new branch its own physical directory, so parallel processes can't collide.

**How to apply when reaching CE's Setup Environment step:**

1. **If on the default branch and starting new work:** invoke the `soloship:using-git-worktrees` skill instead of running `git checkout -b` directly. The skill handles directory selection, `.gitignore` safety, and clean baseline tests.
2. **If already on a feature branch:** check whether you are inside an existing worktree (`git rev-parse --show-toplevel` will be a path under `.worktrees/` or `~/.config/superpowers/worktrees/`). If yes, continue there. If no, ask the user before continuing — they may have been mid-task in the main checkout.
3. **Skip the worktree only if** the user explicitly says "use a branch in this checkout" or the work is the trivial 1-2 step exception documented in Step 2 below.

When CE's Phase 1 step 2 lists Options A / B / C, treat Option B as the default. Do not present the three-option menu to the user unless they push back — the menu is a CE-era artifact and the worktree default is what Soloship wants.

If `soloship:using-git-worktrees` is not available (the skill isn't installed in this environment), fall back to creating a worktree manually:

```bash
mkdir -p .worktrees
grep -q "^\.worktrees/$" .gitignore || echo ".worktrees/" >> .gitignore
git worktree add ".worktrees/<branch-name>" -b "<branch-name>"
cd ".worktrees/<branch-name>"
```

…and verify the new directory got added to `.gitignore` before proceeding.

## Step 2: Route to Execution

Apply the execution methodology below with the plan file path as input.
It will:
- Read the plan completely and clarify ambiguities before starting
- Set up the correct branch (subject to the Step 1.7 worktree override above)
- Execute the plan systematically while maintaining quality
- Ship complete features rather than half-built ones

The CE workflow handles both sequential and parallelizable work internally —
you do not need to separately choose "subagent-driven" vs "parallel agents."
Pass the plan as-is; if the plan's Execution Strategy section calls for
parallelism, surface that in your hand-off to CE so it can fan out.

**Exception — trivial changes:** If the plan truly describes a 1-2 step direct
change (typo fix, single-file tweak, obvious rename), skip the CE workflow and
implement it directly. The CE workflow has real setup overhead; don't pay it
for five-minute changes.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "I don't need a plan for this, it's straightforward" | If it were straightforward, you wouldn't be using `/implement`. No plan = no shared understanding of what "done" means. Run `/plan` first. |
| "I'll adjust the plan as I go" | Adjustments are fine — but update the plan file. An executed plan that doesn't match the written plan is worse than no plan at all. |
| "I'll skip the methodology and just code it" | The execution methodology handles branch setup, clarification gates, and quality checks that are easy to forget when coding solo. Apply it unless the change is genuinely trivial. |
| "I'll skip `/learn` — this was routine" | "Routine" work that needed a plan and an implementation skill is, by definition, not trivial. Capture what you learned. |
| "The build passes, so the feature works" | A green build proves it compiles, not that the button does the thing. The Browser QA Gate (Step 2.6) is not optional. Drive the real flow. |
| "I changed the rendering code, so the page is obviously fine" | You changed code you *believe* renders correctly. You haven't watched it. Open it in `/soloship:browse` and look. |
| "I can't test that flow — it needs a login / paid account / specific data" | That's an unmet gate, not an exemption. Use a test account or seeded fixture; if none exists, ask the user for one. Don't call an untested authenticated flow done. |
| "It's done, I'll just note the QA is pending" | "Done with QA pending" is not done. Nothing ships until the affected flows were observed working and any fixes were re-verified. |

---

## Step 2.5: Finishing Behavior Override (Soloship)

The CE methodology below ends Phase 4 ("Ship It") with `git push -u origin <branch>` followed by `gh pr create`. **Soloship overrides this final step: do not create a PR automatically.** Soloship is a solo-developer tool — there's no reviewer waiting on GitHub, and the PR step is pure latency between "done" and "live." The default finishing behavior is a **local merge into the base branch**, then push the base branch.

**When you reach CE's Phase 4 step 3 ("Create Pull Request"), run this instead of `gh pr create`:**

```bash
# Detect base branch
default_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
[ -z "$default_branch" ] && default_branch=$(git rev-parse --verify origin/main >/dev/null 2>&1 && echo "main" || echo "master")

# Capture feature branch name BEFORE switching
feature_branch=$(git branch --show-current)

# If we are inside a worktree, the merge must happen in the main checkout
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

Report the merge target, the commit hash that's now on the base branch, and confirmation that the feature branch and worktree were cleaned up.

**Merge conflicts:** stop immediately, report the conflicting files, ask the user how to proceed. Do not auto-resolve.

**Skip the override and run the original PR flow only if** the user explicitly asked for a PR earlier in the conversation ("open a PR for this," "push it up for review," etc.). Inferring "the work is done, PR is next" does not count as explicit. When opt-in is explicit, run CE's original Phase 4 step 3 (`git push -u origin HEAD` + `gh pr create`).

If the user later wants a PR for an already-merged change, they can run it manually from the base branch, or use `/soloship:finish` Option 2 on a new branch.

## Step 2.6: Browser QA Gate (Soloship — MANDATORY before "done")

**No plan is finished until the change has been exercised in a real browser and any issues found have been fixed and re-verified.** This gate runs AFTER implementation and the quality checks, and BEFORE the finishing/merge step (Step 2.5 / CE Phase 4). "Tests pass" and "build succeeds" are necessary but not sufficient — they do not prove the actual user-facing behavior works. Only driving the real UI does.

This is a hard gate. Passing it requires observed evidence, not assertion. "It should work," "the build is green so the page is fine," or "I changed the code that renders it" do NOT satisfy this gate — only watching the real flow happen does. This is `verification-before-completion` applied to the user-facing surface.

### What "browser QA" means here

Use `/soloship:browse` (Soloship's headless browser) to drive the **actual flows the change touches**, end to end, on the running app (local dev server or deployed preview):

1. **Identify the affected surface.** From the diff, list every page, route, component, and user flow this change can reach. That list is what must be exercised — not just the one page you were thinking about.
2. **Exercise the real flow, not just page load.** Click through the happy path *and* the key states the change introduces or affects: empty state, error state, loading, validation failures, the specific interaction you built. Loading a page without interacting with it is not QA.
3. **Use test accounts when a flow needs auth or specific state.** If a flow requires being logged in, having a particular role, an existing record, a paid plan, etc., use a test account / seeded state to reach it. **If no test account or fixture exists, ask the user for one (or for how to create it) — do not skip the authenticated path and do not call it done.** "Couldn't test because it needs login" is an unmet gate, not an exemption.
4. **Capture evidence.** Screenshots (before/after where relevant) and the observed result of each flow. The evidence is what proves the gate was met.

### The fix-and-re-verify loop

If browser QA surfaces ANY issue (visual break, broken interaction, console error, wrong behavior, regression on an adjacent flow):

1. Fix it.
2. **Re-run the browser QA for that flow** — observe the fix actually working. A fix is not "done" because the code changed; it's done when the re-run shows the correct behavior.
3. Repeat until every affected flow passes clean.

Only when every affected flow has been observed working — with the fixes re-verified — may the work proceed to the finishing/merge step.

### The only valid exemption

If the change genuinely has **no browser-reachable surface** — a pure CLI change, an internal script, a config/infra-only change, a data migration with no UI effect — state that explicitly with the reason ("No browser QA: this change only touches the build script; nothing user-facing renders differently"), and instead verify the actual observable outcome by the right means (run the CLI and show the output, hit the endpoint and show the response, query the data and show the row). The exemption is "there is nothing in a browser to test," never "browser testing is inconvenient" or "I'm confident." When in doubt, test it in the browser.

## Step 3: After Implementation

When implementation is complete:

1. If the work was non-trivial, suggest: "Run `/learn` to capture what you learned."
2. Then suggest: "Run `/shipfast` for a quick deploy or `/shipthorough` for full due diligence." (Both deploy from the merged base branch, not from a PR.)

## Verification

Implementation is not complete until ALL of these are true:

- [ ] Plan file was read and understood before any code was written
- [ ] **Pre-execution state verification ran** (Step 1.5) and any deltas are documented in the phase handoff under "Plan-vs-reality adjustments documented:" (empty if none — empty signals verification ran)
- [ ] All tasks in the plan are addressed (completed or explicitly deferred with reason)
- [ ] Tests pass (`npm test` or equivalent — show the output)
- [ ] Build succeeds (`npm run build` or equivalent — show the output)
- [ ] No unrelated changes introduced (diff stays within plan scope)
- [ ] **Browser QA Gate passed (Step 2.6)** — every affected user-facing flow was exercised in a real browser via `/soloship:browse` (with a test account where auth/state was needed), issues found were fixed AND re-verified by re-running the flow, and evidence (screenshots/observed results) was captured. OR an explicit "no browser-reachable surface" exemption was stated with its reason and the outcome verified another way. Never satisfied by "tests pass" or "should work."

---

## Implementation Methodology


<!-- Vendored from compound-engineering v2.34.0 (Kieran Klaassen). See skills/vendored/ce/LICENSE. -->

# Work Plan Execution Command

Execute a work plan efficiently while maintaining quality and finishing features.

## Introduction

This command takes a work document (plan, specification, or todo file) and executes it systematically. The focus is on **shipping complete features** by understanding requirements quickly, following existing patterns, and maintaining quality throughout.

## Input Document

<input_document> #$ARGUMENTS </input_document>

## Execution Workflow

### Phase 1: Quick Start

1. **Read Plan and Clarify**

   - Read the work document completely
   - Review any references or links provided in the plan
   - If anything is unclear or ambiguous, ask clarifying questions now
   - Get user approval to proceed
   - **Do not skip this** - better to ask questions now than build the wrong thing

2. **Setup Environment**

   First, check the current branch:

   ```bash
   current_branch=$(git branch --show-current)
   default_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')

   # Fallback if remote HEAD isn't set
   if [ -z "$default_branch" ]; then
     default_branch=$(git rev-parse --verify origin/main >/dev/null 2>&1 && echo "main" || echo "master")
   fi
   ```

   **If already on a feature branch** (not the default branch):
   - Ask: "Continue working on `[current_branch]`, or create a new branch?"
   - If continuing, proceed to step 3
   - If creating new, follow Option A or B below

   **If on the default branch**, choose how to proceed:

   **Option A: Create a new branch**
   ```bash
   git pull origin [default_branch]
   git checkout -b feature-branch-name
   ```
   Use a meaningful name based on the work (e.g., `feat/user-authentication`, `fix/email-validation`).

   **Option B: Use a worktree (recommended for parallel development)**
   ```bash
   skill: git-worktree
   # The skill will create a new branch from the default branch in an isolated worktree
   ```

   **Option C: Continue on the default branch**
   - Requires explicit user confirmation
   - Only proceed after user explicitly says "yes, commit to [default_branch]"
   - Never commit directly to the default branch without explicit permission

   **Recommendation**: Use worktree if:
   - You want to work on multiple features simultaneously
   - You want to keep the default branch clean while experimenting
   - You plan to switch between branches frequently

3. **Create Todo List**
   - Use TodoWrite to break plan into actionable tasks
   - Include dependencies between tasks
   - Prioritize based on what needs to be done first
   - Include testing and quality check tasks
   - Keep tasks specific and completable

### Phase 2: Execute

1. **Task Execution Loop**

   For each task in priority order:

   ```
   while (tasks remain):
     - Mark task as in_progress in TodoWrite
     - Read any referenced files from the plan
     - Look for similar patterns in codebase
     - Implement following existing conventions
     - Write tests for new functionality
     - Run tests after changes
     - Mark task as completed in TodoWrite
     - Mark off the corresponding checkbox in the plan file ([ ] → [x])
     - Evaluate for incremental commit (see below)
   ```

   **IMPORTANT**: Always update the original plan document by checking off completed items. Use the Edit tool to change `- [ ]` to `- [x]` for each task you finish. This keeps the plan as a living document showing progress and ensures no checkboxes are left unchecked.

2. **Incremental Commits**

   After completing each task, evaluate whether to create an incremental commit:

   | Commit when... | Don't commit when... |
   |----------------|---------------------|
   | Logical unit complete (model, service, component) | Small part of a larger unit |
   | Tests pass + meaningful progress | Tests failing |
   | About to switch contexts (backend → frontend) | Purely scaffolding with no behavior |
   | About to attempt risky/uncertain changes | Would need a "WIP" commit message |

   **Heuristic:** "Can I write a commit message that describes a complete, valuable change? If yes, commit. If the message would be 'WIP' or 'partial X', wait."

   **Scope Ledger Gate (Soloship — MANDATORY before this commit):** Before the
   commit that closes a task, invoke the `verification-before-completion` skill
   and emit its **Scope Ledger** (shipped / remaining / out-of-scope) and
   **Touch Map** (`git grep` the changed value/name across the whole repo; one
   row per hit, each resolved with evidence). Do not run `git commit` until the
   ledger is emitted and every Touch-Map row is resolved. If REMAINING is
   non-empty, do not call the task "done" — state exactly what shipped and what
   remains. This is the in-run catch for stale-state bugs and premature
   phase-done claims; it has to happen before the commit because the user does
   not interrupt mid-run.

   **Commit workflow:**
   ```bash
   # 1. Verify tests pass (use project's test command)
   # Examples: bin/rails test, npm test, pytest, go test, etc.

   # 1b. Scope Ledger Gate emitted and all Touch-Map rows resolved (see above)

   # 2. Stage only files related to this logical unit (not `git add .`)
   git add <files related to this logical unit>

   # 3. Commit with conventional message
   git commit -m "feat(scope): description of this unit"
   ```

   **Handling merge conflicts:** If conflicts arise during rebasing or merging, resolve them immediately. Incremental commits make conflict resolution easier since each commit is small and focused.

   **Note:** Incremental commits use clean conventional messages without attribution footers. The final Phase 4 commit/PR includes the full attribution.

3. **Follow Existing Patterns**

   - The plan should reference similar code - read those files first
   - Match naming conventions exactly
   - Reuse existing components where possible
   - Follow project coding standards (see CLAUDE.md)
   - When in doubt, grep for similar implementations

4. **Test Continuously**

   - Run relevant tests after each significant change
   - Don't wait until the end to test
   - Fix failures immediately
   - Add new tests for new functionality

5. **Figma Design Sync** (if applicable)

   For UI work with Figma designs:

   - Implement components following design specs
   - Compare the result against the design iteratively (screenshot the running UI and diff it against the design spec); a general-purpose subagent can do this comparison pass
   - Fix visual differences identified
   - Repeat until implementation matches design

6. **Track Progress**
   - Keep TodoWrite updated as you complete tasks
   - Note any blockers or unexpected discoveries
   - Create new tasks if scope expands
   - Keep user informed of major milestones

### Phase 3: Quality Check

1. **Run Core Quality Checks**

   Always run before submitting:

   ```bash
   # Run full test suite (use project's test command)
   # Examples: bin/rails test, npm test, pytest, go test, etc.

   # Run linting (per CLAUDE.md)
   # Use linting-agent before pushing to origin
   ```

2. **Consider Reviewer Subagents** (Optional)

   For complex, risky, or large changes, dispatch general-purpose review subagents using Soloship's shared rubrics (`references/code-review-axes.md`, `references/security-checklist.md`, `references/performance-checklist.md`, `references/testing-patterns.md`), or run `/soloship:review` for a full pass.

   Run configured agents in parallel with Task tool. Present findings and address critical issues.

3. **Final Validation**
   - All TodoWrite tasks marked completed
   - All tests pass
   - Linting passes
   - Code follows existing patterns
   - Figma designs match (if applicable)
   - No console errors or warnings
   - **Browser QA Gate passed (Step 2.6) — MANDATORY.** Every affected user-facing flow exercised in a real browser via `/soloship:browse` (test account where needed), issues fixed and re-verified by re-running the flow, evidence captured. Or an explicit "no browser surface" exemption with the outcome verified another way. **Do not enter Phase 4 (Ship It) until this passes** — a green build is not browser QA.

4. **Prepare Operational Validation Plan** (REQUIRED)
   - Add a `## Post-Deploy Monitoring & Validation` section to the PR description for every change.
   - Include concrete:
     - Log queries/search terms
     - Metrics or dashboards to watch
     - Expected healthy signals
     - Failure signals and rollback/mitigation trigger
     - Validation window and owner
   - If there is truly no production/runtime impact, still include the section with: `No additional operational monitoring required` and a one-line reason.

### Phase 4: Ship It

1. **Create Commit**

   **Scope Ledger Gate (Soloship — MANDATORY before this final commit):**
   Invoke `verification-before-completion` and emit the **Scope Ledger** +
   **Touch Map** for the whole change set, not just the last file touched.
   `git grep` every value/name introduced or changed across the repo; resolve
   every hit with evidence. Do not commit until the ledger is emitted and every
   row is resolved. If anything is REMAINING, the report must say so — never
   claim the plan is fully shipped when it is not.

   ```bash
   git add .
   git status  # Review what's being committed
   git diff --staged  # Check the changes

   # Commit with conventional format
   git commit -m "$(cat <<'EOF'
   feat(scope): description of what and why

   Brief explanation if needed.

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude <noreply@anthropic.com>
   EOF
   )"
   ```

2. **Capture Screenshots for UI Changes** (for any UI work)

   For design changes, new views, or UI modifications, capture before/after screenshots so the change is reviewable by eye.

   **Step 1: Start the dev server** (if not running) — use the project's dev command (e.g. `npm run dev`), run in the background.

   **Step 2: Capture screenshots with `/soloship:browse`** — navigate to the route and take a screenshot. `/soloship:browse` is Soloship's headless browser (open a URL, interact, screenshot, diff before/after).

   Keep the screenshots local (attach them when you show the result). There's no upload step — Soloship's default finish path is a local merge, not a PR, so screenshots are for the maintainer to eyeball, not to embed in a remote PR.

   **What to capture:**
   - **New screens**: Screenshot of the new UI
   - **Modified screens**: Before AND after screenshots
   - **Design implementation**: Screenshot showing Figma design match

   **IMPORTANT**: Always include uploaded image URLs in PR description. This provides visual context for reviewers and documents the change.

3. **Create Pull Request**

   ```bash
   git push -u origin feature-branch-name

   gh pr create --title "Feature: [Description]" --body "$(cat <<'EOF'
   ## Summary
   - What was built
   - Why it was needed
   - Key decisions made

   ## Testing
   - Tests added/modified
   - Manual testing performed

   ## Post-Deploy Monitoring & Validation
   - **What to monitor/search**
     - Logs:
     - Metrics/Dashboards:
   - **Validation checks (queries/commands)**
     - `command or query here`
   - **Expected healthy behavior**
     - Expected signal(s)
   - **Failure signal(s) / rollback trigger**
     - Trigger + immediate action
   - **Validation window & owner**
     - Window:
     - Owner:
   - **If no operational impact**
     - `No additional operational monitoring required: <reason>`

   ## Before / After Screenshots
   | Before | After |
   |--------|-------|
   | ![before](URL) | ![after](URL) |

   ## Figma Design
   [Link if applicable]

   ---

   [![Compound Engineered](https://img.shields.io/badge/Compound-Engineered-6366f1)](https://github.com/EveryInc/compound-engineering-plugin) 🤖 Generated with [Claude Code](https://claude.com/claude-code)
   EOF
   )"
   ```

4. **Update Plan Status**

   If the input document has YAML frontmatter with a `status` field, update it to `completed`:
   ```
   status: active  →  status: completed
   ```

5. **Notify User**
   - Summarize what was completed
   - Link to PR
   - Note any follow-up work needed
   - Suggest next steps if applicable


## Swarm Mode (Optional)

For complex plans with multiple independent workstreams, enable swarm mode for parallel execution with coordinated agents.

### When to Use Swarm Mode

| Use Swarm Mode when... | Use Standard Mode when... |
|------------------------|---------------------------|
| Plan has 5+ independent tasks | Plan is linear/sequential |
| Multiple specialists needed (review + test + implement) | Single-focus work |
| Want maximum parallelism | Simpler mental model preferred |
| Large feature with clear phases | Small feature or bug fix |

### Enabling Swarm Mode

To trigger swarm execution, say:

> "Make a Task list and launch an army of agent swarm subagents to build the plan"

Or explicitly request: "Use swarm mode for this work"

### Swarm Workflow

When swarm mode is enabled, the workflow changes:

1. **Create Team**
   ```
   Teammate({ operation: "spawnTeam", team_name: "work-{timestamp}" })
   ```

2. **Create Task List with Dependencies**
   - Parse plan into TaskCreate items
   - Set up blockedBy relationships for sequential dependencies
   - Independent tasks have no blockers (can run in parallel)

3. **Spawn Specialized Teammates**
   ```
   Task({
     team_name: "work-{timestamp}",
     name: "implementer",
     subagent_type: "general-purpose",
     prompt: "Claim implementation tasks, execute, mark complete",
     run_in_background: true
   })

   Task({
     team_name: "work-{timestamp}",
     name: "tester",
     subagent_type: "general-purpose",
     prompt: "Claim testing tasks, run tests, mark complete",
     run_in_background: true
   })
   ```

4. **Coordinate and Monitor**
   - Team lead monitors task completion
   - Spawn additional workers as phases unblock
   - Handle plan approval if required

5. **Cleanup**
   ```
   Teammate({ operation: "requestShutdown", target_agent_id: "implementer" })
   Teammate({ operation: "requestShutdown", target_agent_id: "tester" })
   Teammate({ operation: "cleanup" })
   ```

See the `orchestrating-swarms` skill for detailed swarm patterns and best practices.


## Key Principles

### Start Fast, Execute Faster

- Get clarification once at the start, then execute
- Don't wait for perfect understanding - ask questions and move
- The goal is to **finish the feature**, not create perfect process

### The Plan is Your Guide

- Work documents should reference similar code and patterns
- Load those references and follow them
- Don't reinvent - match what exists

### Test As You Go

- Run tests after each change, not at the end
- Fix failures immediately
- Continuous testing prevents big surprises

### Quality is Built In

- Follow existing patterns
- Write tests for new code
- Run linting before pushing
- Use reviewer agents for complex/risky changes only

### Ship Complete Features

- Mark all tasks completed before moving on
- Don't leave features 80% done
- A finished feature that ships beats a perfect feature that doesn't

## Quality Checklist

Before finishing (merge/ship), verify:

- [ ] All clarifying questions asked and answered
- [ ] All TodoWrite tasks marked completed
- [ ] Tests pass (run project's test command)
- [ ] Linting passes (use linting-agent)
- [ ] Code follows existing patterns
- [ ] Figma designs match implementation (if applicable)
- [ ] **Browser QA Gate passed (Step 2.6) — every affected user-facing flow exercised in a real browser via `/soloship:browse` (test account where needed), issues fixed AND re-verified, evidence captured — or an explicit "no browser surface" exemption verified another way. This is mandatory; a green build is not browser QA.**
- [ ] Before/after screenshots captured (for UI changes) — kept local for the maintainer to eyeball
- [ ] Commit messages follow conventional format

## When to Use Reviewer Agents

**Don't use by default.** Use reviewer agents only when:

- Large refactor affecting many files (10+)
- Security-sensitive changes (authentication, permissions, data access)
- Performance-critical code paths
- Complex algorithms or business logic
- User explicitly requests thorough review

For most features: tests + linting + following patterns is sufficient.

## Common Pitfalls to Avoid

- **Analysis paralysis** - Don't overthink, read the plan and execute
- **Skipping clarifying questions** - Ask now, not after building wrong thing
- **Ignoring plan references** - The plan has links for a reason
- **Testing at the end** - Test continuously or suffer later
- **Forgetting TodoWrite** - Track progress or lose track of what's done
- **80% done syndrome** - Finish the feature, don't move on early
- **Over-reviewing simple changes** - Save reviewer agents for complex work
