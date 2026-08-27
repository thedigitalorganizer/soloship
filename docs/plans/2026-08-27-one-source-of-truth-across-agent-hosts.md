---
status: planned
date: 2026-08-27
updated: 2026-08-27
producer: manual
version: 1
ttl_days: 30
---

# feat: One source of truth across five agent hosts

A Soloship project should carry the same instructions, safety gates, and skills into Claude Code, Cursor, Codex, Antigravity, and Grok Build — from one set of files, with no hand-maintained copies — and `npx soloship upgrade` should get an existing project there in one run, deleting everything that is dead weight along the way.

Research behind this plan was done live against each vendor's docs on 2026-08-27 (five parallel research agents; sources listed at the end). The findings that change the design:

1. **Four of five hosts read `AGENTS.md` natively** (Cursor, Codex, Antigravity root-only, Grok). Claude Code is the only one that does not, and Anthropic's own docs supply the bridge: a `CLAUDE.md` whose first line is `@AGENTS.md` (an import — inlined at load, not a request the model can skip).
2. **Three of five read skills from `.agents/skills/` natively** (Cursor, Codex, Antigravity; Grok confirmed for the user-level `~/.agents/skills/` and for `.claude/skills/` via its Claude-compat layer). Claude Code reads only `.claude/skills/`, but follows symlinks and dedupes.
3. **There is no cross-host surface for always-on rules.** Codex has none at all — `.codex/rules/` is command-approval policy in Starlark, and markdown there is ignored. Cursor reads only `.cursor/rules/*.mdc`. Antigravity reads `.agents/rules/`. The only always-on text every host reads is `AGENTS.md`.
4. **There is no cross-host hook format, but there is a cross-host hook *contract*:** Claude Code, Codex, Antigravity, and Cursor all deliver the event as JSON on stdin. None of them sets a `$HOOK_TOOL_INPUT` or `$HOOK_MODIFIED_FILE` environment variable. Verified two ways for Claude Code: the official hooks reference lists neither, and `grep` of the installed 2.1.247 binary finds zero occurrences of either name (versus 25 for `CLAUDE_PROJECT_DIR`).
5. **Consequence of (4): most Soloship Claude gates are inert today.** Every generated script that begins `TI="$HOOK_TOOL_INPUT"; [ -z "$TI" ] && exit 0` — billing confirmation, recurrence, plan-truth, plan-merge, plan-namespace, command safety, deploy freshness, deploy discipline — exits silently on every call. Gates that read stdin (session registration, deploy lock) work. The Cursor target already does this right (`.cursor/hooks/*.cjs` read stdin). This is the highest-priority item in the plan and it is not a cross-platform feature; it is the cage having holes.

## Goal

After this ships, a project that runs `npx soloship upgrade --agent all` (or is bootstrapped fresh) has:

- Root `AGENTS.md` as the instruction file, `CLAUDE.md` as a one-line import plus any Claude-only appendix, nested `AGENTS.md` intent files unchanged.
- The seven always-on safety gates as short sections inside `AGENTS.md` — no generated rule directories for any host.
- Every hook gate implemented once as a stdin-reading script, wired into Claude, Cursor, Codex (with hooks enabled), and Antigravity. Grok needs nothing.
- Project skills living in `.agents/skills/<name>/SKILL.md` with a `.claude/skills/<name>` symlink per skill.
- All dead config deleted: generated `.codex/rules/*.md`, the orphan `.codex/hooks.json` in its old shape, generated `.cursor/rules/*.mdc`, generated `.agents/rules/*.md`, generated `.claude/rules/*.md`.
- The Claude Code `SessionStart` version check running the mechanical upgrade automatically when the plugin is newer than the project's stamp, and pointing at `/soloship:bootstrap` for the one migration that needs judgment (moving prose from a fat `CLAUDE.md` into `AGENTS.md`).

## Done-When

