---
name: cursor
description: |
  Set up or re-sync the current project to run in Cursor — including Cursor
  CLOUD agents, which load nothing but committed project config. Checks
  Cursor's LIVE docs first (mechanics drift — never build from remembered
  facts), runs Soloship's cursor target (always-on .mdc rules + native
  .cursor/hooks.json gates), closes the bespoke-rule drift gap the installer
  can't know about, mirrors MCP servers, and reports the manual settings steps
  plus every protection that still has no Cursor counterpart. Use when asked
  "/cursor", "set up cursor", "sync cursor", or "get this project working in
  Cursor".
---

# /cursor — Project Environment Sync for Cursor

Make this project's governance fully available to Cursor, from whatever state
it's in now. Idempotent: first run sets everything up; later runs sync only
what changed and report what's new.

**The failure this skill exists to prevent:** a Cursor **cloud agent** running
on this repo with zero guardrails. Cloud agents load committed
`.cursor/hooks.json` (plus team/enterprise hooks) and **nothing else** — not
`~/.cursor/hooks.json`, not Claude Code hooks, not any IDE toggle. Soloship
writes its Claude gates to `.claude/settings.local.json`, which is gitignored
in most projects. So until this skill has run **and its output is committed**,
a Cursor cloud agent is not on rails at all.

## Gates (binding in every posture — violating any is a failed run)

1. **Docs before build.** The live docs check (Phase 3) runs BEFORE any
   generation. Target mechanics drift between runs — verified twice: Cursor
   added native `.claude/skills/` loading, then shipped a full native hooks
   system, both after earlier drafts of this skill were written. Building from
   remembered facts and checking docs afterward is the failure class this
   ordering prevents. **Record the docs-check date you actually ran** in the
   report — never copy a date forward from this file.
2. **Sources are read-only.** `CLAUDE.md`, `AGENTS.md`, `.claude/rules/`,
   `.claude/skills/`, `.claude/settings.json`, `.mcp.json` are inputs. Never
   edit, trim, or restructure them to fit the target.
3. **Real copies, never symlinks.** A symlinked rules dir routes other tools'
   installers into `.claude/rules/` (verified failure, 2026-08-15).
4. **Generated files carry a header** so nobody edits the copy:
   `<!-- GENERATED from <source> by /soloship:cursor. Edit the source, then re-run. -->`
   (`.cursor/hooks.json` is the one exception — JSON has no comment syntax.
   Its provenance lives in the scripts it points at and in the report.)
5. **Generated config must be COMMITTED.** Uncommitted `.cursor/` config is
   invisible to cloud agents. A run that generates but does not commit has not
   delivered the protection — say so explicitly if the project's git state
   blocks the commit.
6. **Syncing config does not certify the tool.** Rules present ≠ rules
   followed (proven repeatedly, 2026-08-15). The final report must say so and
   point to the workspace's certification battery if one exists (default
   location: `docs/testing/model-certification/SOP.md`).

## Phase 1 — Discover the source surface

Inventory, with paths: `CLAUDE.md`, `AGENTS.md`, every `.claude/rules/*.md`,
`.claude/skills/` (names + descriptions only), `.claude/settings.json` and
`.claude/settings.local.json` hooks, `.mcp.json`, plus any existing `.cursor/`
config and legacy `.cursorrules`. Record Soloship presence
(`.soloship/version`) and run `npx soloship doctor`, keeping the **Cursor**
section lines — the required items are `.cursor/hooks.json` and
`.cursor/rules`.

## Phase 2 — What's new since last run

State lives at `.ai/sync-state/cursor.json`:
`{ "syncedAt": ISO-8601, "files": { "<source path>": "<sha256>" } }`.

- Hash every discovered source (`shasum -a 256`). Compare against the
  manifest: **new**, **changed**, **removed**, **unchanged**.
- No manifest = first run: everything is new. Say so.
- Removed sources: delete their generated `.cursor/rules/` counterparts — but
  verify the generated file's header actually names the removed source before
  deleting anything.

## Phase 3 — Live docs check (BEFORE generating anything)

