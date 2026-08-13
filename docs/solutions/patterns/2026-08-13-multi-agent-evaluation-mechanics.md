---
title: Multi-agent evaluation mechanics — arm-facing constraints, resume/fork mechanics, and fixture scoping
date: 2026-08-13
producer: soloship-learn
version: 1
ttl_days: 180
problem_type: pattern
category: patterns
components: [evaluation-harness, codex-cli, claude-code-cli, finish-flow]
files: [skills/implement/SKILL.md, skills/finish/SKILL.md, skills/references/merge-sequence.md]
tags: [gauntlet, bake-off, evaluation, codex, resume, fork-session, read-only-sandbox, not-reached, wall-clock, finish-flow]
content_hash: dc992980201c
---

# Multi-agent evaluation mechanics

Durable lessons from running and grading the six-arm Command Center gauntlet
(2026-08-12; full report in the Command Center repo:
`docs/reports/2026-08-12-command-center-model-gauntlet.md`). Written for the
next bake-off so its harness doesn't rediscover these the expensive way.

## 1. Every constraint the GRADER has, the ARMS need too — in their own prompt

The gauntlet's one hard-constraint incident: an arm running
`/soloship:plan` → `/soloship:implement` finished by merging its branch into
`main` and pushing — because that is the finish flow's documented default
(`no-auto-pr`: merge locally, push, no PR), and **nothing in the arm's prompt
said this was a contained, never-merge evaluation**. The never-merge rule
lived only in the grader's instructions. A skill whose completion path is
"merge and push" will do exactly that inside an eval unless the arm-facing
prompt forbids it. Corollary for the harness itself: an autonomous finish
flow executes its defaults — when parallel sibling lanes exist, "commit +
report + ask" is the safe default shape, and that's a design question the
lean-harness audit carries (see `docs/handoffs/2026-08-13-soloship-v2-lean-harness-audit.md`
while it exists).

## 2. Codex CLI resume mechanics (all verified empirically 2026-08-12)

- `codex resume` / `codex fork` are **TUI-only**. The only non-interactive
  path is `codex exec resume <id> "<prompt>"`, and it **always appends to the
  same thread** — no non-interactive fork exists. Plan accordingly: resuming
  a Codex session for an interview mutates its transcript file.
- `codex exec resume` does **NOT restore the session's recorded model**. It
  silently uses the CLI's current default unless `-m <model>` is passed
  explicitly. Codex prints a mismatch warning — read it. (Caught live: a
  Terra session resumed under the Sol default; the attempt was discarded and
  re-run with `-m`.) **Always pass `-m` on any Codex resume.**
- `-s read-only` is a real cage: it blocks file writes ("Operation not
  permitted") AND network egress (DNS resolution fails). Use it for any
  resume where the session must not act — e.g. interviewing an arm whose
  unexecuted plan included deploy/merge steps.

## 3. Claude Code resume mechanics (verified empirically 2026-08-12)

- `claude --resume <id>` **appends to the original session**;
  `--resume <id> --fork-session` creates a new session id and leaves the
  original untouched — the safe interview path (confirmed: new session_id
  returned each time, zero worktree changes).
- `--permission-mode plan` blocks file writes even under `-p`
  (non-interactive) — a second belt for read-only resumes.
- Locating a session file by grepping directory names is unreliable in a
  multi-worktree repo: Soloship's session-start hook advertises ALL active
  sibling worktrees into every session's content, so content-grep matches
  the wrong sessions. Match on line counts + the kickoff message instead.

## 4. Fixture scoping: "not met" vs "not reached" requires path isolation

A criterion fixture that drives only one endpoint conflates two different
verdicts: an arm can fail criteria it implemented correctly because an
*unrelated upstream gate* rejects the request before the logic under test
runs. The gauntlet's fixture initially drove only the company-door endpoint;
two arms whose repoint logic was correct scored "not met" on it until a
second block drove the plain merge path, isolating the capability from the
gate. Rule: **one fixture path per independent capability**, each calibrated
to fail on baseline and pass on a reference patch. And grade off the
end-to-end result, not a function-level probe — three arms passed end-to-end
via compensating logic a classifier-only probe called broken.

## 5. Wall-clock: measure to natural completion, not last log event

Session logs stay alive through post-completion Q&A. Duration = start → the
arm's own completion declaration. Using last-log-event overstated two arms'
active time ~3–4x. Rate (coverage/time) uses active-work duration; an arm
with zero completed units has an **undefined** rate — never divide.

## 6. Environment checks are part of arm setup

One arm worked its entire session in a worktree whose `npm install` had
silently never succeeded, and the cross-test grid initially scored 25 cells
"incompatible" against it for the same reason. Before any arm starts (and
before any cross-arm test run), verify the environment actually builds/tests
— a 100%-failure pattern against one target is an environment smell, not a
result.

## Solution

Bake these into the next bake-off's harness prompt template: arm-facing
constraint list (never merge, never deploy, never touch real records —
verbatim in every arm's kickoff), `-m` on every Codex resume, fork-session
for Claude interviews, read-only sandbox for risky resumes, per-capability
fixture paths calibrated baseline-fail/reference-pass, natural-completion
timing, and an environment preflight per arm.