- A scratch project initialised with `--agent all` is opened in each of the five hosts and each one demonstrably loads the instructions and the skills (evidence per host in the QA Plan).
- The billing gate, tripped on purpose in a Claude Code session, blocks — with the gate's own message in the transcript.
- The same gate, tripped in Codex with hooks enabled, blocks.
- `npx soloship upgrade --agent all` on MAPS deletes its 19 `.codex/rules/*.md` files, its orphan `.codex/hooks.json`, and its generated rule mirrors; converts its three Stripe-skill symlinks to the canonical direction; and prints the bootstrap nudge for its 13 KB `CLAUDE.md`.
- `npx soloship doctor` reports the per-host truth: what each host reads, what is generated, and what is dead — never "rules installed" for a host that cannot read them.
- README, `AGENTS.md`, `CHANGELOG.md`, and `DOC_COUNT_CHECKS` agree with the new counts (rules 0 generated files, hooks N, hosts 5).

## What each host reads (the evidence)

| Surface | Claude Code | Cursor | Codex | Antigravity | Grok Build |
|---|---|---|---|---|---|
| Instructions | `CLAUDE.md` only; `@AGENTS.md` import works (4 hops) | `AGENTS.md` root + nested; ignores `CLAUDE.md` | `AGENTS.md` global + root→cwd nested; 32 KiB combined cap (`project_doc_max_bytes`); `CLAUDE.md` only as fallback | `AGENTS.md` or `GEMINI.md`, root; nested unverified | `AGENTS.md` and `CLAUDE.md` families, nested, plus `.claude/rules/`, `.cursor/rules/`, `.grok/rules/` |
| Always-on rules | `.claude/rules/*.md` (+ `paths:` frontmatter) | `.cursor/rules/*.mdc` only | none (`.codex/rules/*.rules` is Starlark exec policy) | `.agents/rules/*.md`, 12k-char cap | own + reads Claude's and Cursor's |
| Skills | `.claude/skills/`, `~/.claude/skills/`, plugins; not `.agents/skills/`; symlinks followed | `.agents/skills/`, `.cursor/skills/`, compat: `.claude/skills/`, `.codex/skills/` | `.agents/skills/` cwd→root, `~/.agents/skills/` | `.agents/skills/` | `.grok/skills/`, `~/.agents/skills/`, Claude skills via compat |
| Hooks | settings / plugin `hooks.json`; **stdin JSON, no env var** | `.cursor/hooks.json`, own event names; cloud loads committed only | `.codex/hooks.json` or `config.toml [hooks]`; **off until `[features] hooks = true`**; same event names as Claude; stdin only | `.agents/hooks.json`; only `PreToolUse` blocks | `.grok/hooks/*.json`; reads Claude and Cursor hooks directly |
| MCP | `.mcp.json` | `.cursor/mcp.json` | `.codex/config.toml [mcp_servers]` | `.agents/mcp_config.json` | merges Claude, Cursor, `.mcp.json` |
| Plugins | `.claude-plugin/plugin.json`; plugins cannot ship rules | exists | `.codex-plugin/plugin.json`; reads `.claude-plugin/marketplace.json` as compat | subdirectory `skills.json`/`rules.json` | reads Claude marketplaces |

## Phases

### Phase 0 — Prove the inert-gate finding before rewriting anything

**Why:** The finding rests on a binary grep and a docs read. A rewrite of every gate on a wrong premise would be worse than the bug. Ten minutes of evidence first.

1. In a scratch repo with Soloship installed, in a Claude Code session, attempt an edit that the billing gate must block (a file named `billing.ts`). Record whether it blocks.
2. Attempt a deploy-shaped command from a feature branch (deploy-from-main gate). Record.
3. Trip the same two in Cursor via the `.cjs` scripts. Record — these are expected to block.
4. Write the three results into this plan's QA table before Phase 1 starts. If Claude blocks, the finding is wrong: stop, re-investigate how the variable reaches the script, and revise Phase 1 to a no-op.

### Phase 1 — One gate, one script, every host (stdin-first hooks)

