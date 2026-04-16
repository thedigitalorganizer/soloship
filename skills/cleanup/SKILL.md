---
name: cleanup
description: |
  Knowledge system maintenance: deduplicate solutions, prune stale references,
  enforce plan lifecycle, fix AGENTS.md drift, rebuild learnings index.
  The garbage collector, linker, and index rebuilder for a project's knowledge base.
  Use periodically or when docs/solutions/ has grown since the last cleanup.
---

# Soloship Cleanup

Your job is to maintain the knowledge system that `/learn`, `/audit`, and `/bootstrap`
create. Over time, solution docs accumulate duplicates, stale file references, and
missing cross-links. Plans pile up after implementation. AGENTS.md files reference
deleted directories. learnings.jsonl falls out of sync. You fix all of that.

**IMPORTANT:** This is a 3-phase process: AUDIT → PROPOSE → EXECUTE.
Never execute changes without user approval. Never skip the audit.

---

## Subcommand Routing

Parse input after `/cleanup`:

| Input | Behavior |
|-------|----------|
| `/cleanup` or `/cleanup all` | Full audit, all proposals |
| `/cleanup solutions` | Only solution actions (merge, prune, cross-ref) |
| `/cleanup plans` | Only plan lifecycle actions |
| `/cleanup agents` | Only AGENTS.md actions |
| `/cleanup learnings` | Only learnings + README rebuild |
| `/cleanup report` | Dry run — audit report only, no changes |

**The audit always runs in full** regardless of subcommand — checks are interdependent
(a stale solution affects learnings, cross-refs, and AGENTS.md). Subcommands control
what is *proposed and executed*, not what is *audited*.

---

## Phase 1: AUDIT (Parallel Agents, Read-Only)

Launch these 5 agents **in parallel** using the Agent tool. All read-only. Each
returns structured findings.

### Agent 1: Solution Health Scanner

```
Prompt: You are auditing the health of solution docs in this project. Read-only —
do not modify any files.

Do the following:
1. Find all files in docs/solutions/**/*.md
2. For each, parse YAML frontmatter
3. For each solution with a `files:` field, check which referenced files still exist
   in the codebase (use Glob). Calculate the percentage of dead references.
4. For each solution with a `components:` field, grep the codebase for those component
   names. Flag components that appear in zero source files.
5. Check each solution for these required frontmatter fields:
   components, files, root_cause, resolution, tags
   Flag solutions missing 2+ of these fields as "incomplete"
6. Flag solutions where >50% of file references are dead as "stale candidates"

Return your findings as JSON:
{
  "stale": [{"path": "...", "deadRefPercent": N, "deadFiles": [...], "totalFiles": N}],
  "incomplete": [{"path": "...", "missingFields": [...]}],
  "healthy": N,
  "total": N
}
```

### Agent 2: Solution Overlap Detector

```
Prompt: You are detecting overlapping solution docs. Read-only — do not modify files.

Do the following:
1. Read all docs/solutions/**/*.md files and parse their frontmatter
2. Build a component-to-solutions map (which solutions share the same components)
3. Build a tag overlap index (pairs of solutions sharing 3+ tags)
4. Extract `root_cause` text from each solution. For each pair of solutions, check
   for shared key phrases using literal substring matching (3+ word phrases that
   appear in both). Do NOT use AI judgment — only literal text overlap.
5. A merge candidate requires 2-of-3 signals:
   - Component overlap (share 2+ components)
   - Tag overlap (share 3+ tags)
   - Root cause phrase match (share a 3+ word phrase in root_cause)
   Only propose merges when at least 2 of these 3 signals are present.

Return your findings as JSON:
{
  "mergeGroups": [
    {
      "solutions": ["path1", "path2"],
      "signals": {
        "sharedComponents": [...],
        "sharedTags": [...],
        "sharedRootCausePhrases": [...]
      },
      "proposedTitle": "Suggested merged title"
    }
  ]
}
```

### Agent 3: Plan Lifecycle Scanner

