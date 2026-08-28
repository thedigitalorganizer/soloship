---
title: Backticks inside a double-quoted git commit -m string execute as real shell commands
date: 2026-08-27
producer: soloship-learn
version: 1
ttl_days: 90
content_hash: b5314151d524
problem_type: pattern
category: workflow-issues
components: [agent-workflow, git, bash-tool]
files: []
tags: [shell-escaping, command-substitution, git-commit, backticks, self-mutation, dogfooding-hazard, npx-soloship-upgrade]
---

# Backticks inside a double-quoted git commit -m string execute as real shell commands

## The Finding

Writing `git commit -m "... \`npx soloship upgrade --quiet\` ..."` (backtick
spans inside a double-quoted `-m` argument, as prose describing a command —
not intended to run it) is not inert. Outside single quotes, bash treats
backticks as command substitution regardless of surrounding double quotes.
Every backtick-delimited span in the message gets executed for real, its
stdout spliced into the commit message text, before the commit even happens.

This bit twice in the same session, on Soloship's own dev repo:

1. A commit message documenting the SessionStart auto-upgrade hook contained
   two separate backtick-quoted spans describing example invocations
   (`` `npx soloship upgrade --quiet` `` and `` `npx soloship upgrade` ``,
   used as prose, not as commands). Both ran for real, against the literal
   checkout the agent was working in — one with no `--agent` flag, which
   (because the repo already had `.codex/`, `.agents/`, `.cursor/` present)
   ran the FULL multi-host upgrade: deleted seven generated rule-mirror files
   across four host directories, created `.codex/config.toml` and
   `.codex/hooks.json` from nothing, and modified `.agents/hooks.json` — all
   silently, mid-commit, with the shell reporting only `command not found`
   errors for the fragments it couldn't parse as a full command (giving no
   indication that the parts it *could* parse had actually run).
2. Separately, earlier in the same session, a `` `soloship upgrade` ``-style
   backtick reference inside a shell one-liner's surrounding text triggered
   the same class of accidental self-mutation against the agent's own
   worktree.

Both times, the actual damage was invisible until a subsequent `git status`
or `git log -1 --format=%B` was inspected — the commit itself appeared to
succeed, and the shell's `command not found` noise looked like unrelated
clutter rather than a signal that code had just executed.

## Why This Happens

Bash quoting rule: single quotes suppress ALL expansion, including
backticks. Double quotes suppress most expansion (word splitting, globbing)
but NOT command substitution — both `` `...` `` and `$(...)` still execute
inside double quotes. A `-m "..."` argument is double-quoted by construction
whenever it's written as a normal shell string, so any backtick inside it —
even one meant purely as markdown code-span styling in the commit message
prose — is live shell syntax to bash, not inert text.

This is a general bash fact, not a Claude Code or Soloship-specific bug, but
it is a live hazard specifically for any workflow that (a) writes commit
messages describing shell commands in prose, using backticks for that
prose's code-span styling, and (b) runs those commits via a shell tool that
parses the whole `-m` argument through a real shell rather than passing it
as a literal argv string.

## Prevention

- **Never build a `git commit -m "..."` string inline when the message body
  will contain backticks.** Write the message to a temp file first (any
  editor tool, not a shell heredoc that itself risks the same expansion),
  then commit with `git commit -F <path>`. `-F` never re-parses the file
  contents as shell syntax — there is no expansion step to fall into.
- **If a commit message must be built inline anyway, use single quotes for
  the outer `-m` argument**, not double quotes — but this is fragile the
  moment the message itself contains an apostrophe, so prefer `-F` unless
  the message is trivial and known ASCII-only.
- **Treat unexplained `command not found` lines during a "successful" git
  operation as a signal to stop and inspect, not as noise.** In both
  incidents this session, the shell's own error output was the first (and
  only) hint that something else had run — visible in the tool result, but
  easy to skim past because the primary command (the commit) still appeared
  to succeed.
- **After any commit built from a string containing backticks, verify with
  `git status --porcelain` and `git log -1 --format=%B` before doing
  anything else** — confirm the working tree matches what was intended and
  the commit message reads as written, not as shell-expanded.
- **This is a standing hazard for any dogfooding tool** — a project whose
  own commit messages might plausibly reference its own CLI in backticks
  (as this session's did, describing the very `npx soloship upgrade`
  command the commit was about) is at elevated risk, because the mistake
  and the tool's real side effects land in the exact same repository being
  worked in.