**Why:** stdin JSON is the one hook contract all four hook-capable hosts share. Soloship already has the right shape for Cursor (`buildCursorCommandSafetyScript` and siblings — Node scripts under `.cursor/hooks/`). Extending that pattern to Claude fixes the silent gates; extending it to Codex costs almost nothing more because Codex's event names and payload fields mirror Claude's. One source per gate ends the current state where the same gate exists as an inline bash string for Claude, a `.cjs` for Cursor, and a stale copy for Codex.

1. Introduce a project-local gate directory holding one `.cjs` per gate. It must be a **committed** path: Cursor cloud agents load only what is in the clone, so a hooks file pointing at gitignored scripts is a gate that never runs. `.soloship/` ships its own `.gitignore`, so either carve `hooks/` out of it explicitly or use a sibling such as `scripts/soloship-hooks/`; upgrade's change report must list the scripts as files to commit. Gates: `command-safety`, `billing-confirmation`, `recurrence`, `deploy-freshness`, `deploy-discipline`, `plan-truth`, `plan-merge`, `plan-namespace`, `session-register`, `deploy-lock`, `stop-checks`. Each reads the whole of stdin, normalises the payload to `{event, toolName, toolInput, cwd, sessionId}`, and returns the host-neutral verdict `{block: bool, message}`.
2. Per-host adapters are thin and generated: Claude (`.claude/settings.local.json`) maps exit 2 + stderr; Codex (`.codex/hooks.json`) identical mapping, plus `.codex/config.toml` gains `[features] hooks = true`; Antigravity (`.agents/hooks.json`) maps to its `decision` field; Cursor keeps its existing `.cursor/hooks.json` but its scripts become one-line requires of the shared gate. Name the shared field mappings as constants — no per-host string literals scattered through `hooks.ts`.
3. Remove every `$HOOK_TOOL_INPUT` and `$HOOK_MODIFIED_FILE` read from `src/hooks.ts`. The PostToolUse ESLint autofix hook, which depends on `$HOOK_MODIFIED_FILE`, is retired outright (it never ran; CI lints).
4. `installHooks` for Claude stops writing inline bash and writes the adapter entries. The plugin's own `SessionStart` hooks (version check, safety snapshot, session registry) are already stdin-based and stay.
5. `doctor` gains a per-host hook line that states which gates are wired and whether the host's hook feature is enabled (Codex flag; Cursor cloud commit status).

### Phase 2 — Rules live in `AGENTS.md`; generated rule directories go away

**Why:** The 19→7 diet already reduced always-on rules to seven short safety gates. Seven short sections fit in the one file every host reads. Generating the same seven into four host-specific directories is pure duplication for Claude, Cursor, and Antigravity (each also reads `AGENTS.md`) and dead weight for Codex (which never read them). Removing the mirrors also removes the drift class the `/cursor` and `/codex` skills spend most of their length policing.

1. `templates.ts`: `generateAgentsMd` gains a `## Safety gates` section containing the seven rules verbatim (the same shortened text `rules.ts` currently packages). The rule text moves from `rules.ts` constants to a single shared module both can import during transition; after Phase 5 `rules.ts` exports only `RETIRED_WORKFLOW_RULES` plus the new list of retired mirror files.
2. Stop generating: `.claude/rules/<seven>.md`, `.codex/rules/*.md`, `.cursor/rules/<seven>.mdc`, `.agents/rules/<seven>.md`. Upgrade deletes them — only files whose name is on Soloship's own list (or that carry the GENERATED header, for Cursor). User-authored rules in any of those directories are never touched; upgrade lists them and says which hosts can see them (Claude: yes; Cursor: no; Codex: no; Antigravity: no) so the user can decide whether to move them into `AGENTS.md`.
3. `.codex/config.toml` written by init/upgrade raises `project_doc_max_bytes` (constant, default 128 KiB) so a root `AGENTS.md` plus nested intent files does not get truncated at Codex's 32 KiB default. MAPS's root instructions alone are 17.5 KB.
4. Path-scoped rules (Claude `paths:`, Cursor `globs`, Antigravity Glob mode) remain a legitimate host-native feature for users to author by hand; Soloship stops generating any.