Fetch Cursor's current docs — `https://cursor.com/docs/hooks`,
`https://cursor.com/docs/reference/third-party-hooks`,
`https://cursor.com/docs/context/rules`, `https://cursor.com/docs/context/skills`,
`https://cursor.com/docs/context/mcp` — and scan `https://cursor.com/changelog`
for anything newer. If a URL 404s or redirects, search for the current
location; docs move. (`https://cursor.com/docs/hooks.md` serves the raw
markdown, which is faster to diff than the rendered page.)

**Baseline as last verified 2026-08-18 — confirm each item, don't assume:**

- **Rules:** `.cursor/rules/*.mdc` with YAML frontmatter (`description`,
  `globs`, `alwaysApply`). **A plain `.md` file in that directory is silently
  ignored** — it has no frontmatter, so the rules system skips it. Docs now
  also advise keeping an individual rule under ~500 lines.
- **`AGENTS.md`** at root (and nested) is read natively.
- **`CLAUDE.md` is NOT read natively.**
- **Skills:** Cursor natively loads `.cursor/skills/`, `.agents/skills/`,
  their `~` equivalents, and — for compatibility — `.claude/skills/`,
  `.codex/skills/`, `~/.claude/skills/`, `~/.codex/skills/`. **Do not
  duplicate skills into `.cursor/skills/`** unless this phase finds the
  compatibility path gone.
- **Hooks — Cursor has a native system.** This is the item that was wrong in
  every earlier version of this skill:
  - Config file: `.cursor/hooks.json` (project), `~/.cursor/hooks.json`
    (user), plus team/enterprise. Schema:
    `{ "version": 1, "hooks": { "<event>": [ { "command", "type", "timeout",
    "matcher", "failClosed", "loop_limit" } ] } }`.
  - **`timeout` is in SECONDS**, not milliseconds. Copying Claude's
    millisecond values across is the classic porting bug.
  - Payload arrives as **JSON on stdin**. `$HOOK_TOOL_INPUT` is a Claude Code
    -ism and does not exist here. `beforeShellExecution` gets `command`/`cwd`;
    `preToolUse` gets `tool_name`/`tool_input`; `beforeReadFile` and
    `afterFileEdit` get `file_path`.
  - Blocking is `{"permission":"deny", "user_message", "agent_message"}` on
    stdout, or exit code 2. Other non-zero exits **fail OPEN** unless
    `failClosed: true`. The `stop` hook instead returns
    `{"followup_message": "..."}`, which Cursor auto-submits as the next user
    message (`loop_limit`, default 5).
  - Project-hook script paths resolve **from the project root** —
    `.cursor/hooks/x.js`, not `./hooks/x.js` (that form is for user hooks).
  - Env: `CURSOR_PROJECT_DIR` and `CLAUDE_PROJECT_DIR` are both set.
  - **Cloud agents:** run `beforeShellExecution`, `preToolUse`, `postToolUse`,
    `beforeReadFile`, `afterFileEdit`, `stop`, `subagentStop`,
    `beforeSubmitPrompt`, `preCompact` — and **not** `sessionStart`,
    `sessionEnd`, MCP hooks, Tab hooks, or `workspaceOpen`. They load project
    + team + enterprise hooks only, never `~/.cursor/hooks.json`, and run
    **command-based hooks only** (prompt hooks need auth the cloud VM lacks).
- **Third-party (Claude Code) hooks:** Cursor can read `.claude/settings.json`,
  `.claude/settings.local.json`, and `~/.claude/settings.json` — **in the IDE
  only**, and **only when** Settings → Rules, Skills, Subagents → "Include
  third-party Plugins, Skills, and other configs" is on. Event mapping:
  `PreToolUse→preToolUse`, `PostToolUse→postToolUse`, `Stop→stop`,
  `SessionStart→sessionStart`, `SessionEnd→sessionEnd`,
  `UserPromptSubmit→beforeSubmitPrompt`, `SubagentStop→subagentStop`,
  `PreCompact→preCompact`. Tool mapping: `Bash→Shell`, `Edit→Write`,
  `Write→Write`, `Read→Read`, `Grep→Grep`, `Task→Task`; `Glob`, `WebFetch`,
  `WebSearch` are unsupported. **This is a second path, never a substitute** —
  it does nothing for cloud agents.
- **MCP:** `.cursor/mcp.json`, top-level `mcpServers`, per-server `command` /
  `args` / `env` / `type` / `url` / `headers`, with `${env:VAR}` expansion.

