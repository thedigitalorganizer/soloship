---
title: soloship upgrade overwrote a project's customized fitness test (install-once scaffolding treated as refreshable)
date: 2026-07-07
producer: soloship-learn
version: 1
ttl_days: 90
content_hash: bf31f092750f
problem_type: integration_issue
category: integration-issues
components: [ci-installer, upgrade, fitness-test, scaffolding]
files: [src/ci.ts, src/upgrade.ts]
symptoms: [customized __arch__/fitness.test.ts replaced by the generic template after npx soloship upgrade, previously-removed generic assertions reappear and fail, unexpected new .github/workflows/ci.yml in projects that never had CI]
root_cause: logic_error
resolution_type: code_fix
error_messages: ["no source file exceeds 500 lines — FAIL (Settings.tsx 698, admin.ts 1368, stripe.ts 1208)"]
tags: [upgrade, ci, fitness-functions, scaffolding, write-once, customization, clobber]
---

# Upgrade overwrote a customized fitness test

## Problem

After the 2026-07-06 mass `npx soloship upgrade` across projects, Command
Center's `__arch__/fitness.test.ts` lost 64 lines: its project-specific
assertions and, critically, its documented removal of the generic "no source
file exceeds 500 lines" test (three files legitimately exceed it by history).
The generic test came back and started failing, so every agent session in
that project hit a red architecture check. The same run also dropped a brand
new `.github/workflows/ci.yml` into the project, which had never had CI.

## Root Cause

Two guards were missing or mis-scoped in the CI installer:

1. `installCi` guarded `ci.yml` with a **directory-level** check
   (`.github/workflows/` exists → return early) but wrote
   `fitness.test.ts` **unconditionally** — no existence check at all. In a
   project without a workflows dir, every run rewrote the fitness test with
   the generic template.
2. `soloship upgrade` called `installCi` on every upgrade, even though both
   CI files are explicitly customize-me templates ("This is a placeholder —
   customize based on your project structure"), not canonical Soloship
   content like rules/hooks. Refreshable and customizable are opposites: a
   file the user is told to edit must never be force-refreshed.

## Solution

- `src/upgrade.ts`: upgrade no longer touches CI at all — it prints "CI
  scaffolding left untouched (install-once; customize freely)."
- `src/ci.ts`: `fitness.test.ts` is now write-once — created if absent,
  skipped with a message if present (belt-and-suspenders for `init` re-runs).
- Recovery in the damaged project: the custom version was still in git HEAD
  (the overwrite was an unstaged change), so `git checkout --
  __arch__/fitness.test.ts` restored it exactly; the stray untracked
  `.github/` was deleted.

## Why This Works

The failure was a category error: treating user-owned scaffolding like
Soloship-owned canonical files. Rules and hooks are Soloship's contract and
SHOULD force-refresh on upgrade; scaffolding (CI workflow, fitness test,
templates the project edits) is the project's property after first write.
Making the installer write-once and removing CI from upgrade's refresh set
encodes that boundary in code, so no future upgrade can clobber a
customization.

## Prevention

- When adding anything to `init` that users are expected to edit, it must be
  write-once, and `upgrade` must not refresh it. Ask of every generated file:
  "who owns this after first write?" — Soloship (refresh with force) or the
  project (never touch again).
- Recovery tip: upgrade damage to *tracked* files is an unstaged diff —
  check `git diff` in the complaining project before assuming data loss.
