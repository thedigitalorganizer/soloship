---
name: learn
description: |
  Capture knowledge from non-obvious work. Creates a solution doc via
  learn, then audits the architecture registry for drift,
  propagates new pitfalls into AGENTS.md files, and creates missing AGENTS.md
  for directories that have grown past the governance threshold.
  Cherry-picks the learnings.jsonl persistence pattern for quick cross-session search.
---

## Host Compatibility

If you are running this skill in Codex, read `../references/codex-compatibility.md` before following host-specific tool instructions. Claude Code should continue to use the Claude-specific tools and command wrappers described here.

# Soloship Learn

Your job is to capture what was learned from non-obvious work so future sessions
don't have to re-investigate.

## Step 1: Capture Solution Doc

Apply the compound-knowledge methodology below (vendored from Compound Engineering). It guides you through documenting:
- What problem was solved
- What was the root cause
- What prevention strategies apply

The output goes to `docs/solutions/<category>/` with proper frontmatter.

### Pick the track first

`problem_type` selects one of two tracks, and the track decides which fields are
**required**:

- **Bug track** — you fixed something broken (an error, failure, regression, or
  misbehavior). `problem_type` is a bug-ish value: `build_error`, `test_failure`,
  `runtime_error`, `performance_issue`, `database_issue`, `security_issue`,
  `ui_bug`, `integration_issue`, `logic_error`. The bug track **requires**
  `symptoms`, `root_cause`, and `resolution_type` — the doc is useless to a
  future searcher without the observable symptom and the underlying cause.
- **Knowledge track** — you captured durable guidance, a pattern, or a
  convention (no single broken thing). `problem_type` is `best_practice`,
  `pattern`, `convention`, or `concept`. Here `symptoms`/`root_cause`/
  `resolution_type` are **optional** — include them only if a specific cause
  genuinely applies.

### Frontmatter (artifact contract)

```yaml
---
title: Short descriptive title
date: YYYY-MM-DD
producer: soloship-learn
version: 1
ttl_days: 90
problem_type: <selects the track — see list above>
category: one-of-the-categories
components: [list, of, affected, components]
files: [list, of, key, files]
symptoms: [what, the, user, sees]      # REQUIRED for bug track; optional for knowledge track
root_cause: <one enum value below>     # REQUIRED for bug track; optional for knowledge track
resolution_type: <one enum value below> # REQUIRED for bug track; optional for knowledge track
error_messages: [exact, error, strings]
tags: [searchable, keywords]
---
```

**`root_cause` enum** (pick the closest): `missing_association`, `missing_include`,
`missing_index`, `wrong_api`, `scope_issue`, `thread_violation`, `async_timing`,
`memory_leak`, `config_error`, `logic_error`, `test_isolation`,
`missing_validation`, `missing_permission`, `missing_workflow_step`,
`inadequate_documentation`, `missing_tooling`, `incomplete_setup`.

**`resolution_type` enum** (pick the closest): `code_fix`, `migration`,
`config_change`, `test_fix`, `dependency_update`, `environment_setup`,
`workflow_improvement`, `documentation_update`, `tooling_addition`,
`seed_data_update`.

The doc body must always carry a **Solution** section (the actual fix) and, for
the bug track, a **Why This Works** section that states the root cause in prose
and why the fix addresses it. The `root_cause` enum is the searchable index; the
prose is what a future reader actually needs.

After writing, compute and insert `content_hash` (first 12 chars of SHA-256 of the body).

## Step 2: Log Operational Learning

After the solution doc is written, append a one-line JSONL entry for quick
cross-session search:

```bash
mkdir -p .ai
echo '{"date":"YYYY-MM-DD","key":"SHORT_KEY","type":"TYPE","insight":"ONE_LINE_SUMMARY","solution":"docs/solutions/CATEGORY/FILENAME.md","components":["COMP1","COMP2"]}' >> .ai/learnings.jsonl
```

Where:
- `key`: 2-5 word kebab-case identifier (e.g., "auth-token-expiry")
- `type`: pattern | pitfall | preference | architecture
- `insight`: one sentence capturing the core learning
- `solution`: path to the full solution doc
- `components`: which components this affects

