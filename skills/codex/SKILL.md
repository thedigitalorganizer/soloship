---
name: codex
description: |
  Set up or re-sync the current project to run in OpenAI Codex CLI. Runs
  Soloship's codex target, closes the bespoke-rule drift gap the installer
  misses, mirrors MCP servers into Codex's config, then checks Codex's
  live docs for new capabilities (hooks) and reports manual settings
  steps. Use when asked "/codex", "set up codex", "sync codex", or "get
  this project working in Codex".
---

# /codex — Project Environment Sync for Codex CLI

Make this project's governance fully available to Codex, from whatever
state it's in now. Idempotent: first run sets everything up; later runs
sync only what changed and report what's new.

## Gates (binding in every posture — violating any is a failed run)

1. **Sources are read-only.** `CLAUDE.md`, `AGENTS.md`, `.claude/rules/`,
   `.claude/settings.json`, `.mcp.json` are inputs. Never edit or trim
   them to fit the target.
2. **Prefer the installer over hand-rolling.** Soloship HAS a codex
   target: `npx soloship init --agent codex` /
   `npx soloship upgrade --agent codex`. Run that — don't reimplement it.
   This skill's own work is the delta check, the drift gap the installer
   misses, MCP, and the docs check.
3. **Real copies, never symlinks** (symlinked rule dirs corrupt other
   installers — verified failure, 2026-08-15).
4. **Syncing config does not certify the tool.** The final report must
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

## Phase 3 — Sync

1. **Installer first:** run `init`/`upgrade --agent codex`, then
   `npx soloship doctor` — the codex items must be green. Doctor output
   is the evidence; paste the relevant lines in the report.
2. **Close the drift gap the installer misses:** rules hand-written
   straight into `.claude/rules/` that never entered Soloship's template
   don't reach `.codex/rules/` (found in the wild 2026-08-15: four rules
   missing for months). Diff the two directories by filename AND content
   hash; copy any `.claude/rules/*.md` absent or stale in
   `.codex/rules/`, byte-identical. List every file this step moved —
   that list is the drift report, and each one is a candidate to fold
   into `src/rules.ts` (suggest it; the change itself belongs to the
   Soloship repo).
3. **Project without Soloship:** create `.codex/rules/` and copy all
   `.claude/rules/*.md` into it verbatim. Confirm root `AGENTS.md`
   exists (Codex reads it natively); if absent, report the gap, don't
   invent one.
4. **Hooks:** Soloship marks Codex hooks "intentionally not shipped",
   but Codex's docs now carry a Hooks section — the ecosystem moved. In
   Phase 5, read the current hooks docs; if real lifecycle hooks exist,
   map each Claude Code / Soloship gate to a candidate Codex hook and
   put the implementation in the report as a proposal. Every gate with
   no counterpart is listed as **protection absent in Codex**.

## Phase 4 — MCP servers

If `.mcp.json` exists: list servers by name, ask the user which to make
available in Codex (multi-select). Codex configures MCP in its config
file (`config.toml` — verify the exact shape and location, project vs
`~/.codex/`, against current docs in Phase 5 before writing). Secrets:
placeholder plus a manual step unless the target file is confirmed
gitignored / outside the repo.

## Phase 5 — Live docs check

Fetch Codex's current docs — start at `https://learn.chatgpt.com/docs`
(the old developers.openai.com/codex URLs 308-redirect there as of
2026-08): Config Basics/Reference, `agent-configuration/rules`,
`agent-configuration/agents-md`, `extend/mcp`, and `hooks`. If URLs
moved again, search. Compare against what Phase 3 did: rules
location/format still right? AGENTS.md semantics changed? Hooks now
real (see Phase 3.4)? App-level settings (approval modes, sandboxing,
model selection) go into a **numbered manual-steps list written for a
non-coder** — exact command or menu path, exact value, one line on why.

## Phase 6 — Verify, record, commit

- `npx soloship doctor` green on codex items, file counts match the
  delta, every copied rule content-identical to source (`shasum` both
  sides).
- Write the manifest to `.ai/sync-state/codex.json`.
- Commit generated `.codex/` files per project conventions (worktree
  rules apply).

## Phase 7 — Report (always, in this order)

1. **Delta** since last run (or "first run — full setup").
2. **Synced:** what Codex now gets (doctor lines + drift-gap list).
3. **Protections absent in Codex:** every hook/gate with no
   counterpart, named, with what it guarded — plus any hook proposals
   from the new docs.
4. **Manual steps:** the numbered list from Phase 5.
5. **MCP:** mirrored / skipped / placeholders.
6. **Certification reminder:** config synced ≠ tool trusted — run the
   battery SOP before granting write access; until then, proposal-only.
