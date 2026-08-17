---
name: antigravity
description: |
  Set up or re-sync the current project to run in Google Antigravity.
  Checks Antigravity's LIVE docs first (mechanics drift — never build
  from remembered facts), runs Soloship's antigravity target (rules,
  hooks, global plugin), closes the bespoke-rule drift gap, mirrors MCP
  servers, then reports the manual settings steps (terminal policies,
  review triggers) and the injection verification the user must run in
  Antigravity itself. Use when asked "/antigravity", "set up
  antigravity", "sync antigravity", or "get this project working in
  Antigravity".
---

# /antigravity — Project Environment Sync for Google Antigravity

Make this project's governance fully available to Antigravity, from
whatever state it's in now. Idempotent: first run sets everything up;
later runs sync only what changed and report what's new.

**Standing caveat this skill must carry into its report:** on 2026-08-15,
Antigravity with all rules installed on disk (`doctor` 3/3) still ignored
them and mis-reported `.claude/rules/` as its own loaded context. Files
present on disk and rules reaching the model's context are two different
claims — this skill can verify the first, only the user can verify the
second (Phase 7's verification step).

## Gates (binding in every posture — violating any is a failed run)

1. **Docs before build.** The live docs check (Phase 3) runs BEFORE any
   sync work. Antigravity's mechanics drift between runs — its docs
   tree gained Hooks and per-surface (app/IDE/CLI) sections after
   Soloship's target was built. Building from remembered facts and
   checking docs afterward is the failure class this ordering prevents.
   The report records the docs-check date.
2. **Sources are read-only.** `CLAUDE.md`, `AGENTS.md`,
   `.claude/rules/`, `.claude/settings.json`, `.mcp.json` are inputs.
   Never edit or trim them to fit the target.
3. **Prefer the installer over hand-rolling.** Soloship HAS an
   antigravity target: `npx soloship init --agent antigravity` /
   `npx soloship upgrade --agent antigravity`, plus the global plugin
   sync (`npm run antigravity:install-local` from the Soloship repo,
   landing in `~/.gemini/config/plugins/soloship`). Run those — don't
   reimplement them (Antigravity itself once proposed rebuilding this
   installer because it didn't look for it; don't repeat that).
4. **Real copies, never symlinks.** `ln -s ../.claude/rules .agents/rules`
   makes Soloship's installer write future Antigravity-only rules
   straight into `.claude/rules/` (verified against `installRulesAt()`,
   2026-08-15).
5. **Syncing config does not certify the tool.** The final report must
   say so and point to the workspace's certification battery if one
   exists (default location: `docs/testing/model-certification/SOP.md`).

## Phase 1 — Discover the source surface

Inventory: `CLAUDE.md`, `AGENTS.md`, every `.claude/rules/*.md`,
`.claude/settings.json` hooks, `.mcp.json`, existing `.agents/` config
(`rules/`, `hooks.json`), `~/.gemini/config/plugins/soloship` (global
plugin, with its `syncedAt`), `~/.gemini/GEMINI.md` (user-global rules),
and Soloship presence (`.soloship/version`). Run `npx soloship doctor`
and record the antigravity lines — the required items are
`.agents/rules/`, `.agents/hooks.json`, and the global plugin.

## Phase 2 — What's new since last run

State lives at `.ai/sync-state/antigravity.json`:
`{ "syncedAt": ISO-8601, "files": { "<source path>": "<sha256>" } }`.

Hash every source (`shasum -a 256`), diff against the manifest: **new /
changed / removed / unchanged**. No manifest = first run, say so.
Removed sources: remove their `.agents/rules/` counterparts after
verifying the file really derives from the removed source.

## Phase 3 — Live docs check (BEFORE any sync work)

Fetch Antigravity's current docs — start at
`https://antigravity.google/docs/getting-started` and follow the nav
(as of 2026-08: `/docs/rules-workflows/`, `/docs/ide/rules/`,
`/docs/mcp/`, `/docs/agent-settings/`, `/docs/permissions/`,
`/docs/hooks/`). If URLs moved, search.

Confirm before acting: rules directory (`.agents/rules/`) and
activation modes unchanged; whether project-level `GEMINI.md` still
matters alongside `AGENTS.md`; MCP config location and schema for the
surface the user actually uses (the docs tree has separate MCP pages
for the app, IDE, and CLI); and whether the Hooks docs describe
capabilities that could carry more of the Claude Code / Soloship gates.

This phase outputs the verified mapping Phase 4 executes, plus a
**numbered manual-steps list written for a non-coder** — exact menu
path, exact value, one line on why. Two settings always get an
explicit recommendation with reasoning:

- **Terminal policy:** recommend NOT Turbo (auto-executes commands; an
  uncertified agent with Turbo is unauthorized-write-by-default).
- **Review triggers:** recommend Request Review (or the strictest
  available) until the tool passes certification.

## Phase 4 — Sync (per Phase 3's verified mapping)

1. **Installer first:** `init`/`upgrade --agent antigravity`, then the
   global plugin sync if the Soloship repo is on this machine. Re-run
   `npx soloship doctor` — antigravity must be 3/3. Doctor output is
   the evidence; paste the relevant lines in the report. (1/3 with only
   the global plugin present means the per-project `.agents/` directory
   is missing — the installer creates it.) If Phase 3 found the
   installer's output no longer matches what Antigravity reads, stop
   and surface that as a Soloship bug instead of patching around it.
2. **Close the drift gap the installer misses:** diff `.claude/rules/`
   against `.agents/rules/` by filename AND content hash; copy any rule
   absent or stale, byte-identical. List every file moved — each is a
   candidate to fold into `src/rules.ts` (suggest it; the change
   belongs to the Soloship repo).
3. **Project without Soloship:** create `.agents/rules/` and copy all
   `.claude/rules/*.md` verbatim. Confirm root `AGENTS.md` exists
   (Antigravity reads it natively); report a gap rather than inventing
   one. Do not create `GEMINI.md` unless Phase 3 found the
   project-level file still meaningful alongside `AGENTS.md`.
4. **Hooks:** `.agents/hooks.json` comes from the installer. If
   Phase 3 found new hook capabilities, propose mappings for more of
   the Claude Code / Soloship gates in the report. Every gate with no
   counterpart is listed as **protection absent in Antigravity**.

## Phase 5 — MCP servers

If `.mcp.json` exists: list servers by name, ask the user which to make
available in Antigravity (multi-select). Configure them per the
location and schema verified in Phase 3. Secrets: placeholder plus a
manual step unless the target file is confirmed outside the repo or
gitignored.

## Phase 6 — Verify, record, commit

- `npx soloship doctor` 3/3 on antigravity, file counts match the
  delta, every copied rule content-identical to source (`shasum` both
  sides).
- Write the manifest to `.ai/sync-state/antigravity.json`.
- Commit generated `.agents/` files per project conventions (worktree
  rules apply).

## Phase 7 — Report (always, in this order)

1. **Docs-check date + anything that changed** in Antigravity's
   mechanics since the last run.
2. **Delta** since last run (or "first run — full setup").
3. **Synced:** what Antigravity now gets (doctor lines + drift-gap
   list + plugin syncedAt).
4. **Protections absent in Antigravity:** every hook/gate with no
   counterpart, named, with what it guarded — plus any hook proposals
   from the new docs.
5. **Manual steps:** the numbered list from Phase 3, including the
   terminal-policy and review-trigger recommendations.
6. **MCP:** mirrored / skipped / placeholders.
7. **Injection verification (user-run, in Antigravity):** files on disk
   don't prove rules reach the model. Give the user this exact check to
   run in a fresh Antigravity session after a full app restart: ask
   *"Read the file at .agents/rules/plan-claim-verification.md and tell
   me what it says. Separately: what governance rules do you have
   loaded right now, and from where?"* — if it can read the file when
   pointed at it but doesn't spontaneously know `.agents/rules/`
   exists, the injection isn't working (observed 2026-08-15).
8. **Certification reminder:** config synced ≠ tool trusted — run the
   battery SOP before granting write access; until then, proposal-only.
