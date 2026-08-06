---
name: cleanup
description: |
  Knowledge system maintenance: deduplicate solutions, prune stale references,
  enforce plan lifecycle, fix AGENTS.md drift, repair the learnings index.
  The garbage collector, linker, and index rebuilder for a project's knowledge base.
  Use periodically or when docs/solutions/ has grown since the last cleanup.
---

## Host Compatibility

If you are running this skill in Codex, read `../references/codex-compatibility.md` before following host-specific tool instructions. Claude Code should continue to use the Claude-specific tools and command wrappers described here.

# Soloship Cleanup

Your job is to maintain the knowledge system that `/learn`, `/audit`, and `/bootstrap`
create. Over time, solution docs accumulate duplicates, stale file references, and
missing cross-links. Plans pile up after implementation. AGENTS.md files reference
deleted directories. learnings.jsonl falls out of sync. You fix all of that.

This is a 3-phase process: AUDIT → PROPOSE → EXECUTE.
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

Launch these 6 agents **in parallel** using the Agent tool. All read-only. Each
returns structured findings.

<!-- concern:delegation-discipline -->
This skill's mandated dispatches are the ceiling, not the floor — run the
dispatches it names, and do not add discretionary subagents on top (no extra
verification or review dispatches, no splitting one modest task across
parallel workers); see `references/delegation-discipline.md`. The 6-agent set
above is that ceiling.

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
6. CANONICALITY — compute this for EVERY candidate doc. A doc is canonical if
   EITHER is true:
   a. It lives in `docs/solutions/patterns/`.
   b. Anything cites it BY PATH. Check mechanically — grep its basename across
      `CLAUDE.md`, every `AGENTS.md`, everything under `.claude/rules/`, and every
      other solution doc's `related_solutions:` list. Exclude the doc itself, and
      exclude copies living under worktree directories (`.worktrees/`,
      `.claude/worktrees/`) — those are other checkouts, not real referrers.
   Record `canonical`, `canonicalReason`, and the actual `inboundRefs` paths.
7. Collapse the pairwise candidates into CONNECTED COMPONENTS before returning.
   The detector emits edges; the real relationships are N-way. Two pairs sharing a
   member are one 3-way group, not two independent merges.

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
      "canonical": true|false,
      "canonicalDetail": [
        {"path": "...", "canonical": true|false,
         "canonicalReason": "in patterns/ | cited by path | not canonical",
         "inboundRefs": ["CLAUDE.md", "src/hooks/AGENTS.md", ...]}
      ],
      "proposedTitle": "Suggested merged title"
    }
  ]
}

A group is `canonical: true` if ANY member is canonical. Do NOT drop those groups
— return them flagged. The orchestrator decides what to do with them.
```

### Agent 3: Plan Lifecycle Scanner + Status Reconciler

```
Prompt: You are auditing plan files against plan-lifecycle rules AND reconciling
their frontmatter status against git evidence. Read-only — report proposed
fixes; the main session applies them.

The lifecycle rules:
- Small plans (single phase, <3 tasks, <5 files, no key decisions) → delete after commit
- Large plans (multiple phases, 3+ tasks, 5+ files, key decisions, multi-session) → archive
- When in doubt, archive

