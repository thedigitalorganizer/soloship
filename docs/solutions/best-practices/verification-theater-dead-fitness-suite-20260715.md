---
title: A guardrail you can't watch fail is theater — make CI gates actually gate
date: 2026-07-15
producer: soloship-learn
version: 1
ttl_days: 90
content_hash: 9596e0dbd4b9
problem_type: best_practice
category: best-practices
components: [ci, architecture-fitness, test-tooling]
files: [.github/workflows/ci.yml, __arch__/fitness.test.ts, package.json]
tags: [ci, fitness-functions, verification-theater, vitest, evidence, guardrails, false-confidence]
---

## The Lesson

A verification mechanism that cannot be observed to fail provides **false
confidence, not safety**. Soloship's architecture fitness suite looked like a
guardrail but gated nothing:

- CI ran it as `npx vitest run __arch__/ 2>/dev/null || npx jest __arch__/ 2>/dev/null || true` — every failure was swallowed by `|| true` and hidden by `2>/dev/null`.
- `vitest` was not a dependency, so `npx vitest` would download-or-fail into the `|| true`.
- There was no `npm test` script.
- The suite's own "no source file exceeds 500 lines" rule was **already violated** (`hooks.ts` 1701 lines, `rules.ts` 807) and silently "passing".

The suite had existed for months reporting green while enforcing nothing. This
is the same failure class the live-data-evidence-gate fights: a claim ("the
architecture is checked") with no evidence behind it.

## Solution

1. **Make it able to fail.** Add the runner as a real dependency
   (`npm install -D vitest`), add a `"test": "vitest run __arch__/"` script, and
   change CI to `run: npm test` — no `|| true`, no `2>/dev/null`. Drift now fails
   the build.
2. **Fix the rule to fit reality, don't fake-pass it.** The 500-line rule was
   right in spirit but wrong for two files that are ~90% embedded string content
   (rule text in `rules.ts`, bash-script strings in `hooks.ts`). Splitting them
   is churn with no maintainability gain. So the rule keeps its teeth for genuine
   source and **explicitly exempts** the content-heavy files via a named constant
   — the check passes *truthfully*, not by suppression.
3. **Add guards that matter for this repo:** the installer ships exactly the
   expected rule set (no rule silently dropped), every rule has content, and the
   four version files stay in sync (mechanizes `release-version-sync`).
4. **Prove each guard fires.** For the version-sync guard: temporarily set one
   file to a wrong version, run the suite, confirm it fails with a message naming
   the offending file, then restore. A guard you haven't watched fail is back to
   being theater.

## Prevention

- Any CI step whose whole purpose is to catch drift must **not** end in
  `|| true` and must run a **real, installed** runner. If a step is allowed to
  fail silently, delete it — a green check that means nothing is worse than no
  check, because people trust it.
- When you add a fitness/guard test, immediately break the thing it guards and
  watch it go red. If you can't make it fail, it isn't guarding anything.
- Prefer exempting a legitimately-large content file by name (with a comment
  explaining why the metric doesn't apply) over either suppressing the whole
  rule or splitting a file for the metric's sake.

## Related

- The same "evidence, not assertion" principle drives
  `live-data-evidence-gate` (2026-07-15) and `browser-qa-gate`.
- `release-version-sync` rule — now mechanically enforced by the version-sync
  fitness test.