## Step 3: Registry Audit (if registry exists)

If `docs/architecture/REGISTRY.md` exists, do a quick drift check:

1. Read the registry
2. Compare against current codebase state (run quick import trace)
3. Flag:
   - Components that no longer exist (stale entries)
   - New components not tracked (missing entries)
   - Dependencies that changed (imports differ from registry)
4. If drift is found, update the registry and include in the next commit

If no registry exists, skip this step.

## Step 4: AGENTS.md Propagation

Using the `files` and `components` fields from the solution doc frontmatter as
your scope, check each affected directory's AGENTS.md:

1. For each file in the `files` frontmatter field, take its immediate parent directory. De-duplicate the list.
2. For each directory:
   - If `AGENTS.md` **exists**: read it, then check whether the pitfall, contract,
     or invariant revealed by this solution is already documented there.
     If not, append a new entry under the most relevant section (Pitfalls,
     Contracts, or Invariants — create the section header if absent).
     **Preserve all existing content — only add, never overwrite.**
   - If `AGENTS.md` **does not exist**: skip (Step 5 handles creation)
3. When appending, use this format:
   ```
   ### [Pitfall|Contract|Invariant]: Brief title
   _Added by soloship-learn YYYY-MM-DD_
   [One paragraph: what was learned, what to watch for, how to avoid it]
   ```
4. If the solution is environment-specific and produces no transferable insight
   (e.g., a one-time deploy token rotation), note "No AGENTS.md updates needed —
   solution is not transferable" and skip.

---

## Step 5: Create Missing AGENTS.md Nodes

For each file in the solution doc's `files` frontmatter field, take its immediate
parent directory (de-duplicated) as the scope. Check each for governance gaps:

1. For each directory in scope:
   - Count source files (exclude: build artifacts, lock files, generated code,
     test-only files, config-only files)
   - If **3+ source files** AND **no AGENTS.md** → create one
   - Skip: test-only dirs, build output dirs, config-only dirs

2. When creating, infer from actual directory contents — do not generate stubs:
   - **Scope**: what this directory owns (infer from file names and import targets)
   - **Contracts**: what other code imports from here (grep for imports of this directory)
   - **Key Files**: the 3-8 most important files with one-line descriptions
   - **Pitfalls**: include the pitfall just documented in this learn session

3. Use this skeleton — keep it 15-40 lines:

   ```markdown
   # AGENTS.md — [directory name]

   ## Scope
   [What this directory owns — inferred from actual files]

   ## Contracts
   [What other code depends on from this directory — don't break these]

   ## Key Files
   - `filename.ext` — what it does

   ## Pitfalls
   - [Known pitfalls — use the Step 4 append format for each entry]
   ```

4. **Do not create stubs.** If you cannot infer real scope from the files (e.g.,
   the directory has only generated files or vendor code), skip it. A missing
   AGENTS.md is better than a wrong one that misleads future agents.

---

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "This fix was straightforward, not worth documenting" | If it was straightforward, the solution doc takes 2 minutes. If it wasn't and you think it was, you're forgetting the hour you spent figuring it out. |
| "I'll remember this next time" | You won't. And even if you do, the next agent in a fresh session definitely won't. Solution docs are for future sessions, not your memory. |
| "There's no good category for this" | Create one. Categories emerge from solutions, not the other way around. |
| "The registry audit is overkill — I only changed one file" | One file change can shift dependency graphs. The drift check takes 30 seconds and catches stale entries. |
| "The AGENTS.md already covers this area, no need to update" | Read it and check. "Covers an area" and "documents this specific pitfall" are different. Append the specific pitfall — future agents need it. |
| "I'll create AGENTS.md later when the directory is more stable" | Governance gaps compound. Context is freshest right now. A 15-line file today saves hours of archaeology later. |

---

## Step 6: Suggest Next Step

> "Knowledge captured. Run `/shipfast` or `/shipthorough` to ship your changes."

## Verification

Learn is not complete until ALL of these are true:

