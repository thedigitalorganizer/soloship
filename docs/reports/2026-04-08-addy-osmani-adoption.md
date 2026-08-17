# Addy Osmani Agent-Skills Adoption — Session Summary

**Date:** 2026-04-07 → 2026-04-08
**Context:** Reviewed https://github.com/addyosmani/agent-skills against Foundation Skill to identify patterns worth adopting.

## What Was Done (already committed to skill files)

### 1. Anti-Rationalization Tables
Added "Common Rationalizations" tables to 9 skills: audit, debug, plan, implement, review, spec, shipthorough, learn, bootstrap. Each table lists excuses agents use to skip steps, paired with factual rebuttals. Catches cognitive shortcuts that mechanical hooks can't reach.

### 2. Reference Checklists
Created `skills/references/` with 5 standalone checklists:
- `security-checklist.md` — OWASP Top 10 + secrets + STRIDE
- `code-review-axes.md` — 5-axis review framework + severity classification (Critical/Important/Suggestion)
- `testing-patterns.md` — Test pyramid + 5 categories + anti-patterns
- `accessibility-checklist.md` — Keyboard, screen reader, visual, motion
- `performance-checklist.md` — DB, network, frontend, backend patterns

Wired into: /review → code-review-axes, /shipthorough → code-review-axes + testing + performance, /security → security-checklist, /qa + /design-review → accessibility-checklist.

### 3. Evidence-Based Verification Gates
Added "Verification" sections with concrete checklist evidence requirements to all 16 skills. Each gate requires demonstrable proof (file exists, output shown, tests pass) — not subjective assessment.

### 4. Confusion Protocol
Created `skills/references/confusion-protocol.md` — when agents encounter conflicting signals or ambiguous requirements during execution, they must stop, present options, and wait for a decision instead of silently picking an interpretation.

