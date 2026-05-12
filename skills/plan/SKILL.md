---
name: plan
description: |
  Create an implementation plan with enforcement gates. Searches
  docs/solutions/ for prior art, reads architecture context, then runs
  the Compound-Engineering-derived plan-writing methodology. Review is
  separate — handled by /soloship:review (which dispatches CEO/eng/design/
  devex plan-review skills, or autoplan for all-in-one).
---

# Soloship Plan

Your job is to create a thorough implementation plan that a fresh agent with
zero context can execute correctly.

## Step 0: Check for Grill-Me Rationale (and offer if missing)

Look for a sibling rationale doc at `docs/plans/YYYY-MM-DD-<slug>-grill.md` or
any recent `*-grill.md` file matching the topic.

**If a grill-me rationale exists:** Read it. It contains the premise, scope,
data model, edge cases, UX, and final scope decisions the user already made.
Carry this context into the planning methodology below so the plan inherits
the rationale and doesn't re-litigate settled questions.

**If no grill-me rationale exists AND the work is non-trivial:** Suggest
running it first.

> No grill-me rationale found for this work. For anything touching 5+ files,
> new infrastructure, data-model changes, or external integrations, run
> `/grill-me` first. The interview takes ~15-30 minutes and prevents the
> 3-revision review loop where scope cuts surface too late.
>
> Continue without grilling? (recommended only for small/mechanical work)

If the user says continue, proceed to Step 1. If the user opts to grill first,
exit and let `/grill-me` run.

## Step 1: Solution Search

Before planning anything, search `docs/solutions/` for prior art:
1. Grep for component names, file paths, and keywords related to this work
2. Search the entire directory — never limit to one category
3. If matches are found, read them and note any prevention strategies or pitfalls

Note: the planning methodology below also runs a `learnings-researcher`
agent that searches `docs/solutions/`. Doing it up front here makes the findings
explicit in the conversation before the methodology starts.

## Step 2: Read Architecture Context (with Freshness Check)

If `docs/architecture/REGISTRY.md` exists, read it to understand:
- What components are in scope for this work
- What depends on them (blast radius)
- What decisions have been made about them

If `docs/audit/audit-findings.json` exists:
1. Check the `date` and `ttl_days` fields. If today exceeds date + ttl_days, warn:
   "Audit findings are N days old (expires after M days). Consider re-running /audit for current data."
2. Check if any findings relate to the components being modified.

## Step 3: Apply the planning methodology

Apply the Compound-Engineering-derived plan-writing methodology below. It handles repo research, learnings research, optional external research, and produces a plan file that follows project conventions. Works for all plan sizes from small features through architectural changes.

**Review is a separate step.** Do not invoke `/soloship:eng-review`, `/soloship:ceo-review`, or `/soloship:plan-design-review` from here — those are review lenses, not planning. After the plan is written and passes the enforcement gate below, `/soloship:review` handles reviewing it (or `/soloship:autoplan` for all four reviews at once).

## Artifact Contract (Plan Files)

CE's workflow writes to its own location (often `docs/plans/` or
`docs/brainstorms/` depending on phase). Regardless of which tool produced it,
the final plan file must live at `docs/plans/YYYY-MM-DD-<slug>.md` and start
with YAML frontmatter:
```
---
date: YYYY-MM-DD
producer: soloship-plan
version: 1
status: Not started
ttl_days: 14
---
```

After writing, compute and insert content_hash (first 12 chars of SHA-256 of the body below frontmatter).

If CE wrote the plan elsewhere, move/rename it into `docs/plans/` and add the
frontmatter above so the rest of the Soloship workflow (implement, shipthorough,
cleanup) can find it.

## Step 4: Enforcement Gate

After the plan is written to `docs/plans/YYYY-MM-DD-<slug>.md`, validate:

- [ ] Plan file exists in `docs/plans/`
- [ ] Each phase/step has a "Why:" line explaining motivation
- [ ] Key Decisions section exists with alternatives considered
- [ ] Execution Strategy section exists (Direct / Subagent / Agent Teams)
- [ ] Handoff section exists with next step and context for next agent
- [ ] No prior pitfalls from solution search left unaddressed
- [ ] All dependencies/contracts for touched files are accounted for