- [ ] Solution doc written to `docs/solutions/<category>/` with valid frontmatter
- [ ] Frontmatter includes: title, date, problem_type, category, components, tags — and, for **bug-track** docs (`problem_type` is build_error/test_failure/runtime_error/performance_issue/database_issue/security_issue/ui_bug/integration_issue/logic_error), also `symptoms`, `root_cause` (a value from the enum), and `resolution_type` (a value from the enum). Knowledge-track docs may omit the latter three.
- [ ] Bug-track doc body has a **Solution** section and a **Why This Works** (root-cause) section
- [ ] JSONL entry appended to `.ai/learnings.jsonl` with key, type, insight, solution path
- [ ] Registry drift check completed (or registry confirmed absent)
- [ ] AGENTS.md files updated for all affected directories where new knowledge applies (or "not transferable" noted)
- [ ] AGENTS.md created for any touched directories with 3+ source files and no existing file (or skipped with reason noted)

---

## Compounding Knowledge Methodology

> **Authority note:** Step 1's two-track frontmatter contract above is the
> authoritative schema — adapted from Compound Engineering's compound v3.14.3
> (the bug/knowledge tracks, the `root_cause`/`resolution_type` enums, and the
> required-fields-by-track rule). The methodology prose below is the older
> v2.34.0 single-pass orchestration, kept for its documenting guidance; where it
> and Step 1 differ on required fields, **Step 1 governs.**

<!-- Vendored from compound-engineering v2.34.0 (Kieran Klaassen). See skills/vendored/ce/LICENSE. Step 1's frontmatter contract above was upgraded to compound v3.14.3's two-track schema; this orchestration prose remains v2.34.0. -->

# /compound

Coordinate multiple subagents working in parallel to document a recently solved problem.

## Purpose

Captures problem solutions while context is fresh, creating structured documentation in `docs/solutions/` with YAML frontmatter for searchability and future reference. Uses parallel subagents for maximum efficiency.

**Why "compound"?** Each documented solution compounds your team's knowledge. The first time you solve a problem takes research. Document it, and the next occurrence takes minutes. Knowledge compounds.

## Usage

```bash
/soloship:learn                    # Document the most recent fix
/soloship:learn [brief context]    # Provide additional context hint
```

## Execution Strategy: Two-Phase Orchestration

<critical_requirement>
**Only ONE file gets written - the final documentation.**

Phase 1 subagents return TEXT DATA to the orchestrator. They must NOT use Write, Edit, or create any files. Only the orchestrator (Phase 2) writes the final documentation file.
</critical_requirement>

### Phase 1: Parallel Research

<parallel_tasks>

Launch these subagents IN PARALLEL. Each returns text data to the orchestrator.

#### 1. **Context Analyzer**
   - Extracts conversation history
   - Identifies problem type, component, symptoms
   - Validates against schema
   - Returns: YAML frontmatter skeleton

#### 2. **Solution Extractor**
   - Analyzes all investigation steps
   - Identifies root cause
   - Extracts working solution with code examples
   - Returns: Solution content block

#### 3. **Related Docs Finder**
   - Searches `docs/solutions/` for related documentation
   - Identifies cross-references and links
   - Finds related GitHub issues
   - Returns: Links and relationships

#### 4. **Prevention Strategist**
   - Develops prevention strategies
   - Creates best practices guidance
   - Generates test cases if applicable
   - Returns: Prevention/testing content

#### 5. **Category Classifier**
   - Determines optimal `docs/solutions/` category
   - Validates category against schema
   - Suggests filename based on slug
   - Returns: Final path and filename

</parallel_tasks>

### Phase 2: Assembly & Write

<sequential_tasks>

**WAIT for all Phase 1 subagents to complete before proceeding.**

The orchestrating agent (main conversation) performs these steps:

1. Collect all text results from Phase 1 subagents
2. Assemble complete markdown file from the collected pieces
3. Validate YAML frontmatter against schema
4. Create directory if needed: `mkdir -p docs/solutions/[category]/`
5. Write the SINGLE final file: `docs/solutions/[category]/[filename].md`

</sequential_tasks>

### Phase 3: Optional Enhancement

**WAIT for Phase 2 to complete before proceeding.**

<parallel_tasks>