This phase outputs the verified mapping (native vs needs-conversion, and in
what format) that Phase 4 executes, plus a **numbered manual-steps list
written for a non-coder** for anything that is a Cursor-app setting — exact
menu path, exact value, one line on why.

## Phase 4 — Sync (per Phase 3's verified mapping)

1. **Installer first.** Soloship HAS a cursor target as of the first release
   after 0.26.0: `npx soloship init --agent cursor` /
   `npx soloship upgrade --agent cursor` (also covered by `--agent all`, and by
   `auto` when `.cursor/` exists **or** the `cursor` CLI is on PATH — the same
   detection shape the antigravity target uses). It writes:
   - `.cursor/rules/*.mdc` — the packaged workflow rules, always-on
     (`alwaysApply: true`, `globs: ""`), each with a GENERATED header.
   - `.cursor/hooks.json` + executable `.cursor/hooks/soloship-*.js` — the
     mechanical gates (below). The installer **merges** into an existing
     hooks.json, keeping any entry whose command isn't a `soloship-` script,
     so a user's own hooks survive a re-run.

   Run it, then `npx soloship doctor` and paste the Cursor section into the
   report. If Phase 3 found the installer's output no longer matches what
   Cursor reads, **stop and surface that as a Soloship bug** rather than
   patching around it by hand.

   *Project without Soloship installed:* generate the same shapes by hand,
   following Phase 3's verified schema exactly.

2. **Close the drift gap the installer can't know about.** The installer ships
   the *packaged* rule set; this project may carry bespoke rules. Diff
   `.claude/rules/*.md` against `.cursor/rules/*.mdc` by stem. For each rule
   present in `.claude/rules/` but missing or stale in `.cursor/rules/`,
   generate `<name>.mdc`: body copied verbatim under the GENERATED header,
   frontmatter `alwaysApply: true`, `globs: ""`, `description:` the rule's H1
   title. Soloship projects inject rules unconditionally by design — partial
   delivery is worse than token cost. List every file you moved; each is a
   candidate to fold into `src/rules.ts` (suggest it; that change belongs in
   the Soloship repo).

