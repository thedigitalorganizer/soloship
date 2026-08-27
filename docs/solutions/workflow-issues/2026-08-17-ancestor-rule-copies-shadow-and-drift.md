---
title: Ancestor-level rule copies shadow each other and drift into contradiction
date: 2026-08-17
producer: soloship-learn
version: 1
ttl_days: 90
content_hash: e4399ea7016d
problem_type: pattern
category: workflow-issues
components: [rules, doctor, init, upgrade]
files: [src/rules.ts, src/doctor.ts]
tags: [rules, duplication, drift, context-tax, multi-level-install, shadowing]
---

# Ancestor-level rule copies shadow each other and drift into contradiction

## The Finding

Soloship has **no global installer** — `installRulesAt()` only ever writes to
`<cwd>/.claude/rules/`. Yet the 2026-08-13 harness audit found the same rule
files installed at three levels (`~/.claude/rules/`, the workspace root, the
project), because `soloship init`/`upgrade` had been run with cwd at each level
over time. Claude Code auto-loads ALL levels, so sessions paid ~45K tokens for
~19 rules' worth of content — and worse, the copies had **drifted**:

- The workspace copy of `deploy-from-main-only` lacked the SHA-pinned `prod`
  tag language the project copy had — an agent loaded two contradictory deploy
  procedures in one session.
- The global copies of four rules (`solution-search`, `plan-lifecycle`,
  `plan-rationale`, `parameterize-constants`) were older, longer pre-Soloship
  variants — different length, different wording, same filename.
- `upgrade --force` refreshes only the cwd level, so drift is *structural*:
  upgrading the project guarantees divergence from any ancestor copy.

## Solution

Treat multi-level installs as a detectable defect class, not a config choice:

1. One canonical install level per repo (the project).
2. `soloship doctor` gains a rule-stack report: walk ancestor directories,
   flag any rule filename present at more than one level, show content-hash
   drift. Advisory only — never auto-delete an ancestor copy, because it may
   be the only governance protecting a *different* descendant project.
3. Removal of retired templates is tombstone-by-byte-match only: delete a file
   only when byte-identical to a known old Soloship template; anything else is
   someone's customization — report it.

(Planned as Phase 4 of `docs/plans/2026-08-17-feat-v2-lean-harness-plan.md`;
the pattern is recorded now because the *diagnosis* is the reusable part.)

## Why This Works

The failure is silent because each level looks correct in isolation and no
tool ever reads them together. Making the *stack* visible (doctor report)
converts silent contradiction into a visible diff, and the byte-match rule
respects the ownership boundary from
`docs/solutions/integration-issues/upgrade-overwrote-customized-fitness-test-20260707.md`.

## Prevention

- Never run `soloship init` in a home or workspace ancestor of an existing
  Soloship project without checking for shadowing first.
- When auditing any agent-context problem, diff same-named rule files across
  levels before assuming the installed text is what sessions actually read.