**If any check fails:** Fix it before declaring the plan complete. Do not
proceed to implementation with an incomplete plan.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "This is simple, I don't need to search solutions first" | Simple tasks on complex codebases still hit documented pitfalls. The search takes 10 seconds; re-discovering a known issue takes an hour. |
| "I'll add the Key Decisions section later" | Plans without Key Decisions get executed with implicit decisions that nobody can review. Later never comes. |
| "The scope is obvious, I don't need an Execution Strategy" | Without an explicit strategy, agents default to "just start coding." This is how 3-file changes become 12-file refactors. |
| "I'll skip the enforcement gate — the plan looks good" | The gate exists because plans always look good to their author. Check the boxes. Every unchecked box is a failure mode in execution. |
| "I don't need to read the architecture registry" | The registry tells you what depends on what you're changing. Skipping it means surprise breakage in components you didn't know existed. |
| "CE's workflow already produced a plan, so I'm done" | CE produces a solid plan but doesn't know the Soloship artifact contract. Verify the file location, frontmatter, Execution Strategy, and Handoff section before declaring done. |

---

## Step 5: Suggest Next Step

After the plan passes validation:

> "Plan complete. Ready to implement? Run `/implement` to execute this plan,
> or `/review` to get an engineering review first."

For large plans (multiple phases, architectural decisions):
> "This is a substantial plan. Consider running `/review` for an engineering
> review before implementation."

## Verification

The plan is not complete until ALL of these are true:

- [ ] `docs/solutions/` was searched and results noted (even if no matches)
- [ ] Plan file exists at `docs/plans/YYYY-MM-DD-<slug>.md`
- [ ] Every phase/step has a "Why:" line
- [ ] Key Decisions section present with alternatives considered
- [ ] Execution Strategy section present (Direct / Subagent / Agent Teams)
- [ ] Handoff section present with next step for fresh agent
- [ ] All enforcement gate checks pass (Step 4 checklist — zero unchecked boxes)

---

## Plan Writing Methodology


<!-- Vendored from compound-engineering v2.34.0 (Kieran Klaassen). See skills/vendored/ce/LICENSE. -->

# Create a plan for a new feature or bug fix

## Introduction

**Note: The current year is 2026.** Use this when dating plans and searching for recent documentation.

Transform feature descriptions, bug reports, or improvement ideas into well-structured markdown files issues that follow project conventions and best practices. This command provides flexible detail levels to match your needs.

## Feature Description

<feature_description> #$ARGUMENTS </feature_description>

**If the feature description above is empty, ask the user:** "What would you like to plan? Please describe the feature, bug fix, or improvement you have in mind."

Do not proceed until you have a clear feature description from the user.

### 0. Idea Refinement

**Check for brainstorm output first:**

Before asking questions, look for recent brainstorm documents in `docs/brainstorms/` that match this feature:

```bash
ls -la docs/brainstorms/*.md 2>/dev/null | head -10
```

**Relevance criteria:** A brainstorm is relevant if:
- The topic (from filename or YAML frontmatter) semantically matches the feature description
- Created within the last 14 days
- If multiple candidates match, use the most recent one

**If a relevant brainstorm exists:**
1. Read the brainstorm document
2. Announce: "Found brainstorm from [date]: [topic]. Using as context for planning."
3. Extract key decisions, chosen approach, and open questions
4. **Skip the idea refinement questions below** - the brainstorm already answered WHAT to build
5. Use brainstorm decisions as input to the research phase

**If multiple brainstorms could match:**
Use **AskUserQuestion tool** to ask which brainstorm to use, or whether to proceed without one.

**If no brainstorm found (or not relevant), run idea refinement:**

Refine the idea through collaborative dialogue using the **AskUserQuestion tool**:

- Ask questions one at a time to understand the idea fully
- Prefer multiple choice questions when natural options exist
- Focus on understanding: purpose, constraints and success criteria
- Continue until the idea is clear OR user says "proceed"

**Gather signals for research decision.** During refinement, note:

- **User's familiarity**: Do they know the codebase patterns? Are they pointing to examples?
- **User's intent**: Speed vs thoroughness? Exploration vs execution?
- **Topic risk**: Security, payments, external APIs warrant more caution
- **Uncertainty level**: Is the approach clear or open-ended?

**Skip option:** If the feature description is already detailed, offer:
"Your description is clear. Should I proceed with research, or would you like to refine it further?"

## Main Tasks

### 1. Local Research (Always Runs - Parallel)

