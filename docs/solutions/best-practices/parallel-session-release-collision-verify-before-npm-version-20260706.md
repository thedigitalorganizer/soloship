---
title: Verify registry + fresh git log before npm version — parallel sessions can have already released your work
date: 2026-07-06
producer: soloship-learn
version: 1
ttl_days: 90
content_hash: ce220c6877ff
problem_type: best_practice
category: best-practices
components: [release-process, versioning, multi-session]
files: [package.json, .claude-plugin/plugin.json, .claude-plugin/marketplace.json, .codex-plugin/plugin.json]
tags: [npm-version, release, parallel-sessions, version-sync, deploy-train]
---

# Check what already shipped before minting a version

## Problem

A session finished a feature and was asked to "ship the 0.13.0 release." It
ran `npm version minor` — which produced **0.14.0**, because a parallel
session in the same repo had already released 0.13.0 forty minutes earlier,
*with this session's merged work inside it* (release trains pick up
everything merged to main). The accidental bump also missed a fourth version
file (`.codex-plugin/plugin.json`) that the other session had just added to
the sync rule.

## Solution

Before any `npm version` / release command, spend 30 seconds establishing
what has already shipped:

```bash
git pull --rebase origin main
npm view <pkg> version                  # what the registry already has
git log -3 --oneline -- package.json    # who bumped last, and when
git tag -l "v*" | tail -3
```

If the registry version ≥ the version you were asked to ship, the release
likely already happened — verify your work is an ancestor of that tag
(`git merge-base --is-ancestor <your-merge> <tag-commit>`) and report that
instead of minting a new number.

If a wrong bump was already created and **not pushed**: `git reset --hard
origin/main` and `git tag -d v<wrong>` undoes it cleanly. Never push a
version commit that ships nothing.

## Prevention

- Treat a release like a deploy train: whoever releases ships *everything*
  merged — so first check whether your train already left with your work
  aboard.
- The release-version-sync rule now covers FOUR files: `package.json`,
  `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and
  `.codex-plugin/plugin.json`. Run its self-check before publish.
- This is the release-side sibling of the deploy lock introduced in the
  2026-07-06 deploy-discipline work; if release collisions recur, extend the
  lock to `npm version`/`npm publish`.
