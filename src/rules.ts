import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function installClaudeRules(
  root: string,
  options: { force?: boolean } = {}
): Promise<string[]> {
  return installRulesAt(join(root, ".claude", "rules"), options);
}

export async function installCodexRules(
  root: string,
  options: { force?: boolean } = {}
): Promise<string[]> {
  return installRulesAt(join(root, ".codex", "rules"), options);
}

export const installRules = installClaudeRules;

async function installRulesAt(
  rulesDir: string,
  options: { force?: boolean } = {}
): Promise<string[]> {
  const results: string[] = [];

  if (!existsSync(rulesDir)) {
    mkdirSync(rulesDir, { recursive: true });
  }

  const rules = getWorkflowRules();

  for (const [filename, content] of Object.entries(rules)) {
    const path = join(rulesDir, filename);
    if (!existsSync(path)) {
      writeFileSync(path, content);
      results.push(filename);
    } else if (options.force) {
      writeFileSync(path, content);
      results.push(`${filename} (refreshed)`);
    } else {
      results.push(`${filename} (exists, skipped)`);
    }
  }

  return results;
}

export function getWorkflowRules(): Record<string, string> {
  return {
    "solution-search.md": RULE_SOLUTION_SEARCH,
    "plan-materialization.md": RULE_PLAN_MATERIALIZATION,
    "plan-rationale.md": RULE_PLAN_RATIONALE,
    "plan-lifecycle.md": RULE_PLAN_LIFECYCLE,
    "plan-claim-verification.md": RULE_PLAN_CLAIM_VERIFICATION,
    "billing-confirmation-gate.md": RULE_BILLING_CONFIRMATION_GATE,
    "recurrence-gate.md": RULE_RECURRENCE_GATE,
    "parameterize-constants.md": RULE_PARAMETERIZE_CONSTANTS,
    "browser-qa-gate.md": RULE_BROWSER_QA_GATE,
    "qa-plan-in-plans.md": RULE_QA_PLAN,
    "deploy-from-main-only.md": RULE_DEPLOY_FROM_MAIN_ONLY,
  };
}

const RULE_SOLUTION_SEARCH = `# Solution Search Before Work (Auto-Loaded)

## The Rule

Before planning, debugging, or reviewing any implementation, check if \`docs/solutions/\` exists in the project. If it does, search it for prior art related to the current task.

## When to Search

- Before starting any plan (Think or Plan phase)
- At the start of any debugging session
- When reviewing an implementation against a plan
- When encountering an error message

## How to Search

1. Grep \`docs/solutions/\` for keywords: component names, error messages, file paths, symptoms
2. Search the entire directory — never limit to a single category
3. Read frontmatter of matches to assess relevance
4. Read full doc if relevant, and apply its prevention strategies

## What to Do With Results

- Reference relevant solutions in plans and reviews
- Apply prevention strategies from past solutions
- If the current problem matches a documented one, follow the existing solution
`;

const RULE_PLAN_MATERIALIZATION = `# Plan Materialization (Auto-Loaded)

## The Rule

**Planning mode is for thinking. The plan file is the deliverable.**

After exiting planning mode, the FIRST action — before offering to clear context or implement — is writing the plan to \`docs/plans/YYYY-MM-DD-<slug>.md\`.

## Sequence

1. Enter planning mode (think, design, iterate with user)
2. Exit planning mode
3. IMMEDIATELY write plan to docs/plans/YYYY-MM-DD-<slug>.md
4. THEN offer to clear context and implement

Never skip step 3. Never say "I'll write the plan after we clear." The plan file must exist before the session boundary.

## Why This Exists

Planning mode disables file writes. This creates a gap where good planning work stays in conversation context but never reaches the filesystem. Context clears destroy it. This rule closes that gap.
`;

const RULE_PLAN_RATIONALE = `# Plan Rationale Requirements (Auto-Loaded)

Every implementation plan must carry enough reasoning for a fresh agent with zero context to understand why decisions were made.

## Inline Rationale

Each phase or major step must include a **Why** line explaining the motivation. Not just "delete these files" but "delete these files because they are dead code — no imports reference them."

## Key Decisions Section

Every plan must end with a **Key Decisions** section listing non-obvious choices and their reasoning. A decision qualifies as "key" if:
- Choosing between two or more reasonable approaches
- Deleting code or removing functionality
- Changing defaults or stored state schema
- Imposing architectural constraints
- Anything a reviewer might question
`;