```
Prompt: You are auditing plan files against plan-lifecycle rules. Read-only.

The rules:
- Small plans (single phase, <3 tasks, <5 files, no key decisions) → delete after commit
- Large plans (multiple phases, 3+ tasks, 5+ files, key decisions, multi-session) → archive
- When in doubt, archive

Do the following:
1. List all files in docs/plans/ (excluding docs/plans/archive/)
2. For each plan file:
   a. Read the plan and count: phases, tasks, files referenced, Key Decisions section
   b. Check git log for commits that reference this plan's filename or its tasks
   c. Classify status: completed (all tasks have matching commits), partially completed,
      not started (no matching commits), stale (has ttl_days and it has expired)
   d. Size it: small or large per the rules above
   e. Assign action: delete (small + completed), archive (large + completed),
      keep (not completed), flag (stale)
3. If no docs/plans/ directory exists, report "no plans directory"

Return your findings as JSON:
{
  "plans": [
    {
      "path": "...",
      "status": "completed|partial|not_started|stale",
      "size": "small|large",
      "action": "delete|archive|keep|flag",
      "evidence": "commit hashes or reason",
      "phases": N,
      "tasks": N,
      "filesReferenced": N,
      "hasKeyDecisions": true/false
    }
  ]
}
```

### Agent 4: AGENTS.md Auditor

```
Prompt: You are auditing AGENTS.md files for staleness and coverage gaps. Read-only.

Do the following:
1. Find all AGENTS.md files in the project
2. For each AGENTS.md:
   a. Read it and extract all file/directory references
   b. Check which referenced files/directories still exist (use Glob)
   c. Check contract references — if it says "exports X", grep for X in the directory
   d. Flag stale references (files/dirs that no longer exist)
3. Find source directories with 3+ source files that lack AGENTS.md
   (exclude: node_modules, dist, build, .git, test-only dirs, config-only dirs)
4. Check parent-child consistency: if a parent AGENTS.md lists a subdirectory,
   verify that subdirectory still exists

Return your findings as JSON:
{
  "stale": [{"path": "AGENTS.md path", "deadReferences": [...]}],
  "missing": [{"directory": "...", "sourceFileCount": N}],
  "healthy": N,
  "total": N
}
```

### Agent 5: Index Sync Checker

```
Prompt: You are checking whether the knowledge indexes are in sync with solution docs.
Read-only.

Do the following:
1. If .ai/learnings.jsonl exists, read it and parse each line as JSON
2. Cross-reference each entry's `solution` path against actual files in docs/solutions/
   - Flag entries whose solution file no longer exists (orphaned learnings)
3. List solution docs that have NO corresponding learnings.jsonl entry (missing entries)
4. If docs/solutions/README.md exists, check whether its hotspot analysis and
   category counts still match the current solution set
5. Count current solutions per category for comparison

Return your findings as JSON:
{
  "orphanedLearnings": [{"key": "...", "solutionPath": "..."}],
  "missingSolutions": ["path1", "path2"],
  "learningsCount": N,
  "solutionsCount": N,
  "readmeExists": true/false,
  "readmeStale": true/false,
  "currentHotspots": {"category1": N, "category2": N}
}
```

---

## Comprehension Checkpoint

After all 5 agents complete, present a summary table to the user:

```
## Cleanup Audit Results

| Area | Healthy | Issues | Action Items |
|------|---------|--------|--------------|
| Solutions | N healthy | N stale, N incomplete | N merges, N stale-marks |
| Plans | N active | N completed pending cleanup | N deletes, N archives |
| AGENTS.md | N healthy | N stale, N missing | N fixes, N creates |
| Learnings | N indexed | N orphaned, N missing | Rebuild needed: yes/no |

### Merge Candidates
[List each group with shared evidence]

### Stale Solutions
[List with dead reference counts]

### Plan Cleanup
[List with completion evidence and proposed action]

### AGENTS.md Actions
[Stale refs to fix, new files to create]

### Cross-reference Gaps
[Solution pairs that should link to each other but don't]

### Index Status
[learnings.jsonl gap: N solutions, M entries]
```

If subcommand was `/cleanup report`, STOP HERE. Present the audit and done.

---

## Phase 2: PROPOSE (Interactive)

