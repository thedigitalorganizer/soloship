---
title: "Cross-cutting concern registry: reference file + markers + manifest + bidirectional fitness test keeps N-skill sweeps alive"
date: 2026-07-23
producer: soloship-learn
version: 1
ttl_days: 90
content_hash: 49eb233f1340
problem_type: pattern
category: patterns
components: [concerns-registry, skills, fitness-tests, component-reuse]
files: [skills/references/concerns.json, skills/references/component-inventory.md, __arch__/concerns.test.ts]
tags: [cross-cutting, concern, marker, manifest, fitness-function, vendored-skills, drift, single-source-of-truth, sweep, wiring]
---

## The Problem This Solves

A cross-cutting behavior (component reuse, and inevitably others) needs
touchpoints in ~20+ of 45 skills. Hand-editing them once is easy; keeping them
alive is not: vendored-skill refreshes clobber edits, wording drifts as each
skill gets touched, and nobody can answer "which skills enforce X?" without
re-auditing. A doc listing the wiring is exactly the aspirational-rule failure
mode Soloship exists to kill.

## The Pattern (four pieces, all shipped 2026-07-23 for component-reuse)

1. **One reference file per concern** — `skills/references/<concern>.md` holds
   the entire contract *including a canonical pointer template* (the exact
   1–3 lines every wired skill pastes verbatim). Skills carry pointers, never
   forked prose. Change the protocol in one file.
2. **Marker comments at every touchpoint** — `<!-- concern:<name> -->`
   immediately above the pasted template, at the skill's natural anchor.
3. **A manifest** — `skills/references/concerns.json` maps each concern to its
   reference file, marker string, a `keyPhrase`, and the list of wired skills.
4. **A bidirectional fitness test** — `__arch__/concerns.test.ts` (runs under
   plain `npm test`) asserts: every listed skill carries the marker; every
   marker-carrying skill is listed; the reference file exists; and the
   `keyPhrase` appears within 3 lines of each marker (wording-drift guard).
   Failure messages name the skill and the fix ("re-apply the template from
   skills/references/<file>").

## Solution

Adding a touchpoint = paste marker+template at the anchor AND register the
skill in the manifest, same commit. Removing/moving one = update the manifest,
same commit. A vendored refresh that wipes a marker turns `npm test` red
instead of rotting silently — the failure is loud and the repair is copy-paste
from the reference file. Future concerns copy the whole shape: one manifest
entry, one reference file, markers, inherited test protection.

## Honest Limits (state them, don't oversell)

- The test proves marker + wording presence, **not** that a pointer sits at
  the right decision point or changes agent behavior — placement is verified
  once by a QA dry-run; behavior by real use.
- The registry makes touchpoint loss *loud*, not *impossible* — a refresh
  still requires re-applying the template (cheap by design).

## Prevention

- Never inline a cross-cutting protocol into N skills — that guarantees drift.
- Never track wiring in prose docs — track it in a manifest a test reads.
- Growing the manifest phase-by-phase (register skills in the same commit that
  wires them) keeps `npm test` green at every commit of a large sweep.
- Related prior art: verification-theater lesson (a guardrail you can't watch
  fail is theater — the concerns test was mutation-tested: remove one marker,
  watch the named failure, restore); installer own-and-merge (ownership markers
  are how a machine knows what it may replace).