Based on problem type, optionally dispatch a general-purpose subagent to sanity-check the documentation against the relevant Soloship checklist before saving:

- **performance_issue** → `references/performance-checklist.md`
- **security_issue** → `references/security-checklist.md`
- **test_failure** → `references/testing-patterns.md`
- Any code-heavy issue → `references/code-review-axes.md`

</parallel_tasks>

## What It Captures

- **Problem symptom**: Exact error messages, observable behavior
- **Investigation steps tried**: What didn't work and why
- **Root cause analysis**: Technical explanation
- **Working solution**: Step-by-step fix with code examples
- **Prevention strategies**: How to avoid in future
- **Cross-references**: Links to related issues and docs

## Preconditions

<preconditions enforcement="advisory">
  <check condition="problem_solved">
    Problem has been solved (not in-progress)
  </check>
  <check condition="solution_verified">
    Solution has been verified working
  </check>
  <check condition="non_trivial">
    Non-trivial problem (not simple typo or obvious error)
  </check>
</preconditions>

## What It Creates

**Organized documentation:**

- File: `docs/solutions/[category]/[filename].md`

**Categories auto-detected from problem:**

- build-errors/
- test-failures/
- runtime-errors/
- performance-issues/
- database-issues/
- security-issues/
- ui-bugs/
- integration-issues/
- logic-errors/

## Common Mistakes to Avoid

| ❌ Wrong | ✅ Correct |
|----------|-----------|
| Subagents write files like `context-analysis.md`, `solution-draft.md` | Subagents return text data; orchestrator writes one final file |
| Research and assembly run in parallel | Research completes → then assembly runs |
| Multiple files created during workflow | Single file: `docs/solutions/[category]/[filename].md` |

## Success Output

```
✓ Documentation complete

Subagent Results:
  ✓ Context Analyzer: Identified performance_issue in brief_system
  ✓ Solution Extractor: 3 code fixes
  ✓ Related Docs Finder: 2 related issues
  ✓ Prevention Strategist: Prevention strategies, test suggestions
  ✓ Category Classifier: `performance-issues`

Checklist Sanity-Check (optional):
  ✓ performance-checklist.md: query optimization approach holds up
  ✓ code-review-axes.md: solution is appropriately minimal

File created:
- docs/solutions/performance-issues/n-plus-one-brief-generation.md

This documentation will be searchable for future reference when similar
issues occur in the Email Processing or Brief System modules.

What's next?
1. Continue workflow (recommended)
2. Link related documentation
3. Update other references
4. View documentation
5. Other
```

## The Compounding Philosophy

This creates a compounding knowledge system:

1. First time you solve "N+1 query in brief generation" → Research (30 min)
2. Document the solution → docs/solutions/performance-issues/n-plus-one-briefs.md (5 min)
3. Next time similar issue occurs → Quick lookup (2 min)
4. Knowledge compounds → Team gets smarter

The feedback loop:

```
Build → Test → Find Issue → Research → Improve → Document → Validate → Deploy
    ↑                                                                      ↓
    └──────────────────────────────────────────────────────────────────────┘
```

**Each unit of engineering work should make subsequent units of work easier—not harder.**

## Auto-Invoke

<auto_invoke> <trigger_phrases> - "that worked" - "it's fixed" - "working now" - "problem solved" </trigger_phrases>

<manual_override> Use /soloship:learn [context] to document immediately without waiting for auto-detection. </manual_override> </auto_invoke>

## Optional Enhancement

Before saving, you can optionally dispatch a general-purpose subagent to enrich
or sanity-check the doc — using one of Soloship's shared rubrics as the lens:

- Industry best-practices enrichment → `references/agents/best-practices-researcher.md`
- Framework/library doc links → `references/agents/framework-docs-researcher.md`
- Security review of the solution → `references/security-checklist.md`
- Performance review → `references/performance-checklist.md`
- Test-coverage suggestions → `references/testing-patterns.md`
- Minimalism / anti-pattern check → `references/code-review-axes.md`

These are optional polish, not required to complete the capture.

## Related Commands

- `/soloship:plan` - Planning workflow (references documented solutions)
