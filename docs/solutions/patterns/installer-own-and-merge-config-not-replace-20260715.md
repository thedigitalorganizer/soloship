---
title: An installer must own-and-merge shared config, never replace the whole block
date: 2026-07-15
producer: soloship-learn
version: 1
ttl_days: 90
content_hash: f78db68fb213
problem_type: logic_error
category: patterns
components: [init, hooks, settings.local.json]
files: [src/hooks.ts]
symptoms: [re-running init or upgrading wipes any hook the user added themselves, custom hooks silently disappear from settings.local.json]
root_cause: logic_error
resolution_type: code_fix
error_messages: []
tags: [installer, idempotency, settings, hooks, merge, marker, config-ownership]
---

## Symptoms

Running `npx soloship init` a second time (or on upgrade) replaced the entire
`hooks` block in a project's `.claude/settings.local.json`. Any hook the user had
added themselves was silently wiped. Discovered during the 0.16.0 Command Center
install: a full `init` would have clobbered CC's custom timestamp Stop hook,
forcing a surgical one-off workaround instead of a normal install.

## Root Cause

`installHooks` built Soloship's full hook set fresh each run and did
`settings.hooks = hooks` — a **whole-block replace**. It preserved *other*
settings keys (permissions, env) but overwrote every hook. An installer that
writes into a shared config file cannot tell its own past output from the user's
additions if it doesn't mark what it owns, so "replace" was the only thing it
could safely-looking do — and that silently destroys user content.

## Solution

**Own-and-merge, not replace.** The installer stamps every hook it writes with an
ownership marker, then merges instead of overwriting:

1. Add `_soloshipManaged: true` to each entry Soloship generates.
2. On write, for each hook event: keep existing entries that are **not** marked
   (the user's own), drop the marked ones, then append Soloship's freshly-built
   (re-marked) set. Result: idempotent — a Soloship hook is never duplicated, a
   user hook is never wiped.
3. **Migration for pre-marker installs:** old Soloship hooks lack the marker, so a
   best-effort fingerprint regex (`isLegacySoloshipHook`) also drops entries whose
   command matches known Soloship signatures, so the first upgrade `init` doesn't
   duplicate them. Kept specific to avoid dropping a genuinely custom hook.

## Why This Works

The marker gives the installer a durable, version-independent way to answer "did
*I* put this here?" — the question a whole-block replace can't ask. Everything the
installer owns is regenerated every run (idempotent); everything it doesn't own is
left alone. The fingerprint sweep is a one-time bridge for hooks that predate the
marker; after the first post-fix init, every Soloship hook carries the marker and
the fingerprints stop mattering.

Verified idempotent: seed a config with a genuinely custom hook, run `init` three
times → the custom hook survives, the Soloship set never grows (22 → 22 → 22),
permissions and other settings preserved.

## Prevention

- Any tool that writes into a **shared, user-editable** config file (settings,
  dotfiles, CI config) must mark what it owns and merge — never replace a whole
  section. The moment a user can add a sibling entry, replace becomes data loss.
- Test idempotency explicitly: run the installer 2–3× over a config that already
  contains a foreign entry, and assert (a) no duplication of owned entries and
  (b) the foreign entry survives.
- When adding a marker to a tool that already has deployed output, ship a
  migration path (signature match) for the unmarked legacy entries, or the first
  post-upgrade run duplicates them.

## Related

- Surfaced while installing `live-data-evidence-gate` (0.16.0) into Command
  Center; fixed in 0.16.1.