### Phase 3 — `AGENTS.md` is the instruction file; `CLAUDE.md` is an import

**Why:** Today Soloship treats `CLAUDE.md` as the fat instruction file and root `AGENTS.md` as a Scope/Owns/Contracts/Pitfalls schema plus "Codex guidance". Four hosts read `AGENTS.md` and only one reads `CLAUDE.md`, so the fat content is in the file with the fewest readers. Inverting puts the instructions where every host looks, and the nested `AGENTS.md` intent layer — unchanged — becomes natively readable by Cursor, Codex, and Grok for the first time (Claude only ever reached it through a prose instruction).

1. `generateAgentsMd` becomes what `generateClaudeMd` is today: name, stack, audience note, related-docs table, project structure, quick commands, intent-layer table, cross-cutting contracts, global invariants, default path, safety gates (Phase 2), conventions. The root Scope/Owns/Key-Files schema is dropped — it restated the file itself. Nested `AGENTS.md` files keep the schema; that is where it carries information.
2. `generateClaudeMd` becomes `@AGENTS.md` followed by a short Claude-only appendix (anything that references `.claude/`-specific mechanics, e.g. the `settings.local.json` note). Add an "Agent surfaces" paragraph to `AGENTS.md` that names, per host, what it reads — replacing the current sentence that claims Codex reads `.codex/rules/`.
3. Migration is judgment work, so it lives in `/soloship:bootstrap`, not in `upgrade`: bootstrap Step 2 and Step 3 swap roles (Step 2 builds/updates `AGENTS.md`; Step 3 reduces `CLAUDE.md` to the import + appendix, moving any Claude-agnostic prose across). `upgrade` only detects the old shape (a `CLAUDE.md` over a size threshold that does not start with `@AGENTS.md`) and prints the nudge.
4. `/soloship:audit` and the `/cursor`, `/codex` skills update their source inventories: `AGENTS.md` is the source; `CLAUDE.md` is derived. Their "real copies, never symlinks" gate is narrowed to what was actually verified on 2026-08-15 (rule *directories* routing other installers) and explicitly permits per-skill symlinks, which Claude Code documents as supported.

### Phase 4 — Skills: `.agents/skills/` canonical, `.claude/skills/` symlinked

**Why:** MAPS already does this for its three Stripe skills and it is the only layout where Cursor, Codex, Antigravity, and Claude all see the same skill without a copy. Claude Code documents symlinked skill directories as supported and dedupes them.

1. Upgrade migrates: any real directory in `.claude/skills/<name>/` containing `SKILL.md` moves to `.agents/skills/<name>/`, and `.claude/skills/<name>` becomes a relative symlink to it. Any directory already in `.agents/skills/` lacking a Claude symlink gets one. Symlinks pointing the old direction (`.agents/skills/x → .claude/skills/x`) are reversed.
2. Loose `.md` files directly in `.claude/skills/` (MAPS has five) are reported, not moved — Claude Code documents skills only as `<name>/SKILL.md` folders, so these are probably never loaded, but they are user content.
3. Codex plugin: test `codex plugin marketplace add thedigitalorganizer/soloship` against the existing `.claude-plugin/marketplace.json` (Codex reads it as compat). If it works, `sync-codex-plugin.js` and the separate `~/.agents/plugins/marketplace.json` path may be retired; record the result in the QA table before deleting anything.

### Phase 5 — `upgrade` does all of it in one run; `SessionStart` runs it automatically

**Why:** The user's ask is "update Soloship and everything follows". Plugin updates (via `/plugins`) only refresh skills in the user's home; project files change only when `npx soloship upgrade` runs in the project. Today the `SessionStart` version check merely prints "update available". Everything in Phases 1, 2, and 4 is mechanical and idempotent, so it can run unattended. Phase 3's prose migration is not, so it stays behind the bootstrap nudge.