<thinking>
First, I need to understand the project's conventions, existing patterns, and any documented learnings. This is fast and local - it informs whether external research is needed.
</thinking>

Run these agents **in parallel** to gather local context:

- Task repo-research-analyst(feature_description)
- Task learnings-researcher(feature_description)

**What to look for:**
- **Repo research:** existing patterns, CLAUDE.md guidance, technology familiarity, pattern consistency
- **Learnings:** documented solutions in `docs/solutions/` that might apply (gotchas, patterns, lessons learned)

These findings inform the next step.

### 1.5. Research Decision

Based on signals from Step 0 and findings from Step 1, decide on external research.

**High-risk topics → always research.** Security, payments, external APIs, data privacy. The cost of missing something is too high. This takes precedence over speed signals.

**Strong local context → skip external research.** Codebase has good patterns, CLAUDE.md has guidance, user knows what they want. External research adds little value.

**Uncertainty or unfamiliar territory → research.** User is exploring, codebase has no examples, new technology. External perspective is valuable.

**Announce the decision and proceed.** Brief explanation, then continue. User can redirect if needed.

Examples:
- "Your codebase has solid patterns for this. Proceeding without external research."
- "This involves payment processing, so I'll research current best practices first."

### 1.5b. External Research (Conditional)

**Only run if Step 1.5 indicates external research is valuable.**

Run these agents in parallel:

- Task best-practices-researcher(feature_description)
- Task framework-docs-researcher(feature_description)

### 1.6. Consolidate Research

After all research steps complete, consolidate findings:

- Document relevant file paths from repo research (e.g., `app/services/example_service.rb:42`)
- **Include relevant institutional learnings** from `docs/solutions/` (key insights, gotchas to avoid)
- Note external documentation URLs and best practices (if external research was done)
- List related issues or PRs discovered
- Capture CLAUDE.md conventions

**Optional validation:** Briefly summarize findings and ask if anything looks off or missing before proceeding to planning.

### 2. Issue Planning & Structure

<thinking>
Think like a product manager - what would make this issue clear and actionable? Consider multiple perspectives
</thinking>

**Title & Categorization:**

- [ ] Draft clear, searchable issue title using conventional format (e.g., `feat: Add user authentication`, `fix: Cart total calculation`)
- [ ] Determine issue type: enhancement, bug, refactor
- [ ] Convert title to filename: add today's date prefix, strip prefix colon, kebab-case, add `-plan` suffix
  - Example: `feat: Add User Authentication` → `2026-01-21-feat-add-user-authentication-plan.md`
  - Keep it descriptive (3-5 words after prefix) so plans are findable by context

**Stakeholder Analysis:**

- [ ] Identify who will be affected by this issue (end users, developers, operations)
- [ ] Consider implementation complexity and required expertise

**Content Planning:**

- [ ] Choose appropriate detail level based on issue complexity and audience
- [ ] List all necessary sections for the chosen template
- [ ] Gather supporting materials (error logs, screenshots, design mockups)
- [ ] Prepare code examples or reproduction steps if applicable, name the mock filenames in the lists

### 3. SpecFlow Analysis

After planning the issue structure, run SpecFlow Analyzer to validate and refine the feature specification:

- Task spec-flow-analyzer(feature_description, research_findings)

**SpecFlow Analyzer Output:**

- [ ] Review SpecFlow analysis results
- [ ] Incorporate any identified gaps or edge cases into the issue
- [ ] Update acceptance criteria based on SpecFlow findings

### 4. Choose Implementation Detail Level

Select how comprehensive you want the issue to be, simpler is mostly better.

#### 📄 MINIMAL (Quick Issue)

**Best for:** Simple bugs, small improvements, clear features

**Includes:**

- Problem statement or feature description
- Basic acceptance criteria
- Essential context only

**Structure:**

````markdown
title: [Issue Title]
type: [feat|fix|refactor]
status: active
date: YYYY-MM-DD

# [Issue Title]

[Brief problem/feature description]

## Acceptance Criteria

- [ ] Core requirement 1
- [ ] Core requirement 2

## Context

[Any critical information]

## MVP

### test.rb

```ruby
class Test
  def initialize
    @name = "test"
  end
end
```

## References

- Related issue: #[issue_number]
- Documentation: [relevant_docs_url]
````

#### 📋 MORE (Standard Issue)

**Best for:** Most features, complex bugs, team collaboration

**Includes everything from MINIMAL plus:**

