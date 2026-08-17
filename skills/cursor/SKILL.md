---
name: cursor
description: |
  Set up or re-sync the current project to run in Cursor. Checks
  Cursor's LIVE docs first (mechanics drift — never build from
  remembered facts), reads the project's governance surface (CLAUDE.md,
  AGENTS.md, .claude/rules/, skills, hooks, .mcp.json), diffs against
  the last sync, generates Cursor-native config for the gaps
  (.cursor/rules/*.mdc, .cursor/mcp.json), and reports the manual
  settings steps. Use when asked "/cursor", "set up cursor", "sync
  cursor", or "get this project working in Cursor".
---

# /cursor — Project Environment Sync for Cursor

Make this project's governance fully available to Cursor, from whatever
state it's in now. Idempotent: first run sets everything up; later runs
sync only what changed and report what's new.

Soloship has **no native Cursor target** yet (`src/rules.ts` builds
claude/codex/antigravity only) — this skill does the conversion itself.
If `npx soloship doctor` ever reports a cursor target, run the installer
instead and demote Phase 4 here to a verification pass. The durable fix
is a real `--agent cursor` target in Soloship's source; suggest it in
the report whenever this skill does conversion work by hand.

## Gates (binding in every posture — violating any is a failed run)

1. **Docs before build.** The live docs check (Phase 3) runs BEFORE any
   generation. Target mechanics drift between runs — verified example:
   Cursor added native `.claude/skills/` loading that an earlier draft
   of this skill didn't know about. Building from remembered facts and
   checking docs afterward is the failure class this ordering prevents.
   The report records the docs-check date.
2. **Sources are read-only.** `CLAUDE.md`, `AGENTS.md`,
   `.claude/rules/`, `.claude/skills/`, `.claude/settings.json`,
   `.mcp.json` are inputs. Never edit, trim, or restructure them to fit
   the target.
3. **Real copies, never symlinks.** A symlinked rules dir routes other
   tools' installers into `.claude/rules/` (verified failure,
   2026-08-15).
4. **Generated files carry a header** so nobody edits the copy:
   `<!-- GENERATED from <source> by /soloship:cursor. Edit the source, then re-run. -->`
5. **Syncing config does not certify the tool.** Rules present ≠ rules
   followed (proven repeatedly, 2026-08-15). The final report must say
   so and point to the workspace's certification battery if one exists
   (default location: `docs/testing/model-certification/SOP.md`).

## Phase 1 — Discover the source surface

Inventory, with paths: `CLAUDE.md`, `AGENTS.md`, every
`.claude/rules/*.md`, `.claude/skills/` (names + descriptions only),
`.claude/settings.json` hooks, `.mcp.json`, plus any existing `.cursor/`
config and legacy `.cursorrules`.

## Phase 2 — What's new since last run

State lives at `.ai/sync-state/cursor.json`:
`{ "syncedAt": ISO-8601, "files": { "<source path>": "<sha256>" } }`.

- Hash every discovered source (`shasum -a 256`). Compare against the
  manifest: **new**, **changed**, **removed**, **unchanged**.
- No manifest = first run: everything is new. Say so.
- Removed sources: delete their generated `.cursor/rules/` counterparts
  — but verify the generated file's header actually names the removed
  source before deleting anything.

## Phase 3 — Live docs check (BEFORE generating anything)

Fetch Cursor's current docs — start at
`https://cursor.com/docs/context/rules` and
`https://cursor.com/docs/context/skills`, plus the hooks, MCP, and
settings pages linked from there, and scan
`https://cursor.com/changelog` for anything newer than the docs. If a
URL 404s or redirects, search for the current location — docs move.

Baseline as last verified (2026-08-16 — confirm each item, don't
assume):

- Project rules: `.cursor/rules/*.mdc` with YAML frontmatter
  (`description`, `globs`, `alwaysApply`); **plain `.md` files in that
  directory are silently ignored**.
- Root `AGENTS.md` (and nested ones) read natively.
- **Skills: Cursor natively loads `.claude/skills/` and
  `~/.claude/skills/` (and `.codex/skills/`) for compatibility** — no
  conversion needed.
- `CLAUDE.md` itself: NOT read natively.

This phase outputs the verified mapping (native vs needs-conversion,
and in what format) that Phase 4 executes, plus a **numbered
manual-steps list written for a non-coder** for anything that's a
Cursor-app setting (UI toggles, model selection, autonomy/permissions)
— exact menu path, exact value, one line on why.

## Phase 4 — Generate Cursor-native config (per Phase 3's verified mapping)

1. **Rules:** each new/changed `.claude/rules/<name>.md` →
   `.cursor/rules/<name>.mdc`. Body copied verbatim under the GENERATED
   header. Frontmatter: `alwaysApply: true`, `globs: ""`,
   `description:` the rule's H1 title. Default everything to always-on
   — Soloship projects inject rules unconditionally by design, and
   partial delivery is worse than token cost. If the total exceeds
   ~3,000 lines, flag it in the report and propose (don't apply) a
   split into description-triggered rules.
2. **CLAUDE.md:** not read natively (re-confirmed in Phase 3 each run).
   Generate `.cursor/rules/000-project-map.mdc` (`alwaysApply: true`)
   containing CLAUDE.md verbatim under the GENERATED header. If
   Phase 3 ever finds Cursor reads it natively, skip generation and
   delete the previously generated copy.
3. **AGENTS.md:** read natively — confirm it exists at root; if the
   project has none, report that gap, don't invent one.
4. **Skills:** native via `.claude/skills/` (per Phase 3) — nothing to
   generate; list them in the report as native.
5. **Hooks:** Claude Code hooks in `.claude/settings.json` (and
   Soloship's PreToolUse gates) have no automatic Cursor equivalent
   unless Phase 3 found one. Translate only what maps cleanly.
   Everything that doesn't map goes in the report as **protection
   absent in Cursor** — never silently dropped.
6. **Legacy `.cursorrules`:** if present, fold anything unique into the
   generated set, then propose its deletion (ask, don't auto-delete).

## Phase 5 — MCP servers

If `.mcp.json` exists: list its servers by name and ask the user which
should be available in Cursor (multi-select). Mirror the chosen entries
into `.cursor/mcp.json` (schema verified in Phase 3). Flag any entry
whose `env` carries secrets — confirm the file is gitignored before
writing secrets into it; if not, write the entry with a placeholder and
put the real-value step in the manual-steps report.

## Phase 6 — Verify, record, commit

- Every generated `.mdc` has valid frontmatter (all three keys) and the
  GENERATED header. Count generated files vs. sources — numbers must
  match the delta.
- Write the updated manifest to `.ai/sync-state/cursor.json`.
- Commit generated `.cursor/` files per the project's git conventions
  (worktree rules apply). `.ai/` state stays uncommitted if the project
  gitignores it.

## Phase 7 — Report (always, in this order)

1. **Docs-check date + anything that changed** in Cursor's mechanics
   since the last run.
2. **Delta:** what was new / changed / removed since the last run (or
   "first run — full setup").
3. **Synced:** what Cursor now gets, split **native** (AGENTS.md,
   skills via `.claude/skills/`) vs **generated** (rules `.mdc`,
   project-map).
4. **Protections absent in Cursor:** every Claude Code hook/gate with
   no counterpart — named, with what it guarded. This is the honest
   cost of using Cursor here.
5. **Manual steps:** the numbered settings list from Phase 3.
6. **MCP:** which servers mirrored, which skipped, any secret
   placeholders.
7. **Certification reminder:** config synced ≠ tool trusted. If the
   workspace has a certification battery, say: run its SOP before
   granting Cursor write access; until then it's proposal-only.