1. `upgrade --agent all` sequence: delete dead config (Phase 2 list + the old-shape `.codex/hooks.json`, identified by its `$HOOK_TOOL_INPUT` reads) → write gate scripts and adapters (Phase 1) → write `.codex/config.toml` keys (Phase 2.3) → migrate skills (Phase 4) → write version stamp → print a change report grouped by host, ending with the bootstrap nudge if the old `CLAUDE.md` shape is detected.
2. The plugin's `SessionStart` version-check hook: when the plugin version is newer than `.soloship/version`, run `npx soloship upgrade --agent all --quiet` and surface the change report as the session's system message, telling the session to commit the generated files. Opt-out: `.soloship/no-auto-upgrade`. The hook only runs when the working tree is clean of Soloship-managed paths, so it never mixes generated changes into someone's uncommitted work.
3. `--agent all` detection stays as it is (presence of `.cursor/`, `.codex/`, `.agents/`, or the host CLI on PATH); Grok is detected by `.grok/` or the `grok` CLI and needs no files — `doctor` says so explicitly.

### Phase 6 — Docs, counts, changelog, release

**Why:** The repo has a documented pitfall about counts rotting; this change moves every count.

1. README, `AGENTS.md` (this repo's own — it currently claims "always-on rules auto-load from `.codex/rules/`", which is false), `skills/references/codex-compatibility.md`, and `DOC_COUNT_CHECKS` in `scripts/validate-plugin-metadata.js` updated to the new truth: 0 generated rule files, N gate scripts, 5 hosts.
2. `CHANGELOG.md` entry under `[Unreleased]` titled "One source of truth across five hosts" naming the inert-gate fix first.
3. Release as 0.28.0 via the existing `release.js` flow; publish the plugin.

## Execution Strategy

Single worktree, sequential phases, subagent-driven inside each phase where files are disjoint. Phase 0 is a gate: nothing in Phase 1 starts until its three results are recorded. Phases 1, 2, and 4 touch disjoint files and can be dispatched to parallel subagents *after* Phase 0; Phase 3 depends on Phase 2 (the rule text moves into the template); Phase 5 depends on 1, 2, and 4; Phase 6 last. MAPS is the real-world migration test at the end of Phase 5, before the release.

## QA Plan

| Surface | Evidence required |
|---|---|
| Claude Code gates | Transcript excerpt of the billing gate blocking an edit to `billing.ts` in a scratch repo (Phase 0 baseline shows it did not) |
| Codex gates | Same trip in `codex` with `[features] hooks = true`; blocking message in the session |
| Cursor gates | Same trip; still blocks after its scripts become requires of the shared gate |
| Antigravity gates | Same trip; `PreToolUse` deny |
| Instructions per host | Each host asked "what is this project's most critical file?" answers from `AGENTS.md` content that does not exist anywhere else; Grok via `grok inspect` compatibility output |
| Skills per host | A scratch skill in `.agents/skills/` invoked by name in Claude (via symlink), Cursor, Codex, Antigravity |
| Codex instruction cap | Root + nested `AGENTS.md` total above 32 KiB still fully loaded with the raised cap (ask Codex for content from the last nested file) |
| Upgrade on MAPS | `git status` after `upgrade --agent all` shows exactly the expected deletions and additions; `.claude/rules/` still holds MAPS's seven bespoke rules, untouched, listed in the report |
| Auto-upgrade | Bump plugin version locally, open a Claude session in a stamped project, confirm the change report appears and the tree changes only in Soloship-managed paths |
| Doctor | Output on MAPS shows per-host truth with no "installed" claim for a surface the host cannot read |

## Key Decisions

- **Fix the gates before anything cross-platform.** A cross-host layout that ships inert gates to five hosts instead of one is a regression dressed as a feature. Phase 0 and Phase 1 come first for that reason.
- **stdin is the contract, `.cjs` is the language.** Chosen over bash because the Cursor scripts already prove the pattern, Node is guaranteed present (Soloship itself is an npm package), and JSON parsing in bash with `grep -oE` is what produced the current fragility.
- **Rules move into `AGENTS.md` and the generated rule directories are deleted, not kept as mirrors.** Mirrors double-load the same text in the three hosts that read both, and Codex never read its copy. The one thing mirrors could still do — path-scoped conditional rules — Soloship does not generate.
- **`AGENTS.md` is the instruction file; `CLAUDE.md` is an import, not a symlink.** Import is what Anthropic documents, works on Windows without Developer Mode, and allows a Claude-only appendix. Symlinking would make the two files identical and lose the appendix.
- **Prose migration lives in `/soloship:bootstrap`, mechanical migration in `upgrade`.** `upgrade` has always preserved `CLAUDE.md` and `AGENTS.md` content; breaking that promise silently at `SessionStart` is exactly the kind of surprise Soloship exists to prevent.
- **Auto-upgrade runs at `SessionStart` by default, with an opt-out file and a clean-tree guard.** The user asked for "update Soloship and everything follows"; the guard and the opt-out keep it from ever colliding with in-flight work.
- **Per-skill symlinks are allowed; symlinked rule directories are still not.** The 2026-08-15 failure was a symlinked *rules* directory routing other tools' installers into `.claude/rules/`. Claude Code documents per-skill symlinks as supported and dedupes them. The `/cursor` and `/codex` skills' blanket "never symlinks" gate is narrowed to match the evidence.
- **Codex's instruction cap is raised by config rather than by trimming `AGENTS.md`.** The nested intent layer is the point; truncating it to fit a default would silently drop the files Codex most needs.
- **Grok gets no generated files.** It reads Claude's and Cursor's config natively. Generating a `.grok/` surface would create a third copy of things it already sees.
- **Antigravity stays a target but is not optimised for.** Its `AGENTS.md` support is root-only (nested unverified) and every other surface is Antigravity-specific. It gets the shared gates via its own adapter and nothing else changes.

## Out of scope

- Any personal "master library" of skills outside a project (a home-directory or vault-level catalog). That is a user-environment concern, not a Soloship one, and is deliberately not part of this plan.
- MCP configuration sync. The `/cursor` and `/codex` skills already mirror it; nothing here changes that.
- Path-scoped conditional rules. Users may author them per host; Soloship does not generate them.

## Sources (fetched 2026-08-27)

- Claude Code memory and imports — https://code.claude.com/docs/en/memory
- Claude Code skills — https://code.claude.com/docs/en/skills
- Claude Code hooks (env vars, stdin payload) — https://code.claude.com/docs/en/hooks
- Claude Code plugins reference — https://code.claude.com/docs/en/plugins-reference
- Claude Code `.agents/skills` request, unanswered — https://github.com/anthropics/claude-code/issues/31005
- Cursor rules — https://cursor.com/docs/context/rules
- Cursor skills — https://cursor.com/docs/skills
- Cursor hooks — https://cursor.com/docs/hooks
- Cursor cloud agents — https://cursor.com/docs/cloud-agent
- Codex AGENTS.md — https://learn.chatgpt.com/docs/agent-configuration/agents-md
- Codex skills — https://learn.chatgpt.com/docs/build-skills
- Codex hooks — https://learn.chatgpt.com/docs/hooks
- Codex rules (exec policy) — https://learn.chatgpt.com/docs/agent-configuration/rules
- Codex config reference — https://learn.chatgpt.com/docs/config-file/config-reference
- Codex plugins — https://developers.openai.com/plugins/build/plugins
- Antigravity rules and workflows — https://antigravity.google/docs/rules-workflows/
- Antigravity skills — https://antigravity.google/docs/skills/
- Antigravity hooks — https://antigravity.google/docs/hooks/
- Grok Build project rules — https://docs.x.ai/build/features/project-rules
- Grok Build skills and plugins — https://docs.x.ai/build/features/skills-plugins-marketplaces
- Grok Build hooks — https://docs.x.ai/build/features/hooks
- AGENTS.md standard — https://agents.md/
- Agent Skills specification — https://agentskills.io/specification