- Detailed background and motivation
- Technical considerations
- Success metrics
- Dependencies and risks
- Basic implementation suggestions

**Structure:**

```markdown
title: [Issue Title]
type: [feat|fix|refactor]
status: active
date: YYYY-MM-DD

# [Issue Title]

## Overview

[Comprehensive description]

## Problem Statement / Motivation

[Why this matters]

## Proposed Solution

[High-level approach]

## Technical Considerations

- Architecture impacts
- Performance implications
- Security considerations

## Acceptance Criteria

- [ ] Detailed requirement 1
- [ ] Detailed requirement 2
- [ ] Testing requirements

## Success Metrics

[How we measure success]

## Dependencies & Risks

[What could block or complicate this]

## References & Research

- Similar implementations: [file_path:line_number]
- Best practices: [documentation_url]
- Related PRs: #[pr_number]
```

#### 📚 A LOT (Comprehensive Issue)

**Best for:** Major features, architectural changes, complex integrations

**Includes everything from MORE plus:**

- Detailed implementation plan with phases
- Alternative approaches considered
- Extensive technical specifications
- Resource requirements and timeline
- Future considerations and extensibility
- Risk mitigation strategies
- Documentation requirements

**Structure:**

```markdown
title: [Issue Title]
type: [feat|fix|refactor]
status: active
date: YYYY-MM-DD

# [Issue Title]

## Overview

[Executive summary]

## Problem Statement

[Detailed problem analysis]

## Proposed Solution

[Comprehensive solution design]

## Technical Approach

### Architecture

[Detailed technical design]

### Implementation Phases

#### Phase 1: [Foundation]

- Tasks and deliverables
- Success criteria
- Estimated effort

#### Phase 2: [Core Implementation]

- Tasks and deliverables
- Success criteria
- Estimated effort

#### Phase 3: [Polish & Optimization]

- Tasks and deliverables
- Success criteria
- Estimated effort

## Alternative Approaches Considered

[Other solutions evaluated and why rejected]

## Acceptance Criteria

### Functional Requirements

- [ ] Detailed functional criteria

### Non-Functional Requirements

- [ ] Performance targets
- [ ] Security requirements
- [ ] Accessibility standards

### Quality Gates

- [ ] Test coverage requirements
- [ ] Documentation completeness
- [ ] Code review approval

## Success Metrics

[Detailed KPIs and measurement methods]

## Dependencies & Prerequisites

[Detailed dependency analysis]

## Risk Analysis & Mitigation

[Comprehensive risk assessment]

## Resource Requirements

[Team, time, infrastructure needs]

## Future Considerations

[Extensibility and long-term vision]

## Documentation Plan

[What docs need updating]

## References & Research

### Internal References

- Architecture decisions: [file_path:line_number]
- Similar features: [file_path:line_number]
- Configuration: [file_path:line_number]

### External References

- Framework documentation: [url]
- Best practices guide: [url]
- Industry standards: [url]

### Related Work

- Previous PRs: #[pr_numbers]
- Related issues: #[issue_numbers]
- Design documents: [links]
```

### 5. Issue Creation & Formatting

<thinking>
Apply best practices for clarity and actionability, making the issue easy to scan and understand
</thinking>

**Content Formatting:**