Present findings grouped by action type, filtered to the subcommand scope.
For each group, ask the user: **approve all, approve individually, or skip.**

Present in this order (highest-impact first):

1. **Merge candidates** — Show groups, shared evidence, proposed merged title
2. **Stale solutions** — Show dead reference counts, recommend stale-mark or delete
3. **Plan cleanup** — Show plans with completion evidence, proposed action (delete/archive)
4. **AGENTS.md fixes** — Stale references to remove, new files to create
5. **Cross-reference wiring** — Solution pairs that should have `related_solutions` links
6. **Learnings rebuild** — Show the gap (N solutions, M entries), confirm full rebuild

Wait for user approval on each group before proceeding.

---

## Phase 3: EXECUTE (Approved Changes Only)

Execute in dependency order. **Each merge is dispatched as an independent subagent** —
the subagent reads only the 2-3 source solutions, writes the merged doc, and returns.
The main agent never holds all source content simultaneously.

### Execution Order

1. **Merge solutions** — dispatch one Agent per merge group:
   ```
   Prompt: You are merging N solution docs into one consolidated solution.

   Read these source files: [list paths]

   Write a merged solution doc to [target path] using this structure:

   Frontmatter rules:
   - tags: union of all originals
   - components: union of all originals
   - symptoms: union of all originals (if present)
   - aliases: titles of all merged-from docs (for grep discoverability)
   - merged_from: list of original file paths (audit trail)
   - date: today's date
   - root_cause: synthesized single sentence
   - producer: soloship-cleanup
   - version: 1
   - ttl_days: 90

   Body structure:
   ## Problem
   [Unified description of the anti-pattern, all known manifestations]

   ## Instances
   ### Instance 1: [original title]
   [Condensed 2-3 paragraph version of original problem/investigation]
   ### Instance 2: [original title]
   [Same treatment]

   ## Root Cause
   [Synthesized shared root cause analysis]

   ## Solution
   [Canonical fix. Note where specific implementations diverge.]

   ## Prevention
   [Union of all prevention strategies, deduplicated]

   ## Related
   [Links + "Merged from: [list of original paths, recoverable via git history]"]

   IMPORTANT: Preserve ALL information from the originals. Condense, don't discard.
   ```
   After each subagent returns, `git rm` the original source files.

2. **Mark stale solutions** — add `status: stale` to frontmatter (don't delete unless
   user explicitly approved deletion)

3. **Wire cross-references** — add `related_solutions` to frontmatter, bidirectional
   (if A links B, B must also link A)

4. **Fix incomplete frontmatter** — add missing fields where inferable from the body

5. **Clean plans** — `git rm` (small + completed) or `git mv` to `docs/plans/archive/`
   (large + completed). Create archive directory if needed.

6. **Update stale AGENTS.md** — remove dead references, update contracts

7. **Create missing AGENTS.md** — for directories above the 3-file threshold, use the
   `/learn` Step 5 skeleton (Scope, Contracts, Key Files, Pitfalls). Infer from actual
   directory contents — do not generate stubs.

8. **Rebuild learnings.jsonl** — full regeneration from current solution set.
   For each solution doc (excluding `status: stale`), generate:
   ```json
   {"date":"YYYY-MM-DD","key":"SHORT_KEY","type":"TYPE","insight":"ONE_LINE","solution":"PATH","components":["COMP1"]}
   ```
   Overwrite `.ai/learnings.jsonl` with the new index.

9. **Regenerate README.md** — recompute `docs/solutions/README.md` hotspot analysis
   and pattern library from current solution set.

10. **Write cleanup report** — `docs/audit/cleanup-YYYY-MM-DD.md` with this structure:
    ```yaml
    ---
    date: YYYY-MM-DD
    producer: soloship-cleanup
    version: 1
    ttl_days: 90
    ---
    ```
    ```markdown
    # Cleanup Report — YYYY-MM-DD

    ## Summary
    | Metric | Before | After |
    |--------|--------|-------|
    | Solutions | N | N |
    | Solutions with related_solutions | N | N |
    | learnings.jsonl entries | N | N |
    | Plans pending cleanup | N | N |
    | AGENTS.md coverage | N% | N% |
    | Stale solutions (>50% dead refs) | N | N |

    ## Actions Taken
    ### Merged
    ### Pruned
    ### Plans Cleaned
    ### AGENTS.md Updated/Created
    ### Cross-references Wired
    ### Learnings Rebuilt
    ```