const RULE_PLAN_LIFECYCLE = `# Plan Lifecycle (Auto-Loaded)

## Location

All plans go in \`docs/plans/\`. Naming: \`YYYY-MM-DD-<slug>.md\`

## Cleanup After Completion

### Small Plans (delete after commit)

ALL of these must be true:
- Single phase / fewer than 3 tasks
- Touches fewer than 5 files
- No architectural decisions worth preserving

**Action:** \`git rm\` the plan file after the final commit.

### Large Plans (archive)

ANY of these is true:
- Multiple phases or 3+ tasks
- Touches 5+ files
- Contains architectural decisions
- Spans multiple sessions

**Action:** \`git mv\` to \`docs/plans/archive/\`

When in doubt, archive. Deleting knowledge is worse than keeping a small file.
`;

const RULE_PLAN_CLAIM_VERIFICATION = `# Plan Claims Verified Against Live Codebase (Auto-Loaded)

## The Rule

A plan is a set of assertions about a codebase that does not exist in the
agent's context — it exists on disk. **Every factual claim in a plan must be
verified against the actual repo before the plan is allowed to proceed** to
review or implementation. This runs every time. It does not depend on anyone
remembering to ask for it.

## What Counts As A Factual Claim

- "X is already implemented / already done / already handled"
- File, function, module, or route locations ("the handler is in src/...")
- "There are tests for Y" / any coverage assertion
- Config / pricing / rate / limit / threshold values
- Dependency claims ("Z calls W", "nothing else uses this", "A depends on B")

## How To Verify

For each claim, run the check before proceeding — never restate from memory or
trust the plan's own wording:

| Claim | Check |
|-------|-------|
| "already implemented" | \`git grep\` the symbol/behavior; open the file; confirm it does X |
| location | \`git grep\` / \`ls\` the exact path or symbol |
| "tests exist for Y" | \`git grep\` the test; confirm it asserts Y, not just that a file exists |
| numeric value | \`git grep\` the constant; read the current on-disk value |
| dependency | \`git grep\` the call site; confirm direction; one hit disproves "nothing uses this" |

Emit a Claims Table (claim | verified TRUE/FALSE | evidence). If any
load-bearing claim is FALSE or unverifiable, the plan is wrong — correct it to
match reality or mark the claim as an explicit assumption to validate first.
A plan with an unverified load-bearing claim does not pass.

## Why This Exists

"Already done" claims that turned out false are the most expensive plan defect:
they send the next agent to build on a foundation that isn't there, which ends
in a full revert. The grep is seconds; the rework is hours. This was a
load-bearing audit done by hand every time — this rule makes it automatic.

## When This Triggers

- Any plan enforcement/validation gate (\`/soloship:plan\` Step 4).
- \`/soloship:autoplan\` Phase 0, before the review pipeline runs.
- Any time an agent is about to act on a plan's factual assertion.
`;

