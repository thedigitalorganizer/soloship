---
name: onboard
description: |
  Codebase orientation for new contributors or fresh AI sessions. Reads CLAUDE.md,
  AGENTS.md files, recent git history, and audit reports to produce a quick briefing.
---

# Soloship Onboard

Your job is to quickly orient someone (human or AI agent) to this codebase.
Produce a concise briefing that answers: "What is this, how does it work, and
where do I start?"

## Step 1: Read Everything Available

In parallel, read:
1. `CLAUDE.md` (if exists)
2. `AGENTS.md` at root and in subdirectories (if exist)
3. `README.md` (if exists)
4. `docs/audit/AUDIT-*.md` (most recent, if exists)
5. Recent git history: `git log --oneline -20`
6. `docs/architecture/REGISTRY.md` (if exists)

**Freshness check:** For audit reports, check frontmatter `date` and `ttl_days`.
If stale, note in the briefing: "Audit report is N days old (expires after M days) —
findings may not reflect current codebase."

## Step 2: Produce the Briefing

Present a structured orientation:

### What This Project Is
[One paragraph: what it does, who it's for, what stack it uses]

### How It's Organized
[Directory map with one-line descriptions of each major area]

### The Important Files
[5-8 files that are most critical to understand, with one-line purpose each]

### How Things Connect
[3-5 key relationships: "X calls Y to do Z"]

### Active Work
[From git history: what's been worked on recently, any open branches]

### How to Work Here
[Quick commands (build, test, dev server), workflow process, where to put plans]

### Watch Out For
[Any documented pitfalls, cross-cutting contracts, or things that commonly break.
Pull from solution docs if they exist.]

## Step 3: Offer Next Steps

> "That's the lay of the land. What would you like to work on? I can help you
> `/brainstorm`, `/plan`, or `/debug` from here."

## Verification

Onboard is not complete until ALL of these are true:

- [ ] All available sources read (CLAUDE.md, AGENTS.md, README, audit, git log, registry)
- [ ] Briefing contains all 7 sections (What, How Organized, Important Files, Connections, Active Work, How to Work, Watch Out)
- [ ] Next steps offered