11. **Single atomic commit** — all changes in one commit:
    `chore(knowledge): cleanup — N merges, N stale-marks, N plan actions`

---

## What /cleanup Does NOT Do

- **Full AGENTS.md greenfield setup** with SME interviews and token analysis — that's
  `/bootstrap` or the intent-layer skill
- **Complete AGENTS.md rewrites** — too risky, could destroy existing knowledge.
  Cleanup fixes stale refs and creates missing files, never rewrites.
- **Solution creation** — that's `/learn`. Cleanup maintains what `/learn` creates.
- **Architectural assessment** — that's `/audit`. Cleanup assesses the knowledge
  *about* the codebase, not the codebase itself.

---

## Relationship to Other Skills

| Skill | Creates | /cleanup Maintains |
|-------|---------|-------------------|
| `/learn` | Solution docs, learnings.jsonl entries, AGENTS.md pitfalls | Dedup solutions, rebuild index, fix AGENTS.md drift |
| `/audit` | Audit reports, findings JSON | Not maintained by cleanup (separate lifecycle) |
| `/bootstrap` | Initial AGENTS.md, CLAUDE.md, governance | AGENTS.md staleness + coverage gaps |
| `/shipthorough` | Per-incident plan cleanup | Catches plans that were missed |
| `solution-search` rule | N/A (consumer) | Accurate frontmatter so searches return good results |
| `plan-lifecycle` rule | N/A (policy) | Retroactive enforcement of archive/delete policy |

---

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "The knowledge base is small, it doesn't need cleanup" | Small bases still accumulate stale refs and missing cross-links. The audit takes 2 minutes. Run it. |
| "I'll just merge these solutions manually without the subagent" | Holding 3+ solution docs in main context degrades rewrite quality. The subagent pattern exists to prevent this. Use it. |
| "These solutions are similar but not really duplicates" | That's why the 2-of-3 signal threshold exists. If 2+ signals align, they're merge candidates. Present them to the user — they decide. |
| "I can skip the audit and just fix what I know is broken" | You don't know what's broken until you audit. Stale AGENTS.md references hide behind healthy-looking files. Run all 5 agents. |
| "The user approved everything, I can batch the commit" | You should batch the commit — that's correct. But each merge still gets its own subagent. Batching the commit ≠ batching the content. |
| "This plan is probably completed but I can't find the commit" | "Probably" is not evidence. If git log doesn't show implementation commits, the plan stays as "keep" not "delete". |
| "I'll skip the learnings rebuild, it's just an index" | The index is how future agents find solutions quickly. 13 entries for 75 solutions means most solutions are invisible. Rebuild it. |
| "Cross-references aren't that important" | Cross-refs are how agents discover related solutions they didn't search for directly. Missing links = missed prevention strategies. Wire them. |

---

## Verification

Cleanup is not complete until ALL of these are true:

- [ ] All 5 audit agents ran (no agents skipped)
- [ ] Audit summary was presented to the user
- [ ] User approved or rejected each proposal group
- [ ] Only approved changes were executed
- [ ] Merged solutions use the correct body structure (Problem, Instances, Root Cause, Solution, Prevention, Related)
- [ ] Merged solution frontmatter includes `aliases` and `merged_from` fields
- [ ] Stale solutions have `status: stale` in frontmatter (not deleted unless user approved deletion)
- [ ] Cross-references are bidirectional (A→B and B→A)
- [ ] Plan cleanup follows plan-lifecycle rules (small=delete, large=archive)
- [ ] learnings.jsonl was rebuilt excluding `status: stale` solutions
- [ ] Cleanup report written to `docs/audit/cleanup-YYYY-MM-DD.md` with before/after metrics
- [ ] All changes in a single atomic commit
