import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function installRules(root: string): Promise<string[]> {
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
  };

  for (const [filename, content] of Object.entries(rules)) {
    const path = join(rulesDir, filename);
    if (!existsSync(path)) {
      writeFileSync(path, content);
      results.push(filename);
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
