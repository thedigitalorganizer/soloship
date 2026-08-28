---
title: upgrade deleted the safety-gate rule mirrors without ever writing their AGENTS.md replacement
date: 2026-08-27
producer: soloship-learn
version: 1
ttl_days: 90
content_hash: f7b987b9df60
problem_type: logic_error
category: workflow-issues
components: [upgrade, init, templates, safety-gates, agents-md]
files: [src/upgrade.ts, src/init.ts, src/templates.ts, src/safety-gates.ts]
symptoms: ["npx soloship upgrade deletes .claude/rules/*.md, .codex/rules/*.md, .cursor/rules/*.mdc, .agents/rules/*.md on an existing project", "the project's AGENTS.md never gains a ## Safety gates section", "all seven always-on safety-gate rules become undocumented anywhere in the project after upgrade", "the gap is invisible in a fresh init on a new project — it only shows up on an EXISTING project's upgrade run"]
root_cause: missing_workflow_step
resolution_type: code_fix
error_messages: []
tags: [agents-md, upgrade, migration, safety-gates, marker-delimited-section, real-world-testing, maps]
---

# upgrade deleted the safety-gate rule mirrors without ever writing their AGENTS.md replacement

## The Problem

A multi-phase plan (`docs/plans/2026-08-27-one-source-of-truth-across-agent-hosts.md`)
moved Soloship's seven always-on safety-gate rules from four generated
per-host directories (`.claude/rules/`, `.codex/rules/`, `.cursor/rules/`,
`.agents/rules/`) into a single `## Safety gates` section inside `AGENTS.md`.
The rule-directory installers were rewritten to prune-only: on `upgrade`,
they delete Soloship's own previously-generated copies and leave
user-authored files alone.

That prune was only safe under one assumption: that the text those mirrors
held was now guaranteed to live in `AGENTS.md`. Nobody verified that
assumption against an *existing* project before shipping it. It was false.
`upgrade` preserves `AGENTS.md`/`CLAUDE.md` content by contract — it never
regenerates them — and the `## Safety gates` section only ever got embedded
via `init`'s fresh `generateAgentsMd()` call, on a project that didn't have
an `AGENTS.md` yet. Every project that already had one and ran `upgrade`
instead of `init` would have the mirrors deleted and the replacement text
land nowhere. The seven rules would simply vanish from the project, invisible
to every host, with the tool reporting success.

This is exactly the kind of gap the plan's own step 3 (migration for existing
projects) should have caught, but the plan's language ("upgrade deletes...
converts... prints the nudge") described the *deletions* precisely and never
stated the missing half as its own explicit step.

## How It Was Found

Not by code review or a unit test — by running the real built CLI's
`upgrade` command against a real, unrelated project (MAPS) in a throwaway
git worktree, as the plan's own "Execution Strategy" section called for
("MAPS is the real-world migration test"). The existing test suite had
100% coverage of the *prune* behavior (rules.ts's install functions) and
zero coverage of "does the replacement text actually land somewhere first" —
because that coverage gap doesn't exist until you point the tool at a
project whose `AGENTS.md` already exists and is older than the section.

## Solution

Added a mechanical, marker-delimited "ensure" step that both `init` and
`upgrade` run *before* the rule-mirror prune:

- `src/safety-gates.ts`: `renderSafetyGatesSection()` now wraps its output in
  `<!-- soloship:safety-gates:start -->` / `:end` HTML-comment markers.
  `ensureSafetyGatesSection(agentsMd)` is a pure string transform with three
  cases, in order: (1) markers present → replace everything between them;
  (2) no markers but a legacy unmarked `## Safety gates` heading (an earlier,
  pre-fix shape) → replace heading-to-next-`##`; (3) neither → append at the
  end. Never touches anything else in the file.
- `src/templates.ts`: `ensureSafetyGatesInAgentsMd(root, project)` is the
  fs-level wrapper — creates a full `AGENTS.md` via `generateAgentsMd()` if
  none exists at all, otherwise reads/patches/writes only if the section
  actually changed.
- `src/upgrade.ts` and `src/init.ts` both call it, immediately before the
  rule-mirror prune step, with the ordering enforced by comments at each
  call site: the prune's safety argument is "the text lives in AGENTS.md,"
  which is only true once the ensure has run.
- `upgrade`'s doc comment was corrected: it no longer preserves `AGENTS.md`
  unconditionally — it owns exactly one marker-delimited section, mechanical
  and verbatim, the same way it already owns the hooks and rules around it.

Re-ran the MAPS worktree test after the fix: `AGENTS.md` gained the section
as a clean append (`git diff` showed only insertions), a second run reported
`unchanged` (idempotent), and the 19 `.codex/rules/*.md` deletions plus the
other Done-When claims still verified correctly.

## Why This Works

The root cause was a **missing workflow step**, not a wrong one: the
"delete the old mirrors" half of the migration was implemented and tested;
the "guarantee the replacement is present" half was assumed rather than
built. Marker-delimited replacement is the right mechanism because it lets
`upgrade` keep its broader promise (never touch user content in `AGENTS.md`)
while still being allowed to own one small, purely-mechanical, verbatim
sub-section — the same pattern already used for `.codex/config.toml`'s two
managed keys (narrow text surgery, never a wholesale rewrite). Running the
ensure *before* the prune, rather than after or unordered, is what makes the
prune's own safety claim true instead of aspirational.

## Prevention

- **A plan step that both deletes an old surface and claims content "moves"
  to a new one needs its own explicit verification that the new surface
  actually receives the content** — "deleted" and "moved" are not the same
  claim, and a plan can accidentally ship only the first half.
- **Test the *upgrade* path against a project state that already has the
  target file**, not just the *init* path against an empty project. A
  migration bug that only exists when the destination already has content
  is invisible to a test suite that only ever inits fresh.
- **The plan's own "real-world migration test" step is not optional
  ceremony** — this bug was caught specifically because that step was run
  for real (a throwaway worktree against MAPS) rather than deferred or
  treated as pending-live. Running it uncovered a genuine defect that no
  unit test in the existing suite would have caught, because the suite
  had no fixture representing "an existing project's AGENTS.md predates
  this feature."
