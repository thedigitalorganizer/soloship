---
title: Documented counts drift silently when nothing asserts them
date: 2026-07-31
producer: soloship-learn
version: 1
ttl_days: 90
problem_type: test_failure
category: workflow-issues
components: [validate-plugin-metadata, README, AGENTS.md, src/rules.ts, src/hooks.ts]
files:
  - scripts/validate-plugin-metadata.js
  - README.md
  - AGENTS.md
symptoms:
  - "npm run validate:plugins fails: expected 17 rules registered in src/rules.ts, found 18"
  - "Release validator has been red on main for multiple releases and nobody noticed"
  - "README states two different numbers for the same thing in different sections"
  - "A doc's prose count disagrees with its own enumerated list"
  - "AGENTS.md describes a source file's contents with a number that is years stale"
root_cause: missing_tooling
resolution_type: tooling_addition
error_messages:
  - "expected 17 rules registered in src/rules.ts, found 18"
tags: [documentation, drift, validation, release-gate, counts, readme, agents-md, self-verifying-docs]
content_hash: 9c9efecc9baf
---

# Documented counts drift silently when nothing asserts them

## Context

While fixing the v0.21.0 plugin collision, the release validator was run for the
first time in a while. It failed — but not on the thing being fixed:

```
$ node scripts/validate-plugin-metadata.js
Plugin metadata validation failed:
- expected 17 rules registered in src/rules.ts, found 18
```

`REQUIRED_RULE_COUNT` was never bumped when v0.20.0 added the 18th rule
(`verification-sufficiency`). `npm run validate:plugins` had been failing on
`main` since that release. Nobody noticed, because nothing runs it on a schedule
and the release flow that would have caught it was not exercised.

Pulling that thread found the same disease everywhere the counts were written in
**prose** instead of computed:

| Location | Claimed | Actual |
|---|---|---|
| `README.md` line 5 | 18 hook protections | 25 |
| `README.md` line 208 | 17 hook protections | 25 |
| `README.md` line 208 enumeration | 19 items listed | 25 |
| `README.md` (3 places) | 17 workflow rules | 18 |
| `README.md` repo structure | 45 skills total | 46 |
| `AGENTS.md` | 43 skills | 46 |
| `AGENTS.md` | `rules.ts` (14 rules) | 18 |
| `AGENTS.md` | `hooks.ts` (10 hooks) | 25 |

README contradicted **itself** — two different hook numbers in one file, neither
matching its own list. The rules enumeration silently omitted
`browser-tooling-priority` entirely, which is how "17" survived: the list and the
number were consistent with each other and both wrong.

## Solution

Assert documented counts against live source in the release validator.

`scripts/validate-plugin-metadata.js` gained a `DOC_COUNT_CHECKS` table plus a
`countHookScripts()` ground-truth function:

```js
const DOC_COUNT_CHECKS = [
  { file: "README.md", pattern: /(\d+) hook protections/g, truth: "hooks" },
  { file: "README.md", pattern: /(\d+) always-on rules/g,  truth: "rules" },
  { file: "README.md", pattern: /(\d+) workflow rules/g,   truth: "rules" },
  { file: "README.md", pattern: /(\d+) workflow skills/g,  truth: "skills" },
  { file: "AGENTS.md", pattern: /(\d+) skills for audit/g, truth: "skills" },
  { file: "AGENTS.md", pattern: /\((\d+) rules\)/g,        truth: "rules" },
  { file: "AGENTS.md", pattern: /\((\d+) hooks\)/g,        truth: "hooks" },
];
```

Every occurrence of each pattern must equal the count derived from source
(`countSkillFiles()`, `countRegisteredRules()`, `countHookScripts()`).

**A missing match is also an error**, not a pass. If someone rewords "25 hook
protections" to "twenty-five hook protections", the check reports that the phrase
moved and the count is no longer verified. Silently un-verifying is the failure
mode this whole doc is about; a check that quietly stops checking is worse than
no check.

Verified against four states before shipping:

| State | Result |
|---|---|
| clean | exit 0 |
| stale number (18 → 17 rules) | exit 1, `documented rules count is stale — says 17, actual is 18` |
| reworded phrase | exit 1, `no match … the phrase moved or was reworded` |
| restored | exit 0, README byte-identical |

## Why This Works

The root cause is `missing_tooling`, not carelessness. A number written in prose
has **no link to the thing it describes**. Adding the 18th rule touches
`src/rules.ts`; nothing in that edit is connected to the string `17` sitting in
three other files. There is no compiler error, no failing test, no reviewer
prompt. The only thing keeping the number true is that someone remembers — and
across releases and sessions, nobody does.

The fix converts a remembered invariant into a mechanical one. The count now has
exactly one source of truth (the code) and every prose copy is checked against
it at release time. Drift becomes impossible to ship rather than merely
discouraged.

This is the identical lesson the same file already learned once, recorded in its
own comment:

> `REQUIRED_RULE_COUNT` used to be declared and printed but never asserted — the
> validator reported "12 rules expected" while `src/rules.ts` registered 13, and
> passed. **A count that is displayed but not checked is worse than no check: it
> reads as verification.**

That comment fixed the *displayed-but-unchecked* case inside the validator, and
then the exact same pattern recurred one layer out, in the prose docs. That
recurrence is the real signal: when you fix a class of bug, ask where else the
same shape lives. Here it lived in every `.md` file that stated a number.

## Prevention

- **Never write a count in prose that source can compute.** Either assert it in
  CI, or write "several"/"a set of" and let the enumeration carry the detail.
- **Treat a self-contradicting doc as a build failure.** README claiming 18 in
  one place and 17 in another is not a typo; it is proof nothing checks either.
- **When a check finds one stale number, sweep the whole class** before closing
  out. One stale count means the mechanism that would keep counts fresh does not
  exist, so every other count is suspect.
- **Run the release validator on a cadence, not only at release.** This one was
  red for a full release cycle because nothing invoked it in between.
- **Make "no match" an error in any pattern-based check.** A regex that stops
  matching after a rewrite silently downgrades to zero coverage while still
  reporting success.

## Cross-references

- [`claude-code-plugin-format-gotchas-SoloshipPlugin-20260512.md`](../best-practices/claude-code-plugin-format-gotchas-SoloshipPlugin-20260512.md)
  — Gotcha 8, the v0.21.0 plugin collision this drift was found alongside; also
  an instance of a doc (Gotcha 2) whose stated fact went stale and misled.
- `.claude/rules/release-version-sync.md` — the sibling discipline for the four
  version files, which had already been mechanized for the same reason.
- `docs/solutions/patterns/critical-patterns.md` — Pattern #1, updated in the
  same session.
