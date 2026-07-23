---
title: macOS git grep ERE has no \b — boundary regexes in generated hook scripts silently match nothing
date: 2026-07-23
producer: soloship-learn
version: 1
ttl_days: 90
content_hash: 7ed18675e8a1
problem_type: logic_error
category: integration-issues
components: [hooks, component-dup-warn, generated-shell-scripts]
files: [src/hooks.ts, __arch__/component-hook.test.ts]
symptoms: [duplicate-component warn hook stays silent on a true duplicate, git grep -E with \b returns zero matches on macOS, a fail-safe hook hides its own detection bug]
root_cause: wrong_api
resolution_type: code_fix
error_messages: []
tags: [git-grep, ere, word-boundary, macos, portability, hooks, shell, regex, fail-safe, fixture-tests]
---

## Symptoms

The duplicate-component warn hook (`buildComponentDupWarnScript`) returned
silent exit 0 on a file that genuinely re-declared an existing component name.
Three "must warn" fixture tests failed with `expected 0 to be 2`; the hook
never emitted its warning.

## Investigation

The collision search used `git grep -lE "...(function|const|class)[[:space:]]+$NAME\b"`.
Isolated in a scratch repo: the identical pattern with `\b` returns **zero
matches, exit 1** on macOS; replacing `\b` with a boundary class
`([^A-Za-z0-9_]|$)` matches correctly.

## Root Cause

macOS `git grep -E` compiles patterns with POSIX ERE (`regcomp`), and **POSIX
ERE has no `\b` word-boundary atom** — that's a GNU extension. The pattern
doesn't error; it just never matches. Two compounding factors made this
invisible:

1. **The hook's own fail-safe** (any internal failure → silent exit 0, correct
   design for a warn hook) converted "regex never matches" into "no duplicates
   found."
2. Nothing at build/lint time inspects regex strings inside generated shell
   scripts.

## Solution

Replace `\b` with an explicit boundary class in any ERE handed to git
grep/POSIX grep:

```
$NAME\b            →   $NAME([^A-Za-z0-9_]|$)
```

(`src/hooks.ts`, collision search in `buildComponentDupWarnScript`.)

## Why This Works

The boundary class expresses "followed by a non-identifier character or end"
using only POSIX ERE constructs, so it compiles identically on macOS/BSD and
GNU. The `\b` version relied on a GNU-only atom that BSD regcomp treats as a
literal-ish no-match.

## Prevention

- **Never `\b` in anything executed via git grep / POSIX grep** — use
  `[[:<:]]`/boundary classes; boundary class is the portable choice.
- **Behavioral fixture tests are the only reliable net for generated shell.**
  `__arch__/component-hook.test.ts` execs the *generated* script end-to-end
  via child_process with the real input contract (`HOOK_MODIFIED_FILE`) against
  fixture repos — that is what caught this pre-ship. A unit test of the
  TypeScript builder string would have passed.
- **Fail-safe designs need must-fire tests.** Any hook that swallows internal
  errors by design MUST have positive-detection fixtures, or a detection bug is
  indistinguishable from "nothing to report."
