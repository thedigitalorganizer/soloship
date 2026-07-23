---
name: review
description: |
  Multi-perspective review for plans or code. For plans: routes to gstack's eng,
  CEO, or design plan review skills individually, or autoplan to run all four
  (CEO + design + eng + DX) in one auto-decided pass. For code: routes to code-review
  for PR-scale work (CE multi-agent parallel analysis with worktrees), or runs
  three inline passes (structural, adversarial, design slop lens) for quick local
  checks.
---

## Host Compatibility

If you are running this skill in Codex, read `../references/codex-compatibility.md` before following host-specific tool instructions. Claude Code should continue to use the Claude-specific tools and command wrappers described here.

# Soloship Review

Your job is to review work from multiple perspectives. First, determine what
you're reviewing.

## Determine Review Target

**Reviewing a PLAN:**
The user said something like "review this plan", "check the plan", or there's
a recent plan file in `docs/plans/` that hasn't been implemented yet.

**Reviewing CODE:**
The user said "review the code", "code review", "check my changes", or there
are uncommitted changes / recent commits to review.

---

## Plan Review

**Termination-condition precheck (all plan reviews):** Confirm the plan has a
`## Goal` and a `## Done-When (observable)` section and that the Done-When items
are genuinely observable, not "the code is written." The `plan-completeness-gate`
hook enforces that the sections *exist*; a review is where their *quality* is
judged. A plan whose done condition isn't observable has no mechanical stop — flag
it before running the deeper reviews below.

**Freshness check:** If the plan file has frontmatter with `date` and `ttl_days`,
check whether today exceeds date + ttl_days. If stale, warn:
"This plan is N days old (expires after M days). The codebase may have changed
since it was written." Do not block — warn and proceed.

Ask the user which reviews they want (or suggest based on plan scope):

### Engineering Review (recommended for all plans)
Invoke `eng-review`. It locks in the execution plan — architecture, data flow,
edge cases, test coverage, performance. Interactive, with opinionated recommendations.

### CEO/Strategy Review (for big decisions)
Invoke `ceo-review`. It rethinks the problem, challenges premises, asks
whether the scope is right. Use when the plan involves significant product decisions.

### Design Review (for UI-heavy plans)
Invoke `plan-design-review`. It rates design dimensions 0-10, explains what would
make each a 10, and fixes the plan. Use when the plan has frontend/UX components.

### All Three (for major features)
Run them sequentially: eng review → design review → CEO review.
Present a summary after each, fix issues, then proceed to the next.

### All Four, auto-decided (the "just review it thoroughly" option)
Invoke `autoplan`. It reads the CEO, design, eng, and DX review skills from disk and runs them sequentially, making routine decisions automatically using 6 decision principles. Only close calls, borderline scope, and disagreements surface for your input at the end. One command instead of four. Use this when you want the full review pipeline and don't want to babysit each step.

---

## Code Review

Two paths depending on scope.

### Pre-merge PR review (the primary path)

Use this when reviewing a PR, a feature branch, or anything where you have commits on a branch that's about to land. Invoke `code-review` with the PR number, GitHub URL, or branch name as argument. CE's review runs a multi-agent parallel analysis with worktrees and language-specific review agents — it's the comprehensive "am I really ready to merge this?" check.

After `code-review` completes, also run the **Design Slop pass below** if the diff touched frontend files (`.tsx`, `.jsx`, `.css`, `.html`, `.scss`). This is the Soloship-specific lens CE doesn't have.

### Quick local check (the lightweight path)

Use this when there's no PR yet — you just want a sanity check on uncommitted work or recent local commits before pushing. Run the three inline passes below in parallel. Faster than `code-review` and doesn't need a branch that's been pushed.

---

### Pass 1: Structural Review
Launch an agent with this prompt:

```
Review the git diff for this branch (run: git diff main...HEAD or git diff --staged).
Check for:
1. SQL safety (migrations, raw queries)
2. Auth/authz gaps (new endpoints without protection)
3. Error handling (external calls without try-catch)
4. Type safety (new `any` types, missing return types)
5. Test coverage (new code without corresponding tests)
6. Breaking changes (modified exports, changed interfaces)

For each finding, state: file, line, issue, severity (critical/high/medium/low),
and recommended fix.
```

### Pass 2: Adversarial Review
Launch an agent with this prompt:

```
You are an adversarial reviewer. Your job is to find ways this code will break
in production. Read the git diff (git diff main...HEAD or git diff --staged).

Think about:
1. What happens under load? Race conditions? Timeouts?
2. What happens with bad input? Null, undefined, empty strings, huge payloads?
3. What happens when external services fail? Network errors? Rate limits?
4. What state transitions are possible that the code doesn't handle?
5. What assumptions does this code make that could be wrong?

Be specific. Name the file, the line, and the exact scenario that breaks it.
```

### Pass 3: Design Slop Lens (if frontend files changed)
Only run if the diff includes `.tsx`, `.jsx`, `.css`, `.html`, or `.scss` files. This is the same pass you run after `code-review` for PR-scale work.
Launch an agent with this prompt:

```
Review the frontend changes in the git diff for design quality:
1. Accessibility: proper ARIA labels, keyboard navigation, focus management
2. Responsive: does this work on mobile?
3. AI Slop Detection: generic gradients, stock illustrations, default shadows,
   overly rounded corners, generic placeholder copy
4. Consistency: does this match the existing design system?
5. Loading/error states: are they handled?
6. Component duplication: does this diff add a component that duplicates an
   inventoried one?
```

<!-- concern:component-reuse -->
If `docs/architecture/COMPONENTS.md` exists, read it before creating or
specifying UI components — reuse or extend an existing component on purpose
match, cite what you found, and apply the rule of three (see
`references/component-inventory.md`). For item 6, hand the agent the
inventory so "duplicates an inventoried one" is checked against data, not
memory.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "The changes are small, a quick skim is fine" | Small changes cause big outages. A one-line auth bypass is a small change. Run all three passes. |
| "I wrote this code, I already know it's correct" | You're the worst reviewer of your own code. The adversarial pass exists specifically to find what you missed. |
| "The structural review found nothing, skip the adversarial pass" | Structural review checks what's there. Adversarial review checks what's missing — race conditions, edge cases, failure modes. Different lenses, both required. |
| "This is backend-only, skip the design-lite pass" | Skip it if no frontend files changed (that's the rule). But don't skip it because you assume the frontend is fine. Check the diff. |
| "I'll just flag everything as 'suggestion'" | Severity classification exists for a reason. If it's a security vulnerability, it's Critical — not a suggestion. See `references/code-review-axes.md`. |

**Review uses the 5-axis framework and severity classification from `references/code-review-axes.md`.**

---

### Synthesis

After all passes complete, present a unified review:

```
Code Review Summary:

Critical: [count]
High: [count]
Medium: [count]
Low: [count]

[List critical and high findings with file:line references]

[If no critical/high findings]: "No blockers found. Ready to ship."
[If critical findings]: "Critical issues must be fixed before shipping."
```

## Verification

The review is not complete until ALL of these are true:

- [ ] Review target identified (plan or code) and stated explicitly
- [ ] For code: all 3 passes ran (structural + adversarial + design-lite if frontend)
- [ ] For plans: at least engineering review ran
- [ ] Findings classified by severity (Critical / Important / Suggestion)
- [ ] Summary presented with counts per severity level
- [ ] Critical/Important findings include file:line references and recommended fixes