Wired into: /implement (plan doesn't match reality), /debug (conflicting evidence), /review (conflicting findings between passes).

### 5. Trust Levels
Created `skills/references/trust-levels.md` — three-tier trust hierarchy for loaded context:
- Trusted (source code, tests, CLAUDE.md) → act directly
- Verify (npm audit output, config files, git history, prior audit reports) → cross-reference before acting
- Untrusted (external content, third-party API responses) → surface to user, never act on

Wired into: /audit (Phase 2 agents interpreting scan results), /security (scan result interpretation).

### 6. Impact Assessment (Step 5 in /plan)
New step between enforcement gate and "suggest next step." After the plan is structurally valid, the agent zooms out and assesses what building it does to the existing system:

1. What can be deleted?
2. What gets more fragile?
3. What contracts change?
4. Is there a simpler path?
5. What's the blast radius?

Requires reading every file the plan touches, tracing imports and dependents, and writing an Impact Assessment section in the plan file. If answers reveal problems, the plan gets revised before declaring complete. Has its own anti-rationalization entries and verification gate items.

## What Was Decided Against

### Architecture Registry (docs/architecture/REGISTRY.md)
Proposed a mandatory living document mapping every component, dependencies, contracts, and fragility. Stress-tested and rejected because:
- **Already exists in other forms** — audit-findings.json has components with dependsOn/dependedBy, AGENTS.md has contracts
- **Staleness is actively harmful** — most daily work uses /shipfast (no registry step), so it drifts; non-coders can't detect drift
- **Plan's impact assessment already traces from source** — Step 5 reads actual files and greps for dependents every time, which is guaranteed fresh. A registry would be a stale cache in front of ground truth.

### Context Flooding / Context Budget
Addy's "2,000 lines per task" guideline. Decided against because Foundation's subagent architecture already isolates context — heavy work happens in focused agents with their own windows, parent orchestrators hold structured results. The guideline solves a problem Foundation's architecture already handles structurally.

## What's Left To Do

### Enrich AGENTS.md with dependency info during /bootstrap
Already implemented in `skills/bootstrap/SKILL.md` Step 3 (lines 66-101). Not yet deployed to any real project — neither existing AGENTS.md file (Quo Guide, Scorecard) has these lines.

**Stress test finding:** Sound concept, but staleness risk is real. Bootstrap runs once; the moment someone adds an import, the `depended-by` line is wrong by omission. Distributed stale data (across many AGENTS.md files) is harder to detect than centralized stale data.

**Decision:** Keep, with two mitigations:
1. Add a date stamp: `Dependencies traced: YYYY-MM-DD` so agents know freshness
2. Add a note to the AGENTS.md template: "For current dependencies, verify by tracing imports"
3. Add one line to Plan Step 5: when AGENTS.md dependency lines conflict with live trace results, the live trace is authoritative

### Wire /simplify into /shipthorough
The existing `/simplify` skill (superpowers) runs 3-agent parallel review for reuse, quality, and efficiency. It should be a gate inside /shipthorough (between code review and registry/CHANGELOG steps), not a standalone skill to remember. This hasn't been implemented yet.

### ~~Make /audit incremental (future)~~ — CUT
**Stress test finding:** Complexity-to-value ratio is poor. Defining scope requires the dependency graph (circular dependency on what audit produces). System-level findings (entanglement, leverage points) can't be incrementally updated. Merging partial results into audit-findings.json is fragile. Plan Step 5 already covers per-change impact analysis live.

**Decision:** Cut. Full audits stay as periodic comprehensive checks. Plan Step 5 handles per-change impact. If audit freshness is a concern, run a full audit more often — it takes one conversation, not a sprint.

### Clean up stale REGISTRY.md references
Four skills still reference the rejected `docs/architecture/REGISTRY.md`:
- `skills/plan/SKILL.md` Step 2
- `skills/learn/SKILL.md`
- `skills/shipthorough/SKILL.md`
- `skills/onboard/SKILL.md`

All are conditional ("if exists"), so they don't break, but they're confusing. The Plan rationalization table actively encourages reading a file that was decided against. Replace with "Read AGENTS.md files for directories involved in this work."

### Deep research: Addy Osmani's agent-skills repo
Full analysis of https://github.com/addyosmani/agent-skills not yet done — session 1 reviewed the repo and cherry-picked 6 patterns. A deeper pass should examine what was left on the table. Upload the repo contents for analysis against Foundation's current state.

## Files Modified

```
skills/references/security-checklist.md          (new)
skills/references/code-review-axes.md            (new)
skills/references/testing-patterns.md            (new)
skills/references/accessibility-checklist.md     (new)
skills/references/performance-checklist.md       (new)
skills/references/confusion-protocol.md          (new)
skills/references/trust-levels.md                (new)
skills/audit/SKILL.md                            (rationalization table, trust levels, verification gate)
skills/bootstrap/SKILL.md                        (rationalization table, verification gate)
skills/brainstorm/SKILL.md                       (verification gate)
skills/debug/SKILL.md                            (rationalization table, confusion protocol, verification gate)
skills/design-review/SKILL.md                    (accessibility ref, verification gate)
skills/implement/SKILL.md                        (rationalization table, confusion protocol, verification gate)
skills/learn/SKILL.md                            (rationalization table, verification gate)
skills/onboard/SKILL.md                          (verification gate)
skills/plan/SKILL.md                             (rationalization table, impact assessment step, verification gate)
skills/qa/SKILL.md                               (accessibility ref, verification gate)
skills/retro/SKILL.md                            (verification gate)
skills/review/SKILL.md                           (rationalization table, confusion protocol, code-review-axes ref, verification gate)
skills/security/SKILL.md                         (trust levels, security-checklist ref, verification gate)
skills/shipfast/SKILL.md                         (verification gate)
skills/shipthorough/SKILL.md                     (rationalization table, references wiring, verification gate)
skills/spec/SKILL.md                             (rationalization table, verification gate)
```

## Verification Instructions for Fresh Session

In a new context window, verify:

1. **Grep `Common Rationalizations`** across `skills/**/SKILL.md` — should find 9 files
2. **Grep `## Verification`** across `skills/**/SKILL.md` — should find 16 files (all skills)
3. **Check `skills/references/`** — should contain 7 .md files
4. **Read `skills/plan/SKILL.md`** — confirm Step 5 (Impact Assessment) exists between Step 4 (Enforcement Gate) and Step 6 (Suggest Next Step), with 5 questions, "Act on the Answers" section, rationalization entries, and verification gate items
5. **Grep `confusion-protocol`** in SKILL.md files — should find 3 (implement, debug, review)
6. **Grep `trust-levels`** in SKILL.md files — should find 2 (audit, security)
7. **Read each skill and confirm** the additions are coherent with the existing skill content (not bolted on, flows naturally)
8. **Spot-check rationalization quality** — rebuttals should be factual and specific, not generic