const RULE_BILLING_CONFIRMATION_GATE = `# Billing / Credit / Rerun-Window Confirmation Gate (Auto-Loaded)

## The Rule

**Any code that mutates billing, credit, or rerun-window state requires
confirming the data-model semantics with the user BEFORE writing the code.**
This is a hard gate, not a suggestion. Writing first and asking later is the
exact failure this prevents.

"Mutates billing/credit/rerun-window state" includes:

- Charging, refunding, proration, invoice or subscription state
- Credit grant / deduction / expiry / balance / ledger entries
- Rerun windows, free-retry windows, grace periods, trial length
- Backfills or migrations that touch any of the above
- Anything that changes how much a user is charged or how much credit/quota
  they have or how long a window stays open

## What "Confirm Data-Model Semantics" Means

Before writing code, state your understanding back to the user and get explicit
confirmation on:

1. **The unit and sign** — cents vs dollars; is the field a balance or a
   delta; does a larger number mean more credit or more owed
2. **Idempotency** — what happens if this runs twice (double-charge /
   double-grant is the classic backfill disaster)
3. **The window boundary** — inclusive/exclusive; timezone; what "expired"
   means; what an in-flight rerun does at the boundary
4. **Backfill scope** — which rows, what they currently hold, what they will
   hold after, and how you will verify the count before and after

Do not write or run the mutation/backfill until the user has confirmed these.
After confirmation, record it so the mechanical tripwire stands down: write a
one-line note to \`.ai/.billing-ack\` (\`mkdir -p .ai\`) describing what was
confirmed and the date.

## Why This Exists

This was the single most expensive recurring friction: billing/credit changes
written on an assumed data model, shipped, then discovered wrong — requiring
two rounds of backfill plus reverts. The cost of a five-minute confirmation is
nothing against a wrong production backfill of money or credit.

## When This Triggers

- Before editing any file whose path or content matches billing / credit /
  invoice / subscription / proration / refund / charge / ledger /
  rerun-window / grace-period / trial-length semantics.
- Before running any backfill or migration touching those tables.
- The Soloship \`PreToolUse\` billing tripwire hook blocks the edit until
  \`.ai/.billing-ack\` exists — that block is this rule's mechanical floor.
  Creating the ack file without actually confirming with the user violates
  this rule.
`;

const RULE_RECURRENCE_GATE = `# Recurrence Gate — Escape-Hatch Discipline (Auto-Loaded)

## What the gate does (mechanically, without your help)

A \`PreToolUse\` hook reads \`.ai/learnings.jsonl\` on every commit and blocks a
commit that matches a failure class already recorded there (1st recurrence =
block; 2nd+ = hard stop with full history). A \`PostToolUse\` complement records
script-issued commits that bypassed the block. **You are not asked to "check"
for recurrences — the hook does that deterministically.** This rule is not a
reminder to look; looking is automated on purpose.

## The one thing this rule governs: the escape hatch

The gate stands down when \`.ai/.recurrence-ack\` exists. That file is the
escape hatch, exactly like \`.ai/.billing-ack\`. It exists for the genuine case
where a patch really is correct *this* time and a mechanical fix is not yet
possible.

**Writing \`.ai/.recurrence-ack\` to make the block go away — without a real,
written reason that a mechanical fix is genuinely not the right call here —
defeats the entire instrument and violates this rule.** The block is telling
you the same thing was patched before; the correct default response is to
escalate to a *mechanical* fix (a hook, a test, or a structural change that
makes the failure impossible to recur), not to re-patch and ack.

Only write the ack when you can state, in the ack line itself, why a one-off
patch is correct and a mechanical fix is not — and prefer surfacing that
judgment to the user over deciding it silently.

## Why

The value here is cross-session pattern detection that survives \`/clear\`.
Trivially acking around it reintroduces exactly the failure it removes: the
same non-fix, applied again, with no one noticing it is the second (or third)
time. The hook is the floor; this rule is the anti-gaming clause on its only
bypass.
`;

const RULE_PARAMETERIZE_CONSTANTS = `# Parameterize Values — No Magic Literals (Auto-Loaded)

## The Rule

When writing or changing code, give meaningful values a name. Pull numbers, URLs, keys, limits, timeouts, thresholds, file paths, repeated strings, and similar values into named constants, variables, or config — anything that has one definition and one place to change.

"Meaningful" = (a) appears more than once, (b) carries business meaning, or (c) someone might reasonably want to change it later. Trivial one-shot literals (loop indices, an obvious \`0\` or \`1\`, single-use formatting) stay inline.

## When You Encounter Un-Parameterized Values

This rule has two beats — the silent fix, then the explicit ask:

1. **The section you're already editing:** refactor it as part of your current change. Do not ask first — just do it. Extracting a literal into a named constant is part of the change, not a separate decision.
2. **Other places with the same problem:** finish your current task without touching them. Then, in your final report, list each location and ask whether to refactor those too. Example: "I parameterized \`BASE_URL\` in \`api.ts\`. The same hardcoded value also appears in \`webhook.ts:42\`, \`health.ts:18\`, and \`tests/setup.ts:7\` — want me to do those next?"
3. **After refactoring, verify:** confirm the named value is used everywhere the literal was, and that behavior is unchanged (run tests, re-read the diff, search for any remaining literal instances).

## Why

Named values are the line between maintainable software and software that decays. One definition to change beats hunting copies; a wrong copy left behind is a bug waiting to be found in production. The cost of naming a value now is seconds; the cost of fixing the wrong-copy bug later is hours. The maintainer of a Soloship project has explicitly opted into the more thorough fix here — when uncertain, parameterize.

## Honest Limit

No mechanical hook can detect "this should have been a constant" — it's a judgment call. This rule is reloaded every session, but in very long editing sessions it can drift out of attention. If you've been editing for a while without checking, re-read it.

## When This Triggers

- Any time you write new code that contains a literal value matching the "meaningful" criteria above.
- Any time you read existing code while making a change and notice a literal that meets the criteria.
- Any time you copy-paste a value from one place to another — that's a parameterization opportunity by definition.
`;