The status vocabulary (see the plan skill's Artifact Contract):
backlog | planned | in-progress | blocked | done | abandoned.
Legacy mapping: "Not started" → planned, "active" → in-progress,
"completed" → done.

Do the following:
1. List all files in docs/plans/ (excluding docs/plans/archive/)
2. For each plan file:
   a. Read the frontmatter: status, progress, updated, claimed_by, branch
   b. Read the plan and count: phases, tasks, files referenced, Key Decisions section
   c. Check git log for commits that reference this plan's filename or its tasks
   d. Derive evidence-status: completed (all tasks have matching commits),
      partial, not_started (no matching commits), stale (ttl_days expired —
      only meaningful for planned/in-progress; backlog/done/abandoned are
      exempt from freshness)
   e. RECONCILE: compare frontmatter status to the evidence.
      - Frontmatter disagrees with UNAMBIGUOUS evidence (e.g. says planned but
        every phase's commits are merged on the default branch; says
        in-progress but the branch is merged and deleted) → propose the exact
        frontmatter fix (new status/progress/updated values).
      - Evidence is AMBIGUOUS (squash merges, renamed plans, partial branches,
        work possibly living in an unmerged worktree) → flag it with the
        conflicting signals. NEVER guess.
   f. Size it: small or large per the rules above
   g. Assign action: delete (small + done), archive (large + done),
      keep (not done), flag (stale or ambiguous)
3. If no docs/plans/ directory exists, report "no plans directory"
4. MISFILED ARTIFACTS — any file in docs/plans/ with NO status frontmatter is,
   by definition, not a plan (the plan-namespace gate blocks these now, but
   older files predate it). Classify each by what it actually is and propose the
   move:
   - draft / design note / brainstorm / grill output → `docs/drafts/`
   - session handoff → `docs/handoffs/`
   - point-in-time report or snapshot → `docs/reports/`
   - decision log / ADR → `docs/architecture/decisions/`
   Do NOT invent a status for these to make them "valid" — they are not plans,
   and giving a morning report a `status:` field makes it worse, not better.
5. ORPHANED ARTIFACTS — the self-cleaning contracts failed if either of these
   is true. Propose deletion:
   - a draft in `docs/drafts/` whose plan already exists (check for a plan whose
     `promoted_from:` names it, or whose slug matches) — the plan superseded it
   - a handoff in `docs/handoffs/` whose plan is already `done` — a consumed
     handoff describes a world that no longer exists
   `docs/reports/` is never swept: a stale report is still a true record of its
   moment.

Return your findings as JSON:
{
  "plans": [
    {
      "path": "...",
      "frontmatterStatus": "...",
      "evidenceStatus": "completed|partial|not_started|stale",
      "reconcile": null | { "fix": {"status": "...", "progress": "...", "updated": "..."}, "evidence": "..." }
                        | { "flag": "why the evidence is ambiguous" },
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

**Applying reconciler results (main session, after the agents return):** apply
each proposed `fix` to the plan's frontmatter and report what changed; present
each `flag` to the user — never guess on ambiguous evidence. Also clear dead
claims: for each file in `<git-common-dir>/soloship/claims/`, if the claiming
session's heartbeat (`sessions/<session_id>.json` mtime) is older than the
`session_idle_min` threshold in `<git-common-dir>/soloship/config.json` (or
the session file is gone), delete the claim file and note it.

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

### Agent 6: Component Inventory Freshness

<!-- concern:component-reuse -->
If `docs/architecture/COMPONENTS.md` exists, read it before creating or
specifying UI components — reuse or extend an existing component on purpose
match, cite what you found, and apply the rule of three (see
`references/component-inventory.md`). This agent audits that inventory's
freshness — it never edits source code (consolidating duplicate components is
implementation work that routes through /soloship:plan → /soloship:implement).

```
Prompt: You are auditing the freshness of docs/architecture/COMPONENTS.md.
Read-only — do not modify any files.

If docs/architecture/COMPONENTS.md does not exist, return {"exists": false}.

Otherwise:
1. Parse the rows between <!-- soloship:components START --> and
   <!-- soloship:components END -->.
2. For each row, check the component's file still exists (Glob) and still
   exports a component of that name (grep).
3. Discover components in the codebase (git ls-files -- '*.tsx' '*.jsx'
   '*.vue' '*.svelte', skip tests/stories) that have NO inventory row.
4. Return your findings as JSON:
{
  "exists": true,
  "staleRows": [{"component": "...", "file": "...", "reason": "file gone|export gone"}],
  "missingComponents": [{"component": "...", "file": "..."}],
  "rowCount": N
}
```

If stale rows or missing components are found, Phase 2 proposes: "regenerate
the inventory via /soloship:component-inventory (delta-update)". Never
propose consolidating components from here.

---

## Comprehension Checkpoint

After all 6 agents complete, present a summary table to the user:

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

### Canonical-Blocked (hard no-merge — cross-link instead)
[Groups where any member is in patterns/ or cited by path. Show the actual inbound
references that blocked each one. A silent rejection erodes trust in the audit —
the user should see what was NOT proposed and why.]

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

If subcommand was `/cleanup report`, stop here — present the audit and you're done.

---

## Phase 2: PROPOSE (Interactive)

Present findings grouped by action type, filtered to the subcommand scope.
For each group, ask the user: **approve all, approve individually, or skip.**

Present in this order (highest-impact first):

0. **Canonical-blocked groups (present BEFORE merges, never as merges).** Every
   group the detector returned with `canonical: true` is a **hard no-merge**.
   Merging it deletes live by-path references from CLAUDE.md, AGENTS.md, or
   `.claude/rules/` — this has really happened, more than once, and the dead links
   outlive the run that made them. Do not offer these as merges, do not offer a
   "merge and fix the links" variant. Propose the substitute: **wire
   `related_solutions:` bidirectionally** across the group. Show the user which
   groups were blocked and the actual inbound references that blocked them, so the
   rejection is visible rather than silent. See
   `docs/solutions/workflow-issues/cleanup-merge-protection-canonical-pattern-vs-incident-2026-05-19.md`
   in projects that carry it.

1. **Merge candidates** — ONLY groups with `canonical: false`. Show groups, shared
   evidence, proposed merged title
2. **Stale solutions** — Show dead reference counts, recommend stale-mark or delete
3. **Plan cleanup** — Show plans with completion evidence, proposed action (delete/archive)
4. **AGENTS.md fixes** — Stale references to remove, new files to create
5. **Cross-reference wiring** — Solution pairs that should have `related_solutions` links
6. **Learnings rebuild** — Show the gap (N solutions, M entries), confirm full rebuild

Wait for user approval on each group before proceeding.

---

## Phase 3: EXECUTE (Approved Changes Only)

**Context hygiene rule:** Any step that requires reading 3+ solution/AGENTS.md bodies
must be dispatched to a subagent. The main agent orchestrates and commits; subagents
read and write.

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

   Preserve all information from the originals. Condense, don't discard.
   ```
   After each subagent returns, `git rm` the original source files.

1b. **Rewrite every inbound referrer — same step, not a follow-up.** A merge renames
   a doc. Everything that cited the old filename is now broken, and nothing else in
   this skill will notice. This is the single most common way `/cleanup` damages a
   knowledge base: a later audit finds the dead links and cannot tell they were
   self-inflicted.

   For each merged group, before moving on:
   ```bash
   # Find every referrer of each retired filename. Exclude worktree copies.
   git grep -l -F "<old-basename>" -- CLAUDE.md '*AGENTS.md' '.claude/*' 'docs/*' \
     | grep -v '/worktrees/'
   ```
   Rewrite each hit to the merged doc's path. Where the citing prose describes what
   the old doc said, read the merged doc and confirm the sentence still reads true —
   a merged doc is a superset, so usually it does, but say so only after checking.

   Then VERIFY, and report the result: re-grep every retired basename across those
   same paths and confirm **zero** hits remain. A merge is not complete until that
   grep is empty. If a referrer cannot be rewritten correctly, revert that merge
   rather than leaving a dead link.

2. **Mark stale solutions** — add `status: stale` to frontmatter (don't delete unless
   user explicitly approved deletion)

3. **Wire cross-references** — add `related_solutions` to frontmatter, bidirectional
   (if A links B, B must also link A)

4. **Fix incomplete frontmatter** — dispatch one subagent per batch of ~5 solutions.
   The subagent reads each solution body, infers missing frontmatter fields, and writes
   corrected frontmatter. The main agent never reads solution bodies for this step —
   it only provides the list of incomplete solution paths to each subagent.
   ```
   Prompt: You are normalizing frontmatter for solution docs. For each file, read the
   body and infer any missing required fields (components, files, root_cause, resolution,
   tags). Write the corrected frontmatter back. Do not modify the body.

   Files to fix: [list of ~5 paths with their missing fields]
   ```

5. **Clean plans** — `git rm` (small + completed) or `git mv` to `docs/plans/archive/`
   (large + completed). Create archive directory if needed.

6. **Update stale AGENTS.md** — dispatch one subagent per AGENTS.md file to update.
   The subagent reads the directory contents and existing AGENTS.md, removes dead
   references, and updates contracts. The main agent provides the file path and the
   list of dead refs to remove.
   ```
   Prompt: You are updating an AGENTS.md file to remove stale references and fix
   contracts.

   File: [AGENTS.md path]
   Dead references to remove: [list from audit]

   Read the AGENTS.md and the directory it governs. Remove the dead references,
   update any contracts that reference deleted files, and verify remaining refs
   are still accurate. Write the corrected file.
   ```

7. **Create missing AGENTS.md** — dispatch one subagent per directory that needs a new
   AGENTS.md. The subagent reads the directory contents and writes a new file using
   the `/learn` Step 5 skeleton (Scope, Contracts, Key Files, Pitfalls). The main
   agent provides the directory path and source file count. Do not generate stubs —
   infer from actual directory contents.
   ```
   Prompt: You are creating an AGENTS.md file for a directory that has grown past
   the governance threshold.

   Directory: [path]
   Source file count: [N]

   Read all source files in the directory. Write an AGENTS.md using this skeleton:
   - Scope: what this directory owns
   - Contracts: what it exports/exposes
   - Key Files: important files and their roles
   - Pitfalls: non-obvious gotchas inferred from the code
   ```

8. **Repair learnings.jsonl — SURGICALLY. Never regenerate it wholesale.**

   One doc legitimately carries SEVERAL entries: distinct insights filed against the
   same solution over time. A one-entry-per-doc regeneration silently deletes every
   one of those extras. On a 2026-08-06 MAPS run the file held 341 entries across 313
   distinct paths — a wholesale rebuild would have destroyed 28 real insights, and
   nothing downstream would have reported the loss.

   Dispatch a subagent to make only these changes, preserving every other line
   byte-for-byte:
   ```
   Prompt: You are SURGICALLY repairing .ai/learnings.jsonl. Do NOT regenerate it.
   Multiple entries per solution are INTENTIONAL — preserve them.

   Entries whose `solution` path is dead: [list, with the correct path where the
     doc merely moved or was archived]
   Solution docs with no entry at all: [list — add one entry each, reading the doc
     to write an accurate insight]
   Paths to EXCLUDE (stale): [list]

   Entry schema, matching existing lines exactly:
   {"date":"YYYY-MM-DD","key":"SHORT_KEY","type":"TYPE","insight":"ONE_LINE","solution":"PATH","components":["COMP1"]}

   VERIFY: every line parses as JSON, every `key` is unique, every `solution` path
   resolves. Report the before/after line count and the exact diff.
   ```
   An entry pointing at a real non-solution file (an AGENTS.md, an archived plan) is
   NOT necessarily junk — it may be a real insight whose doc was never written.
   Repoint it if the target moved; do not delete it to make the index tidy.

9. **Regenerate README.md** — dispatch a single subagent that reads current solution
   frontmatter and regenerates `docs/solutions/README.md` hotspot analysis and
   category counts. The main agent provides the list of solution paths.
   ```
   Prompt: You are regenerating the solutions README from current solution metadata.

   Solution paths: [list of paths]

   Read the frontmatter of each solution. Recompute:
   - Hotspot analysis (which components/areas have the most solutions)
   - Category counts
   - Pattern library summary

   Write the result to docs/solutions/README.md.
   ```

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
    | `related_solutions` links — total / dead | N / N | N / 0 |
    | AGENTS.md dead references | N | 0 |
    | Merge groups refused as canonical (cross-linked instead) | — | N |

    ## Actions Taken
    ### Merged
    ### Pruned
    ### Plans Cleaned
    ### AGENTS.md Updated/Created
    ### Cross-references Wired
    ### Canonical-Blocked (merges refused, cross-linked instead)
    ### Learnings Repaired
    ```

11. **Single atomic commit** — all changes in one commit:
    `chore(knowledge): cleanup — N merges, N cross-link groups, N stale-marks, N plan actions`

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

## Common misreads

- "The knowledge base is small / I'll just fix what I know is broken" → you don't know what's broken until you audit, and stale AGENTS.md references hide behind healthy-looking files. The audit takes 2 minutes — run all the agents.
- "I'll merge these solutions (or normalize frontmatter) inline without the subagent" → holding several solution bodies in main context degrades rewrite and orchestration quality. The subagent pattern exists to prevent this — use it.
- "These solutions are similar but not really duplicates" → that's why the 2-of-3 signal threshold exists. If 2+ signals align, they're merge candidates — present them to the user, who decides.
- "The user approved the merges, so the canonical block doesn't apply" → it does. The approval was given before the canonicality check ran, on incomplete information. A canonical group is a hard no-merge regardless of approval; go back to the user with what the check found and propose cross-linking. On a 2026-08-06 MAPS run, all 13 approved groups turned out to be canonical — merging them would have deleted 24+ live governance references.
- "I'll merge and then fix the links afterward" → "afterward" is where this always fails. The referrer rewrite is step 1b, in the same breath as the merge, with a verifying grep. If you cannot rewrite a referrer correctly, revert the merge.
- "Only `patterns/` docs are protected" → no. A doc cited by path from CLAUDE.md, any AGENTS.md, or `.claude/rules/` is equally protected wherever it lives. Most protected docs are NOT in `patterns/`.
- "The user approved everything, I can batch the commit" → batching the commit is correct, but each merge still gets its own subagent. Batching the commit is not batching the content.
- "This plan is probably completed but I can't find the commit" → "probably" is not evidence. If git log doesn't show implementation commits, the plan stays "keep", not "delete".
- "I'll skip the learnings rebuild / cross-references aren't that important" → the index and cross-links are how future agents find solutions they didn't search for directly. Unindexed, unlinked solutions are invisible.

---

## Verification

Cleanup is not complete until ALL of these are true:

- [ ] All 6 audit agents ran (no agents skipped)
- [ ] Canonicality was computed for every merge candidate, and canonical groups were presented as cross-links rather than merges
- [ ] For every merge that DID run, the retired basenames return zero hits from `git grep` across CLAUDE.md / AGENTS.md / `.claude/rules/` / docs — verified, not assumed
- [ ] learnings.jsonl was repaired surgically; multi-entry docs still have all their entries (before/after line count reported)
- [ ] Audit summary was presented to the user
- [ ] User approved or rejected each proposal group
- [ ] Only approved changes were executed
- [ ] Merged solutions use the correct body structure (Problem, Instances, Root Cause, Solution, Prevention, Related)
- [ ] Merged solution frontmatter includes `aliases` and `merged_from` fields
- [ ] Stale solutions have `status: stale` in frontmatter (not deleted unless user approved deletion)
- [ ] Cross-references are bidirectional (A→B and B→A)
- [ ] Plan cleanup follows plan-lifecycle rules (small=delete, large=archive)
- [ ] learnings.jsonl repair excluded `status: stale` solutions
- [ ] Cleanup report written to `docs/audit/cleanup-YYYY-MM-DD.md` with before/after metrics
- [ ] All changes in a single atomic commit