3. **CLAUDE.md → `.cursor/rules/000-project-map.mdc`** (`alwaysApply: true`),
   containing CLAUDE.md verbatim under the GENERATED header. If Phase 3 ever
   finds Cursor reads CLAUDE.md natively, skip generation and delete the
   previously generated copy.

   **First check whether CLAUDE.md is gitignored** (`git check-ignore -q
   CLAUDE.md`). If it is, do NOT generate the project map: Gate 5 requires
   generated config to be committed, so generating it would publish a file the
   project deliberately keeps out of git. Report the conflict and ask — the
   user may want a redacted map, or may accept that Cursor goes without one.
   (Hit for real in Soloship's own repo, 2026-08-18.)

4. **AGENTS.md:** read natively — confirm it exists at root; if the project
   has none, report that gap, don't invent one.

5. **Skills:** native via the compatibility paths (per Phase 3) — nothing to
   generate; list them in the report as native.

6. **Hooks — verify what the installer produced, and what it does NOT cover.**
   The generated gates are:

   | Cursor event | Script | Guards |
   |---|---|---|
   | `beforeShellExecution` | `soloship-command-safety.js` | `rm -rf` targeting home/root (including subpaths), direct `.env` writes, force-push to main/master (flag in any position), hardcoded API keys, production deploys off the default branch |
   | `preToolUse` (matcher `Write\|Delete`) | `soloship-file-protection.js` | `.soloship/version`, direct `.env` writes via the file tool, `docs/plans/` frontmatter + status vocabulary, the plan done-checklist |
   | `stop` | `soloship-plan-truth.js` | a plan still claiming open status after its branch merged |

   Every script reads stdin JSON, answers `{"permission":...}` (or
   `{"followup_message":...}` for `stop`), and **fails open** on an
   unparseable payload — a gate that bricks the agent gets deleted, and then
   it guards nothing. `preToolUse` `tool_input` key names for Cursor's Write
   tool are undocumented, so the script reads every plausible key.

   Everything Soloship gates in Claude Code but does NOT gate here goes in the
   report as **protection absent in Cursor** — never silently dropped. As of
   the 2026-08-18 build that list is: the semgrep security scan, the
   phone-a-friend commit warnings, the billing/credit confirmation gate, the
   recurrence gate, deploy-freshness, the worktree/dirty-tree/deploy-lock half
   of deploy discipline, the plan-truth **commit** and plan-**merge** gates,
   CHANGELOG and live-data-evidence warnings, the duplicate-component warn,
   and everything on `SessionStart`/`SessionEnd` (session registration,
   checkpoint commit, upgrade check, browser-claim and deploy-lock release) —
   the last group is structurally unavailable to cloud agents, which never
   fire those events.

7. **Legacy `.cursorrules`:** if present, fold anything unique into the
   generated set, then propose its deletion (ask, don't auto-delete).

## Phase 5 — MCP servers

If `.mcp.json` exists: **mirror every server into `.cursor/mcp.json` by
default** — don't stall the run on a multi-select. Report what was mirrored;
the user can prune afterward. Only ask when a specific entry needs a judgment
call the report can't make (a paid/rate-limited service, or a server the
project marks as local-only).

Secrets: check whether `.cursor/mcp.json` is gitignored **before** writing.
If it is not, write the entry with a `${env:VAR}` reference or a placeholder
and put the real-value step in the manual-steps list. Never commit a live key.

Note in the report that Cursor's docs do not confirm cloud agents read
project-level `.cursor/mcp.json` (team MCP servers are the documented cloud
path) — so treat MCP availability in cloud runs as unverified, not promised.

## Phase 6 — Verify, record, commit

- Every generated `.mdc` has valid frontmatter (all three keys) and the
  GENERATED header. Count generated files vs. sources — numbers must match the
  delta.
- `.cursor/hooks.json` parses, every `command` path exists, and every script
  is executable (`ls -l .cursor/hooks/`). Smoke-test at least the shell gate:
  `printf '%s' '{"command":"rm -rf ~"}' | .cursor/hooks/soloship-command-safety.js`
  must print `"permission":"deny"`. A script that crashes fails OPEN — Cursor
  will report nothing and the gate will protect nothing.
- Write the updated manifest to `.ai/sync-state/cursor.json`.
- **Commit the generated `.cursor/` files** per the project's git conventions
  (worktree rules apply). This is Gate 5, not a formality — uncommitted config
  does not exist as far as a cloud agent is concerned. `.ai/` state stays
  uncommitted if the project gitignores it.

## Phase 7 — Report (always, in this order)

1. **Docs-check date + anything that changed** in Cursor's mechanics since the
   last run. Use the date you actually fetched the docs.
2. **Delta:** what was new / changed / removed since the last run (or "first
   run — full setup").
3. **Synced:** what Cursor now gets, split **native** (AGENTS.md, skills via
   the compatibility paths) vs **generated** (rules `.mdc`, project-map,
   `.cursor/hooks.json` + scripts) — with the doctor Cursor lines as evidence.
4. **Cloud-agent status — state this plainly.** Which gates now run for a
   Cursor cloud agent, and the fact that they run **only because
   `.cursor/hooks.json` and its scripts are committed**. If they are not
   committed yet, the honest answer is "cloud agents are still unprotected."
   Name the `sessionStart`/`sessionEnd` protections that can never run there.
5. **Protections absent in Cursor:** the Phase 4.6 list — every gate with no
   counterpart, named, with what it guarded. This is the honest cost of using
   Cursor here.
6. **Manual steps:** the numbered non-coder list from Phase 3, always
   including the third-party toggle:
   1. Open Cursor → **Settings** (`Cmd+Shift+J` on Mac) → **Rules, Skills,
      Subagents**.
   2. Turn ON **"Include third-party Plugins, Skills, and other configs."**
      Why: this makes Cursor *also* read the Claude Code hooks in
      `.claude/settings.local.json` while you're working in the Cursor app —
      a second layer on top of `.cursor/hooks.json`. It does **nothing** for
      cloud agents, so it is an addition, never a replacement.
   3. Restart Cursor so the new rules and hooks load.
7. **MCP:** which servers mirrored, which skipped, any secret placeholders,
   plus the cloud-agent caveat.
8. **Certification reminder:** config synced ≠ tool trusted. If the workspace
   has a certification battery, say: run its SOP before granting Cursor write
   access; until then it's proposal-only.