- [ ] Use clear, descriptive headings with proper hierarchy (##, ###)
- [ ] Include code examples in triple backticks with language syntax highlighting
- [ ] Add screenshots/mockups if UI-related (drag & drop or use image hosting)
- [ ] Use task lists (- [ ]) for trackable items that can be checked off
- [ ] Add collapsible sections for lengthy logs or optional details using `<details>` tags
- [ ] Apply appropriate emoji for visual scanning (🐛 bug, ✨ feature, 📚 docs, ♻️ refactor)

**Cross-Referencing:**

- [ ] Link to related issues/PRs using #number format
- [ ] Reference specific commits with SHA hashes when relevant
- [ ] Link to code using GitHub's permalink feature (press 'y' for permanent link)
- [ ] Mention relevant team members with @username if needed
- [ ] Add links to external resources with descriptive text

**Code & Examples:**

````markdown
# Good example with syntax highlighting and line references


```ruby
# app/services/user_service.rb:42
def process_user(user)

# Implementation here

end
```

# Collapsible error logs

<details>
<summary>Full error stacktrace</summary>

`Error details here...`

</details>
````

**AI-Era Considerations:**

- [ ] Account for accelerated development with AI pair programming
- [ ] Include prompts or instructions that worked well during research
- [ ] Note which AI tools were used for initial exploration (Claude, Copilot, etc.)
- [ ] Emphasize comprehensive testing given rapid implementation
- [ ] Document any AI-generated code that needs human review

### 6. Final Review & Submission

**Pre-submission Checklist:**

- [ ] Title is searchable and descriptive
- [ ] Labels accurately categorize the issue
- [ ] All template sections are complete
- [ ] Links and references are working
- [ ] Acceptance criteria are measurable
- [ ] Add names of files in pseudo code examples and todo lists
- [ ] Add an ERD mermaid diagram if applicable for new model changes

## Output Format

**Filename:** Use the date and kebab-case filename from Step 2 Title & Categorization.

```
docs/plans/YYYY-MM-DD-<type>-<descriptive-name>-plan.md
```

Examples:
- ✅ `docs/plans/2026-01-15-feat-user-authentication-flow-plan.md`
- ✅ `docs/plans/2026-02-03-fix-checkout-race-condition-plan.md`
- ✅ `docs/plans/2026-03-10-refactor-api-client-extraction-plan.md`
- ❌ `docs/plans/2026-01-15-feat-thing-plan.md` (not descriptive - what "thing"?)
- ❌ `docs/plans/2026-01-15-feat-new-feature-plan.md` (too vague - what feature?)
- ❌ `docs/plans/2026-01-15-feat: user auth-plan.md` (invalid characters - colon and space)
- ❌ `docs/plans/feat-user-auth-plan.md` (missing date prefix)

## Post-Generation Options

After writing the plan file, use the **AskUserQuestion tool** to present these options:

**Question:** "Plan ready at `docs/plans/YYYY-MM-DD-<type>-<name>-plan.md`. What would you like to do next?"

**Options:**
1. **Open plan in editor** - Open the plan file for review
2. **Run `/deepen-plan`** - Enhance each section with parallel research agents (best practices, performance, UI)
3. **Run `/technical_review`** - Technical feedback from code-focused reviewers (DHH, Kieran, Simplicity)
4. **Review and refine** - Improve the document through structured self-review
5. **Start `/workflows:work`** - Begin implementing this plan locally
6. **Start `/workflows:work` on remote** - Begin implementing in Claude Code on the web (use `&` to run in background)
7. **Create Issue** - Create issue in project tracker (GitHub/Linear)

Based on selection:
- **Open plan in editor** → Run `open docs/plans/<plan_filename>.md` to open the file in the user's default editor
- **`/deepen-plan`** → Call the /deepen-plan command with the plan file path to enhance with research
- **`/technical_review`** → Call the /technical_review command with the plan file path
- **Review and refine** → Load `document-review` skill.
- **`/workflows:work`** → Call the /workflows:work command with the plan file path
- **`/workflows:work` on remote** → Run `/workflows:work docs/plans/<plan_filename>.md &` to start work in background for Claude Code web
- **Create Issue** → See "Issue Creation" section below
- **Other** (automatically provided) → Accept free text for rework or specific changes

**Note:** If running `/workflows:plan` with ultrathink enabled, automatically run `/deepen-plan` after plan creation for maximum depth and grounding.

Loop back to options after Simplify or Other changes until user selects `/workflows:work` or `/technical_review`.

## Issue Creation

When user selects "Create Issue", detect their project tracker from CLAUDE.md:

1. **Check for tracker preference** in user's CLAUDE.md (global or project):
   - Look for `project_tracker: github` or `project_tracker: linear`
   - Or look for mentions of "GitHub Issues" or "Linear" in their workflow section

2. **If GitHub:**

   Use the title and type from Step 2 (already in context - no need to re-read the file):

   ```bash
   gh issue create --title "<type>: <title>" --body-file <plan_path>
   ```

3. **If Linear:**

   ```bash
   linear issue create --title "<title>" --description "$(cat <plan_path>)"
   ```

4. **If no tracker configured:**
   Ask user: "Which project tracker do you use? (GitHub/Linear/Other)"
   - Suggest adding `project_tracker: github` or `project_tracker: linear` to their CLAUDE.md

5. **After creation:**
   - Display the issue URL
   - Ask if they want to proceed to `/workflows:work` or `/technical_review`

NEVER CODE! Just research and write the plan.
