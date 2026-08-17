---
name: antigravity
description: |
  Set up or re-sync the current project to run in Google Antigravity.
  Runs Soloship's antigravity target (rules, hooks, global plugin),
  closes the bespoke-rule drift gap, mirrors MCP servers, checks
  Antigravity's live docs for new capabilities, then reports the manual
  settings steps (terminal policies, review triggers) and the injection
  verification the user must run in Antigravity itself. Use when asked
  "/antigravity", "set up antigravity", "sync antigravity", or "get this
  project working in Antigravity".
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

1. **Sources are read-only.** `CLAUDE.md`, `AGENTS.md`, `.claude/rules/`,
   `.claude/settings.json`, `.mcp.json` are inputs. Never edit or trim
   them to fit the target.
2. **Prefer the installer over hand-rolling.** Soloship HAS an
   antigravity target: `npx soloship init --agent antigravity` /
   `npx soloship upgrade --agent antigravity`, plus the global plugin
   sync (`npm run antigravity:install-local` from the Soloship repo,
   landing in `~/.gemini/config/plugins/soloship`). Run those — don't
   reimplement them (Antigravity itself once proposed rebuilding this
   installer because it didn't look for it; don't repeat that).
3. **Real copies, never symlinks.** `ln -s ../.claude/rules .agents/rules`
   makes Soloship's installer write future Antigravity-only rules
   straight into `.claude/rules/` (verified against `installRulesAt()`,
   2026-08-15).
4. **Syncing config does not certify the tool.** The final report must
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

## Phase 3 — Sync

1. **Installer first:** `init`/`upgrade --agent antigravity`, then the
   global plugin sync if the Soloship repo is on this machine. Re-run
   `npx soloship doctor` — antigravity must be 3/3. Doctor output is the
   evidence; paste the relevant lines in the report. (1/3 with only the
   global plugin present means the per-project `.agents/` directory is
   missing — the installer creates it.)
2. **Close the drift gap the installer misses:** diff `.claude/rules/`
   against `.agents/rules/` by filename AND content hash; copy any rule
   absent or stale, byte-identical. List every file moved — each is a
   candidate to fold into `src/rules.ts` (suggest it; the change belongs
   to the Soloship repo).
3. **Project without Soloship:** create `.agents/rules/` and copy all
   `.claude/rules/*.md` verbatim. Confirm root `AGENTS.md` exists
   (Antigravity reads it natively); report a gap rather than inventing
   one. Do not create `GEMINI.md` unless current docs (Phase 5) say the
   project-level file is still meaningful alongside `AGENTS.md`.
4. **Hooks:** `.agents/hooks.json` comes from the installer. Antigravity's
   docs now also list a Hooks section — in Phase 5, check whether new
   hook capabilities can carry more of the Claude Code / Soloship gates,
   and propose mappings in the report. Every gate with no counterpart is
   listed as **protection absent in Antigravity**.

## Phase 4 — MCP servers

If `.mcp.json` exists: list servers by name, ask the user which to make
available in Antigravity (multi-select). Configure them per Antigravity's
current MCP docs (location and schema verified in Phase 5 before
writing — the docs tree has separate MCP pages for the app, IDE, and
CLI; pick the surface the user actually uses). Secrets: placeholder plus
a manual step unless the target file is confirmed outside the repo or
gitignored.

## Phase 5 — Live docs check

Fetch Antigravity's current docs — start at
`https://antigravity.google/docs/getting-started` and follow the nav
(as of 2026-08: `/docs/rules-workflows/`, `/docs/ide/rules/`,
`/docs/mcp/`, `/docs/agent-settings/`, `/docs/permissions/`,
`/docs/hooks/`). If URLs moved, search. Compare against Phase 3: rules
directory and activation modes unchanged? New hook/skill surfaces?
App-level settings go into a **numbered manual-steps list written for a
non-coder** — exact menu path, exact value, one line on why. Two
settings always get an explicit recommendation with reasoning:

- **Terminal policy:** recommend NOT Turbo (auto-executes commands; an
  uncertified agent with Turbo is unauthorized-write-by-default).
- **Review triggers:** recommend Request Review (or the strictest
  available) until the tool passes certification.

## Phase 6 — Verify, record, commit

- `npx soloship doctor` 3/3 on antigravity, file counts match the delta,
  every copied rule content-identical to source (`shasum` both sides).
- Write the manifest to `.ai/sync-state/antigravity.json`.
- Commit generated `.agents/` files per project conventions (worktree
  rules apply).

## Phase 7 — Report (always, in this order)

1. **Delta** since last run (or "first run — full setup").
2. **Synced:** what Antigravity now gets (doctor lines + drift-gap
   list + plugin syncedAt).
3. **Protections absent in Antigravity:** every hook/gate with no
   counterpart, named, with what it guarded — plus any hook proposals
   from the new docs.
4. **Manual steps:** the numbered list from Phase 5, including the
   terminal-policy and review-trigger recommendations.
5. **MCP:** mirrored / skipped / placeholders.
6. **Injection verification (user-run, in Antigravity):** files on disk
   don't prove rules reach the model. Give the user this exact check to
   run in a fresh Antigravity session after a full app restart: ask
   *"Read the file at .agents/rules/plan-claim-verification.md and tell
   me what it says. Separately: what governance rules do you have loaded
   right now, and from where?"* — if it can read the file when pointed
   at it but doesn't spontaneously know `.agents/rules/` exists, the
   injection isn't working (observed 2026-08-15).
7. **Certification reminder:** config synced ≠ tool trusted — run the
   battery SOP before granting write access; until then, proposal-only.