const RULE_BROWSER_QA_GATE = `# Browser QA Before Done (Auto-Loaded)

## The Rule

**No work is "done," "complete," "fixed," or "shipped" until every user-facing
flow it touches has been exercised in a real browser, any issue found has been
fixed, and the fix has been re-verified by re-running the flow.** A green build
and passing tests are necessary but not sufficient — they prove the code
compiles and units pass, not that the button does the thing. Only driving the
real UI proves that.

This is \`verification-before-completion\` applied to the user-facing surface, and
it is a hard gate. It is satisfied by **observed evidence**, never by assertion.
"It should work," "the build is green," or "I changed the code that renders it"
do not pass this gate. Watching the real flow happen does.

## What "browser QA" means

Use \`/soloship:browse\` (Soloship's headless browser) against the running app
(local dev server or deployed preview):

1. **Identify the affected surface.** From the diff, list every page, route,
   component, and flow this change can reach. That whole list is what gets
   exercised — not just the one screen you had in mind.
2. **Exercise real flows, not page loads.** Click the happy path *and* the
   states the change introduces or affects (empty, error, loading, validation
   failure, the specific interaction). Loading a page without interacting is not
   QA.
3. **Capture evidence** — screenshots and the observed result of each flow.

## Test accounts

If a flow requires authentication or specific account state (a role, a record, a
paid plan), QA it **as a real logged-in user with a test account** — do not skip
the authenticated path.

1. **Look for documented test accounts** at \`docs/testing/test-accounts.md\`. If
   it exists, use the account it names as the default for QA (and read the
   credentials from the gitignored secrets file it points to). Use a different
   account only when the task specifically calls for one.
2. **If no test account is documented and a flow needs auth, STOP and ask the
   user:** *"This project has no documented test account and this flow needs a
   login. Want me to create a test account and document it so QA always uses it
   from now on (unless a specific account is needed)?"*
   - **If yes:** create the account the cheapest reliable way — the app's own
     signup flow via \`/soloship:browse\`, or a seed/admin script if one exists.
     If the account genuinely can't be self-served (manual provisioning,
     external IdP), ask the user to provision one and hand you the credentials.
     Then **document it**: write \`docs/testing/test-accounts.md\` recording each
     account, its role/purpose, the environment it works in, and which one is
     the **default for QA**; store the actual secrets in a gitignored file
     (\`.ai/test-credentials.json\`, or the project's existing secret mechanism —
     never commit credentials) and reference that location from the doc. Use
     **non-production, disposable** credentials only.
   - **From then on**, that documented default account is what QA uses unless the
     task names a specific one.
   - **If no:** the authenticated flow is untested — say so plainly and do not
     call the work done. "Couldn't test, it needs a login" is an unmet gate, not
     an exemption.

## The fix-and-re-verify loop

Any issue browser QA surfaces (visual break, broken interaction, console error,
wrong behavior, regression on an adjacent flow):

1. Fix it.
2. **Re-run the browser QA for that flow** and observe the fix actually working.
   A fix is not done because the code changed; it's done when the re-run shows
   the correct behavior.
3. Repeat until every affected flow passes clean.

Only then may the work proceed to finish/merge/ship.

## The only valid exemption

If the change has **no browser-reachable surface** — a pure CLI change, internal
script, config/infra-only change, or a data migration with no UI effect — state
that explicitly with the reason ("No browser QA: this only touches the build
script; nothing renders differently"), and verify the actual observable outcome
another way (run the CLI and show output, hit the endpoint and show the response,
query the data and show the row). The exemption is "there is nothing in a
browser to test," never "browser testing is inconvenient" or "I'm confident."
When in doubt, open it in the browser.

## When This Triggers

- Any time work is about to be called done/complete/fixed in \`/soloship:implement\`
  (its Browser QA Gate, Step 2.6).
- Before the merge in \`/soloship:shipthorough\` and before reporting "Shipped" in
  \`/soloship:shipfast\`.
- Any other point an agent is about to claim a user-facing change works.

This gate is **in addition to** the Scope Ledger Gate and the Iron Law of
verification, not a replacement.
`;

