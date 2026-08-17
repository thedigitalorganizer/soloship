---
name: grok
description: |
  Set up or re-sync the current project to run in Grok Build (xAI's
  coding agent CLI). Verification-first: runs `grok inspect` to see what
  Grok actually discovered, bridges only the gaps, mirrors user-chosen
  MCP servers, checks Grok Build's live docs, and reports manual
  settings steps. Use when asked "/grok", "set up grok", "sync grok",
  "grok build", or "get this project working in Grok".
---

# /grok — Project Environment Sync for Grok Build

Make this project's governance fully available to Grok Build, from
whatever state it's in now. Idempotent: first run sets everything up;
later runs sync only what changed and report what's new.

**This skill is verification-first, unlike the cursor/codex/antigravity
skills.** Secondary sources claim Grok Build auto-reads `CLAUDE.md`,
`.claude/` (rules, skills, hooks), `.mcp.json`, and the AGENTS.md family
with zero config — but as of 2026-08-16 xAI's primary docs confirm only
`~/.grok/config.toml` and the `grok inspect` discovery command, not the
Claude-compat claim. So: never assume the compat story; run
`grok inspect` and treat its output as the ground truth for what
actually loaded. If the compat claim holds, this skill mostly verifies
and records; if it doesn't, it bridges.

## Gates (binding in every posture — violating any is a failed run)

1. **Sources are read-only.** `CLAUDE.md`, `AGENTS.md`, `.claude/rules/`,
   `.claude/settings.json`, `.mcp.json` are inputs. Never edit or trim
   them to fit the target.
2. **Discovery evidence over vendor claims.** A capability counts as
   working only when `grok inspect` (or an equivalent observable check)
   shows it loaded. Marketing pages and third-party writeups are leads,
   not evidence.
3. **Real copies, never symlinks** if any bridging is needed (symlinked
   rule dirs corrupt other tools' installers — verified failure,
   2026-08-15).
4. **Syncing config does not certify the tool.** Grok-class models have
   a documented false-completion failure in this workspace's history
   (2026-08-15: argued a plan was done against its own cited evidence).
   The final report must say config ≠ trust and point to the workspace's
   certification battery if one exists (default:
   `docs/testing/model-certification/SOP.md`).

## Phase 1 — Discover the source surface + Grok's own view

1. Inventory sources: `CLAUDE.md`, `AGENTS.md`, every
   `.claude/rules/*.md`, `.claude/skills/` (names only),
   `.claude/settings.json` hooks, `.mcp.json`, `~/.grok/config.toml`,
   and any prior `.ai/sync-state/grok.json`.
2. Confirm the CLI exists (`grok --version` or `which grok`); if not
   installed, stop and give the user the install pointer from current
   docs — don't install a coding agent without being asked.
3. Run **`grok inspect`** in the project root and capture the full
   output. This is the map of what Grok discovers natively: config
   sources, instructions, skills, plugins, hooks, MCP servers.

## Phase 2 — What's new since last run

State lives at `.ai/sync-state/grok.json`:
`{ "syncedAt": ISO-8601, "files": { "<source path>": "<sha256>" },
"inspectSummary": "<one-line digest of grok inspect>" }`.

Hash every source (`shasum -a 256`), diff against the manifest: **new /
changed / removed / unchanged**. Also diff the current `grok inspect`
digest against the recorded one — Grok-side discovery changes (a CLI
update starting or stopping to read something) are report-worthy even
when no source file changed. No manifest = first run, say so.

## Phase 3 — Bridge the gaps only

Compare the source inventory against what `grok inspect` shows loaded:

1. **Discovered natively** (e.g. AGENTS.md, or the whole `.claude/`
   tree if the compat claim holds): nothing to generate — record it as
   verified-native in the report, with the inspect lines as evidence.
2. **Not discovered:** bridge per Grok Build's current docs (Phase 4)
   — its user guide documents instructions, skills, plugins, hooks,
   and MCP configuration. Prefer the highest-fidelity bridge available
   (its instructions mechanism for rules content); every generated
   file carries the header
   `<!-- GENERATED from <source> by /soloship:grok. Edit the source, then re-run. -->`.
3. **Hooks:** Claude Code / Soloship PreToolUse gates are load-bearing
   protections. Check Grok's hooks docs for real lifecycle equivalents;
   map what maps cleanly, and list everything that doesn't as
   **protection absent in Grok Build** — never silently dropped.
4. Re-run `grok inspect` after bridging — the delta between the two
   inspect outputs is the proof the bridge worked.

## Phase 4 — Live docs check

Fetch Grok Build's current docs — start at
`https://docs.x.ai/build/overview` and the user guide in the repo
(`github.com/xai-org/grok-build`, user guide under
`crates/codegen/xai-grok-pager/docs/user-guide/`: configuration, MCP
servers, skills, plugins, hooks, headless mode, sandboxing). If URLs
moved, search. Confirm: discovery behavior for the AGENTS.md family and
`.claude/` (this settles Phase 3's native-vs-bridge split), MCP config
shape, hooks capabilities, sandboxing/approval settings. App-level
settings go into a **numbered manual-steps list written for a
non-coder** — exact command or menu path, exact value, one line on
why. Headless/automation notes (e.g. `--no-auto-update`) go here too.

## Phase 5 — MCP servers

If `.mcp.json` exists and `grok inspect` doesn't already show its
servers loaded: list servers by name, ask the user which to make
available in Grok (multi-select), and configure them per the current
docs (location verified in Phase 4 before writing — likely
`~/.grok/config.toml` or a project file). Secrets: placeholder plus a
manual step unless the target file is confirmed outside the repo or
gitignored. Verify with a final `grok inspect` that the chosen servers
appear.

## Phase 6 — Verify, record, commit

- Final `grok inspect` shows: every source either natively discovered
  or bridged; chosen MCP servers present. Paste the relevant lines.
- Write the manifest (hashes + inspect digest) to
  `.ai/sync-state/grok.json`.
- Commit any generated project files per project conventions (worktree
  rules apply). `~/.grok/config.toml` changes are machine-level — list
  them in the report instead of committing.

## Phase 7 — Report (always, in this order)

1. **Delta** since last run — source changes AND Grok-side discovery
   changes (or "first run — full setup").
2. **Verified native vs bridged:** two lists, each backed by
   `grok inspect` lines. This is the report's core — it converts the
   vendor's compat claim into observed fact for this project.
3. **Protections absent in Grok Build:** every hook/gate with no
   counterpart, named, with what it guarded.
4. **Manual steps:** the numbered list from Phase 4.
5. **MCP:** loaded natively / configured / skipped / placeholders.
6. **Certification reminder:** config synced ≠ tool trusted — and note
   Grok's specific history here (false-completion, 2026-08-15). Run the
   battery SOP before granting write access; until then, proposal-only.
