---
name: codex
description: |
  Set up or re-sync the current project to run in OpenAI Codex CLI.
  Checks Codex's LIVE docs first (mechanics drift — never build from
  remembered facts), runs Soloship's codex target, closes the
  bespoke-rule drift gap the installer misses, mirrors MCP servers into
  Codex's config, and reports manual settings steps. Use when asked
  "/codex", "set up codex", "sync codex", or "get this project working
  in Codex".
---

# /codex — Project Environment Sync for Codex CLI

Make this project's governance fully available to Codex, from whatever
state it's in now. Idempotent: first run sets everything up; later runs
sync only what changed and report what's new.

## Gates (binding in every posture — violating any is a failed run)

1. **Docs before build.** The live docs check (Phase 3) runs BEFORE any
   sync work. Codex's mechanics drift between runs — verified example:
   its docs host moved (developers.openai.com → learn.chatgpt.com,
   308) and a Hooks section appeared after Soloship's target marked
   hooks "not shipped". Building from remembered facts and checking
   docs afterward is the failure class this ordering prevents. The
   report records the docs-check date.
2. **Sources are read-only.** `AGENTS.md` is the primary source (project
   instructions plus the seven safety-gate rules, in its `## Safety gates`
   section — since 2026-08-27 those no longer live as separate files in
   `.claude/rules/`); Codex reads it natively, so this is also the target,
   not just an input to mirror. `CLAUDE.md` is derived from it (`@AGENTS.md`
   import plus a Claude-only appendix). `.claude/rules/` (project-specific
   rules a human added by hand), `.claude/settings.json`, `.mcp.json` are
   also inputs. Never edit or trim any of them to fit the target.
3. **Prefer the installer over hand-rolling.** Soloship HAS a codex
   target: `npx soloship init --agent codex` /
   `npx soloship upgrade --agent codex` — as of 2026-08-27 this includes
   `.codex/hooks.json` (the shared gate scripts every hook-capable host
   uses) and `[features] hooks = true` in `.codex/config.toml`, not just
   rules and AGENTS.md guidance. Run the installer — don't reimplement
   it. This skill's own work is the docs check, the delta check, the
   drift gap the installer misses, and MCP.
4. **Real copies, never symlinks — for rule *directories* only.** A
   symlinked rules dir routes other tools' installers into `.claude/rules/`
   (verified failure, 2026-08-15). Per-skill symlinks are fine — Claude Code
   documents symlinked skill directories as supported and dedupes them.
5. **Syncing config does not certify the tool.** The final report must
   say so and point to the workspace's certification battery if one
   exists (default location: `docs/testing/model-certification/SOP.md`).

## Phase 1 — Discover the source surface

Inventory: `CLAUDE.md`, `AGENTS.md`, every `.claude/rules/*.md`,
`.claude/settings.json` hooks, `.mcp.json`, existing `.codex/` config,
and Soloship presence (`.soloship/version`). Run `npx soloship doctor`
and record the codex lines.

## Phase 2 — What's new since last run

State lives at `.ai/sync-state/codex.json`:
`{ "syncedAt": ISO-8601, "files": { "<source path>": "<sha256>" } }`.

Hash every source (`shasum -a 256`), diff against the manifest: **new /
changed / removed / unchanged**. No manifest = first run, say so.
Removed sources: remove their `.codex/rules/` counterparts after
verifying the file really derives from the removed source.

## Phase 3 — Live docs check (BEFORE any sync work)

Fetch Codex's current docs — start at `https://learn.chatgpt.com/docs`
(the old developers.openai.com/codex URLs 308-redirect there as of
2026-08): Config Basics/Reference, `agent-configuration/rules`,
`agent-configuration/agents-md`, `extend/mcp`, and `hooks`. If URLs
moved again, search.

Confirm before acting: rules location/format the installer writes is
still what Codex reads; AGENTS.md semantics unchanged; MCP config shape
and location (`config.toml`, project vs `~/.codex/`); and whether the
Hooks docs describe real lifecycle hooks now. This phase outputs the
verified mapping Phase 4 executes, plus a **numbered manual-steps list
written for a non-coder** for app-level settings (approval modes,
sandboxing, model selection) — exact command or menu path, exact value,
one line on why.

## Phase 4 — Sync (per Phase 3's verified mapping)

1. **Installer first:** run `init`/`upgrade --agent codex`, then
   `npx soloship doctor` — the codex items must be green. Doctor output
   is the evidence; paste the relevant lines in the report. If Phase 3
   found the installer's output no longer matches what Codex reads,
   stop and surface that as a Soloship bug instead of patching around
   it.
2. **Close the drift gap the installer misses:** rules hand-written
   straight into `.claude/rules/` that never entered Soloship's
   template don't reach `.codex/rules/` (found in the wild 2026-08-15:
   four rules missing for months). Diff the two directories by filename
   AND content hash; copy any `.claude/rules/*.md` absent or stale in
   `.codex/rules/`, byte-identical. List every file this step moved —
   that list is the drift report, and each one is a candidate to fold
   into `src/rules.ts` (suggest it; the change itself belongs to the
   Soloship repo).
3. **Project without Soloship:** create `.codex/rules/` and copy all
   `.claude/rules/*.md` into it verbatim. Confirm root `AGENTS.md`
   exists (Codex reads it natively); if absent, report the gap, don't
   invent one.
4. **Hooks:** as of 2026-08-27, `npx soloship init`/`upgrade --agent codex`
   installs real hooks — `.codex/hooks.json` pointing at the same
   `scripts/soloship-hooks/*.cjs` gate files Claude Code uses (command-safety,
   billing-confirmation, recurrence, deploy-freshness, deploy-discipline,
   plan-truth, plan-merge, plan-namespace), plus `[features] hooks = true` in
   `.codex/config.toml` (off by default otherwise). Step 1's installer run
   already did this — verify it via `npx soloship doctor`'s `.codex/hooks.json`
   line, don't re-propose it. If Phase 3's docs check found the hook contract
   changed since 2026-08-27 (event names, payload shape, config format),
   surface that as a Soloship bug instead of patching around it here.
   `session-register`/`deploy-lock`/`stop-checks` are NOT yet ported to Codex
   (Claude-only for now) — list those as **protection absent in Codex**.

## Phase 5 — MCP servers

If `.mcp.json` exists: list servers by name, ask the user which to make
available in Codex (multi-select). Write them per the shape and
location verified in Phase 3. Secrets: placeholder plus a manual step
unless the target file is confirmed gitignored / outside the repo.

## Phase 6 — Verify, record, commit

- `npx soloship doctor` green on codex items, file counts match the
  delta, every copied rule content-identical to source (`shasum` both
  sides).
- Write the manifest to `.ai/sync-state/codex.json`.
- Commit generated `.codex/` files per project conventions (worktree
  rules apply).

## Phase 7 — Report (always, in this order)

1. **Docs-check date + anything that changed** in Codex's mechanics
   since the last run.
2. **Delta** since last run (or "first run — full setup").
3. **Synced:** what Codex now gets (doctor lines + drift-gap list).
4. **Protections absent in Codex:** the gates not yet ported
   (session-register, deploy-lock, stop-checks — see Phase 4 step 4),
   named, with what each guards.
5. **Manual steps:** the numbered list from Phase 3.
6. **MCP:** mirrored / skipped / placeholders.
7. **Certification reminder:** config synced ≠ tool trusted — run the
   battery SOP before granting write access; until then, proposal-only.
