---
title: Multibyte character adjacent to a shell variable silently eats the expansion in generated hook scripts
date: 2026-07-06
producer: soloship-learn
version: 1
ttl_days: 90
content_hash: 571a87a0c167
problem_type: runtime_error
category: runtime-errors
components: [hooks, session-presence, generated-bash]
files: [src/hooks.ts]
symptoms: [systemMessage output shows garbage bytes where the variable content should be, variable expansion silently empty, session announce message missing the session list]
root_cause: logic_error
resolution_type: code_fix
error_messages: ["1 other active session(s) in this repo: �� shared git index/stash caution applies"]
tags: [bash, hooks, utf8, em-dash, variable-expansion, locale, generated-scripts]
---

# Multibyte character adjacent to a shell variable eats the expansion

## Problem

The SessionStart presence hook built its announce message with
`"...in this repo: $OTHERS— shared git index/stash caution..."`. At runtime
the message rendered as `...in this repo: <0x80><0x94> shared...` — the
`$OTHERS` content (the list of other live sessions, the entire point of the
message) was gone, and two garbage bytes appeared where the em-dash should be.

## Root Cause

When a multibyte UTF-8 character (em-dash `—` = `E2 80 94`) directly follows
a variable expansion, bash (as invoked by the hook runtime, where the locale
may be C/POSIX) consumed the first byte (`E2`) as part of the variable *name*.
The shell then expanded the undefined variable `OTHERS\xe2` to empty and left
the remaining two bytes (`80 94`) as literal garbage. The write looked fine in
source; only executing the generated script showed it.

## Solution

Never let a non-ASCII character touch a `$VAR` expansion in generated shell.
Two fixes applied together in `src/hooks.ts`:

1. Brace the expansion: `${OTHERS}` instead of `$OTHERS` (in the TS template
   literal this is written `\${OTHERS}` to avoid TS interpolation).
2. Keep hook-emitted message text ASCII-only (`-` instead of `—`) — hooks can
   run under a C locale where multibyte handling is byte-wise.

```bash
# before (broken)
echo "...: $OTHERS— shared git index/stash caution applies."
# after (fixed)
echo "...: ${OTHERS}- shared git index/stash caution applies."
```

## Why This Works

Braces terminate the variable name unambiguously, so no following byte can be
absorbed into it regardless of locale. ASCII-only message text removes the
class entirely: every byte is a single character in every locale, so
byte-wise parsing and character-wise parsing agree.

## Prevention

- In generated bash (hook builders in `src/hooks.ts`), always write `${VAR}`
  when any non-space character follows, and keep emitted strings ASCII.
- QA generated scripts by *executing* them with real stdin payloads, not by
  reading them — this bug is invisible in source review and was caught only
  because the QA Plan row ran the hook for real (fix-and-re-verify loop).
