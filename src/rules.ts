import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function installRules(
  root: string,
  options: { force?: boolean } = {}
): Promise<string[]> {
  const results: string[] = [];
  const rulesDir = join(root, ".claude", "rules");

  if (!existsSync(rulesDir)) {
    mkdirSync(rulesDir, { recursive: true });
  }

  const rules: Record<string, string> = {
    "solution-search.md": RULE_SOLUTION_SEARCH,
    "plan-materialization.md": RULE_PLAN_MATERIALIZATION,
    "plan-rationale.md": RULE_PLAN_RATIONALE,
    "plan-lifecycle.md": RULE_PLAN_LIFECYCLE,
    "plan-claim-verification.md": RULE_PLAN_CLAIM_VERIFICATION,
    "billing-confirmation-gate.md": RULE_BILLING_CONFIRMATION_GATE,
  };

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
