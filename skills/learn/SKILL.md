---
name: learn
description: |
  Capture knowledge from non-obvious work. Creates a solution doc via
  CE:workflows:compound, then audits the architecture registry for drift,
  propagates new pitfalls into AGENTS.md files, and creates missing AGENTS.md
  for directories that have grown past the governance threshold.
  Cherry-picks the learnings.jsonl persistence pattern for quick cross-session search.
---

# Soloship Learn

Your job is to capture what was learned from non-obvious work so future sessions
don't have to re-investigate.

## Step 1: Capture Solution Doc

Invoke `compound-engineering:workflows:compound`. It guides you through documenting:
- What problem was solved
- What was the root cause
- What prevention strategies apply

The output goes to `docs/solutions/<category>/` with proper frontmatter. Ensure
the frontmatter includes artifact contract fields:
```yaml
---
title: Short descriptive title
date: YYYY-MM-DD
producer: soloship-learn
version: 1
ttl_days: 90
category: one-of-the-categories
components: [list, of, affected, components]
files: [list, of, key, files]
symptoms: [what, the, user, sees]
error_messages: [exact, error, strings]
tags: [searchable, keywords]
---
```

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
- [ ] Frontmatter includes: title, date, category, components, symptoms, tags
- [ ] JSONL entry appended to `.ai/learnings.jsonl` with key, type, insight, solution path
- [ ] Registry drift check completed (or registry confirmed absent)
- [ ] AGENTS.md files updated for all affected directories where new knowledge applies (or "not transferable" noted)
- [ ] AGENTS.md created for any touched directories with 3+ source files and no existing file (or skipped with reason noted)