const RULE_QA_PLAN = `# QA Plan In Every Plan — Method Matched To Work Type (Auto-Loaded)

## The Rule

**Every implementation plan must contain a \`## QA Plan\` section** — a table of
every surface the work touches, the verification method **matched to the type of
work**, and the evidence that will be captured. How the work will be verified is
a planning decision, not an afterthought at ship time.

Automated tests are **necessary but never sufficient** — a green suite proves the
units pass, not that the real surface behaves. Every plan names at least one
*observed, end-to-end* verification of the real surface. "Run the test suite"
alone never passes as a QA Plan.

## Format

\`\`\`markdown
## QA Plan

| Surface touched | How it will be verified | Evidence |
|---|---|---|
| /settings page (UI) | browser QA: change a setting, reload, verify persistence; exercise the validation-error state | screenshots |
| POST /api/settings | real requests: happy path + 401 + invalid payload | response bodies |
\`\`\`

One row per touched surface — a UI + API + migration change needs three rows.

## Choosing the method — match it to the work type

| Work type / surface | Primary verification (in addition to automated tests) |
|---|---|
| Web UI / user-facing flow | **Browser QA** (headless browser / browser MCP) — drive each affected flow end-to-end, including empty/error/loading/validation states; capture screenshots. The default whenever *anything* renders in a browser. |
| API endpoint / webhook / server route | Real requests against the running service — happy path + auth failure + validation error; capture actual responses. |
| CLI / installer / script | Run the real commands end-to-end in a clean scratch directory; capture output and exit codes; verify produced artifacts. |
| Data migration / backfill | Pre/post row counts, spot-check queries, idempotency check (safe to run twice), rollback path stated. |
| Cron / background job / queue consumer | Trigger the job once manually; observe logs and the produced side effect. |
| Config / infra / deploy pipeline | Deploy to preview/staging; verify the behavior the config controls actually changed. |
| Pure logic / library / refactor | Unit/property tests PLUS one consumer-level smoke through a real caller. Tests alone only when no runtime surface exists. |
| Skill / prompt / agent-governance change | Dry-run the skill or hook in a real session on a sample task; confirm the new behavior appears. |
| Docs-only | Read the rendered output; verify referenced paths/links exist. |

Browser QA is the default whenever any browser-reachable surface exists — it most
often makes the most sense. But a change with no browser surface must pick the
matching row, never skip QA.

## The fix-and-re-verify loop (every row, until perfect)

Executing the QA Plan is a loop, not a checklist pass. If ANY row surfaces ANY
issue — wrong behavior, failing request, wrong CLI output, bad migration result,
regression on an adjacent surface:

1. Fix it.
2. **Re-execute that row** and observe the fix actually working (re-drive the
   flow / re-send the request / re-run the command / re-check the data). A fix
   is done when the re-run shows correct behavior, not when the code changed.
3. **Re-check adjacent rows the fix could have touched.**
4. Repeat until **every row passes clean**. Never stop at "mostly passing,"
   never downgrade a failing row to a known issue or a follow-up task.

The loop has exactly two exits: every row passes with evidence, or a failure is
genuinely unfixable right now (external blocker, needs the user's product
decision) — then STOP, report the work as **NOT done** with the failing row and
why, and ask the user. Never silently proceed. If the same fix keeps failing,
debug the root cause instead of re-patching, then resume the loop.

## Why This Exists

Verification used to be enforced only at execution time (the browser-qa-gate
rule). Plans could pass review with a generic "testing requirements" bullet, and
the QA method got improvised at the end — defaulting to whatever was easiest,
not whatever matched the work. Naming the method per surface at plan time makes
thorough QA the planned path instead of a rescue.

## When This Triggers

- Writing any implementation plan (any producer, not just \`/soloship:plan\`).
- Reviewing a plan: a plan without a QA Plan section, or whose rows don't match
  the work type, does not pass review.
- Executing a plan: the QA gate executes every row of the plan's QA Plan before
  the work may be called done. If an older plan has no QA Plan section, derive
  one from the diff and execute it.

This rule is the plan-time complement to \`browser-qa-gate\` (the execution-time
floor). Both apply.
`;

const RULE_DEPLOY_FROM_MAIN_ONLY = `# Deploy From Main Only (Auto-Loaded)

## The Rule

**Production only ever runs the default branch.** A production deploy means:
merge to the default branch (\`main\`/\`master\`) first, then deploy from a
**clean, synced default-branch checkout in the main working copy** — never from
a worktree, never from a feature branch, never with uncommitted changes.

**Preview/channel deploys are exempt** and stay allowed from worktrees and
feature branches (\`wrangler pages deploy --branch=<preview>\`, \`vercel\`
without \`--prod\`, \`firebase hosting:channel:deploy\`, \`netlify deploy\`
without \`--prod\`). Browser QA depends on worktree sessions deploying previews
to test against — that must keep working.

## Why

With parallel agent sessions in worktrees, deploying from a worktree breaks the
one invariant that makes multi-session deploys safe: **what is live is always a
commit on the default branch's history**. Once production runs a worktree
commit, a later (perfectly correct) deploy from the default branch silently
rolls back the worktree's fix — the most expensive multi-session failure mode.

## The Deploy Train

Merge freely, deploy deliberately. Merging to the default branch and deploying
are separate decisions: merged-but-undeployed work simply waits for the next
train. Batching several merged changes into one deploy is normal and good —
especially when deploys are slow. Never treat "it merged" as "it must deploy
now," and never deploy around the queue because another session is mid-deploy.

## The Contracts

1. **The \`prod\` tag marks what is live.** After every successful production
   deploy: \`git tag -f prod && git push -f origin prod\`. Repos that deploy
   multiple targets use \`prod-<target>\` per target. If a repo already uses a
   \`prod\` tag for something else, fall back to \`soloship-prod\`. The tag
   answers "what's live" for every session and machine; it marks what was
   *deployed*, not what is observably *live* (post-deploy verification is its
   own gate).
2. **Every production deploy shows a manifest first.** \`git fetch --tags
   origin\`, then \`git log prod..HEAD --oneline\` → present "this deploy ships
   these N changes" (including other sessions' merged work) → explicit
   go/no-go from the user. First deploy (no \`prod\` tag yet) is stated
   explicitly and creates the tag.
3. **One deploy at a time.** Acquire the deploy lock
   (\`<git-common-dir>/soloship/deploy.lock\`) before deploying; release it on
   success AND failure. A fresh lock owned by another session = wait or ask,
   never proceed. A stale lock (older than the \`deploy_lock_stale_min\`
   threshold in \`<git-common-dir>/soloship/config.json\`) is *presumed*
   abandoned but NEVER auto-broken — surface it and let the user decide.

The full step-by-step sequence lives in the Soloship skill reference
\`references/deploy-sequence.md\` and is what \`/soloship:shipfast\` and
\`/soloship:shipthorough\` run. Follow it for any manual production deploy too.

## When This Triggers

- Any production deploy command, from any skill or ad-hoc request.
- The PreToolUse deploy-discipline hook is the mechanical floor: it blocks
  production deploys from a worktree, from a non-default branch, with a dirty
  tree, or past another session's fresh deploy lock. The manifest and go/no-go
  conversation are skill-level (hooks cannot converse) — this rule is what
  makes them mandatory.
- Platform-side auto-deploys (git-integration, CI) bypass local enforcement;
  if a project adopts them, platform branch controls become the enforcement
  point.
`;
