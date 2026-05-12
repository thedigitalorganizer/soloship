---
module: Soloship Plugin
date: 2026-05-12
updated: 2026-05-12
problem_type: best_practice
component: tooling
symptoms:
  - "Every slash command returns 'unknown command' for plugin-marketplace users"
  - "Plugin install fails: 'Validation errors: agents: Invalid input'"
  - "claude plugin details reports old version even after marketplace shows new version"
  - "Marketplace UI never offers updates despite multiple npm releases"
  - "Skills load (visible in inventory) but slash commands don't"
  - "Plugin installs/updates clean but commands silently fail to register"
  - "Declaring commands as string path to directory suppresses default auto-discovery"
tags: [claude-code, plugin, marketplace, plugin-json, slash-commands, commands-directory, namespacing, version-sync, manifest-schema, auto-discovery]
root_cause: incomplete_setup
resolution_type: workflow_improvement
severity: high
---

# Claude Code Plugin Format — The Seven Gotchas

## Context

On 2026-05-12, Shawn tried to install Soloship via Claude Code's plugin marketplace on a second Mac to test yesterday's rendering fix. **Every slash command returned "unknown command."** Debugging surfaced six distinct format/spec gotchas in Claude Code's plugin system, none documented anywhere obvious. Soloship had shipped four public versions (0.1.0 through 0.3.0) where the plugin marketplace install was effectively non-functional — slash commands never worked, version checks never fired, the marketplace UI was frozen at first-publish.

This doc consolidates the gotchas as prevention for any future Claude Code plugin Soloship builds or vendors.

## The Seven Gotchas

### Gotcha 1 — Three version files exist, not one

A Claude Code plugin distributed via npm AND via the plugin marketplace has THREE version files that must stay in sync:

1. **`package.json`** — what npm publishes
2. **`.claude-plugin/plugin.json`** — what Claude Code's plugin loader reads after install
3. **`.claude-plugin/marketplace.json`** — what the marketplace UI listing reads to decide whether an update is available

**The trap:** `npm version patch|minor|major` only bumps `package.json`. The other two are silent. Soloship had `marketplace.json` stuck at `0.1.0` across three npm releases — the marketplace UI told every user "you're up to date" forever because the listing version never moved. The plugin code WAS being pulled fresh, but the UI never offered the update, so no one re-pulled.

**Prevention:** A `release-version-sync` rule that fires on any `npm version` invocation. Updates all three files in the same commit, with a self-check before publish:

```bash
PKG=$(node -p "require('./package.json').version")
PLG=$(node -p "require('./.claude-plugin/plugin.json').version")
MKT=$(node -p "require('./.claude-plugin/marketplace.json').plugins[0].version")
[ "$PKG" = "$PLG" ] && [ "$PLG" = "$MKT" ] && echo "OK: $PKG" || echo "DRIFT"
```

See `.claude/rules/release-version-sync.md` for the full sequence including the `git commit --amend` + `git tag -f` dance.

### Gotcha 2 — Skills are NOT slash commands

This was the deepest confusion. In Claude Code's model:

- **Skills** (`skills/<name>/SKILL.md`) are tools the AGENT can invoke via the `Skill` tool, based on user intent matching the skill's description. Discovered via `"skills": "./skills"` in plugin.json.
- **Slash commands** (`commands/<name>.md`) are USER-typed shortcuts. They appear in autocomplete and resolve directly when typed. Discovered via `"commands": "./commands"` in plugin.json.

**Plugin-loaded skills do NOT auto-expose as slash commands.** Only commands files become slash commands. This is different from skills installed directly at `~/.claude/skills/<name>/` (e.g., via manual symlinks) which DO appear to function as slash commands.

Soloship had 51 skills declared via `"skills": "./skills"` and a `claude plugin details soloship` inventory that showed "Skills (51), Hooks (0), MCP servers (0)" — no `Commands` line at all. Users typing `/soloship-bootstrap` got "unknown command" because no command existed; only a skill of the same name existed and that's not user-typable.

**Fix:** Add a `commands/` directory with one `.md` per slash command. Each file is a thin wrapper that invokes the corresponding skill.

**⚠️ Original v0.4.0 guidance overturned by Gotcha 7 (below):** This doc's earlier version said to declare `"commands": "./commands"` in plugin.json. That recommendation was wrong — declaring `commands` as a string path to a directory *suppresses* the default auto-discovery and registers zero commands. The correct fix is to **just create the `commands/` directory at plugin root and not declare anything in the manifest**. Auto-discovery handles it. See Gotcha 7.

### Gotcha 3 — The `agents` field doesn't exist in the manifest schema

Soloship added `"agents": "./agents"` to plugin.json in symmetric fashion with skills/commands. **Plugin install fails immediately with `Validation errors: agents: Invalid input`.**

**Reality:** Agents are auto-discovered from `agents/*.md` at the plugin root. There is no `agents` key in the plugin.json schema. Just put the files in the directory and don't declare anything.

**Prevention:** Plugin.json's valid component-pointer fields are `commands`, `skills`, `hooks`, `mcpServers`. Don't invent additional ones by analogy.

### Gotcha 4 — Slash commands are namespaced under the plugin name

This is the discovery that retroactively explained why even `/gs-office-hours` (a unique name with no possible conflict) was returning "unknown command" on Shawn's other Mac AFTER 0.4.0 added the commands directory.

**Plugin slash commands are namespaced as `/<plugin-name>:<command-name>`.**

So Soloship's commands aren't `/soloship-bootstrap`. They're `/soloship:soloship-bootstrap`. The Skill tool inventory in fresh sessions shows them this way:

```
- soloship:soloship-bootstrap
- soloship:gs-office-hours
- soloship:bootstrap  (this one comes from skill auto-discovery)
- soloship:gs-plan-ceo-review
- ...
```

The dash-separated muscle memory `/soloship-bootstrap` works on Shawn's primary Mac because his symlinks at `~/.claude/skills/soloship-*` bypass the plugin namespace mechanism entirely. The plugin-installed version uses the colon syntax.

**Implication for naming:** Since the namespace already adds the plugin name, having `soloship-` prefixed command files produces ugly redundancy: `/soloship:soloship-bootstrap`. Cleaner to drop the prefix from command filenames so they become `/soloship:bootstrap`. (Doing this is a future cleanup; the current 0.4.1 ships with the redundant prefix.)

### Gotcha 5 — Plugin manifest cache is sticky

`claude plugin details <name>` reads from a CACHE separate from the marketplace install directory. Updates to the marketplace install (via `/plugins → update` in the UI) refresh the source code on disk but may not invalidate the manifest cache.

**Symptom:** `cat ~/.claude/plugins/marketplaces/soloship/.claude-plugin/plugin.json` shows version 0.4.0 on disk, but `claude plugin details soloship` reports version 0.3.0. The plugin loader uses the stale cached value, so plugin.json changes (like the new `"commands"` field) are invisible.

**Fix attempts in order of escalation:**
1. Open Claude Code's `/plugins` UI → disable Soloship → enable Soloship. Often enough.
2. Cmd+Shift+P → "Developer: Reload Window" (VS Code extension specifically).
3. Quit Claude Code / VS Code entirely and reopen.
4. Full uninstall + reinstall via marketplace.
5. Manually delete cache directories under `~/.claude/plugins/cache/` then reinstall.

Soloship hit this on the other-Mac install of 0.3.0 → 0.4.0 transition. `Bumped version → pushed → marketplace UI showed 0.4.0 → but plugin loader still used 0.3.0 manifest = no commands declared = no slash commands.`

### Gotcha 6 — Plugin install is fragile silent-fail across many surfaces

Each of the previous five gotchas FAILS SILENTLY for the end user. The marketplace UI shows "Installed v0.X.X" with a green checkmark even when:

- The cached manifest is stale (Gotcha 5)
- The commands directory doesn't exist (Gotcha 2)
- The version file the upgrade hook reads is missing (separate concern, see other doc)
- The user is typing the wrong slash command syntax (Gotcha 4)

**There is no "this plugin is loaded but broken" indicator visible to the user.** The only diagnostic surface is `claude plugin details <name>` from the terminal, which most plugin users will never run.

**Prevention for any future Claude Code plugin:**
- Test installation on a clean machine (fresh OS user, no existing Claude Code config) before any public release. Soloship had four public versions before the first real clean-machine test caught this entire class of bugs.
- Add a diagnostic command file to the plugin itself (e.g., `commands/soloship-doctor.md`) that runs filesystem and manifest checks and reports findings in plain English.
- The first command users are told to try should be unique-named (`/soloship:gs-office-hours`, not `/soloship:bootstrap`) so naming collisions with other plugins don't mask plugin-loading issues.

### Gotcha 7 — Declaring `commands` or `skills` in plugin.json *replaces* the default auto-discovery

**Discovered later the same day, 2026-05-12.** v0.4.0 added `commands/` directory AND `"commands": "./commands"` to plugin.json (per Gotcha 2's original advice). Plugin installs were succeeding cleanly with no validation errors. The commands directory existed in the clone. **Every slash command still returned "unknown command" on a fresh-install Mac mini.**

The official [plugin manifest schema reference](https://code.claude.com/docs/en/plugins-reference#plugin-manifest-schema) reveals the actual rules:

> **Replaces the default**: `commands`, `agents`, `outputStyles`, `experimental.themes`, `experimental.monitors`. For example, when the manifest specifies `commands`, the default `commands/` directory is not scanned.

And the canonical example shows `commands` as an **array of specific .md file paths**:

```json
"commands": ["./specialized/deploy.md", "./utilities/batch-process.md"]
```

So `"commands": "./commands"` (a single string pointing at a directory) was failing two ways at once:

1. **It suppressed the default auto-scan** of `commands/` at plugin root.
2. **The string value `"./commands"` is not a valid command file path** — the schema wants an array of specific files. The parser registered zero commands.

The plugin installed without complaint, the manifest was structurally valid, the files were on disk — but the loader registered no commands. Pure silent failure.

**Correct configuration:**

- Place `commands/<name>.md` files at plugin root.
- Place `skills/<name>/SKILL.md` directories at plugin root.
- **Do not declare `commands` or `skills` in plugin.json.** Auto-discovery handles them.
- If you need custom paths, declare them as **arrays of specific file paths** (for `commands`) or directory paths (for `skills`, which is additive not replacing).

**This overturns the v0.4.0 guidance in Gotcha 2.** Fixed in Soloship v0.4.2 by removing both fields from plugin.json. Verified on the Mac mini that `/soloship:ce-plan` (and after the v0.5.0 rename, `/soloship:plan`) loaded correctly.

**Prevention for future plugins:**

- Read the [plugin-manifest-schema](https://code.claude.com/docs/en/plugins-reference#plugin-manifest-schema) section completely. The "Replaces the default" sentence is the load-bearing detail.
- Default to omitting component fields from plugin.json. Only declare them if you actively need a non-default path AND know to use the schema-correct value format.
- Symmetric-looking field reasoning ("if `commands` is declared, `skills` should be too") is wrong — `skills` adds to defaults, `commands` replaces them. Same field-name style, different semantics. The two-letter difference between "adds to" and "replaces" controls whether your plugin works.

## The Final Working Configuration (Soloship 0.5.1)

`.claude-plugin/plugin.json` (Soloship 0.5.1):
```json
{
  "name": "soloship",
  "version": "0.5.1",
  "description": "...",
  "author": {...},
  "homepage": "...",
  "repository": "...",
  "license": "MIT",
  "keywords": [...]
}
```

**Note: no `commands`, `skills`, or `agents` fields.** All three component directories (`commands/`, `skills/`, `agents/`) exist at plugin root and are auto-discovered by their default locations. Declaring any of those fields as a path string (the obvious-but-wrong reading) suppresses or breaks the default discovery — see Gotcha 7.

`.claude-plugin/marketplace.json` — keep `plugins[0].version` in lockstep with `plugin.json`'s `version` and `package.json`'s `version`.

`commands/*.md` — one file per slash command. Each:
```markdown
---
description: <prose description>
---

<body that invokes the corresponding skill or contains the workflow inline>
```

The `name` field in frontmatter is NOT used for commands (only for skills). The slash command name is derived from the filename: `commands/soloship-bootstrap.md` → `/soloship:soloship-bootstrap`.

## How To Verify A Plugin Install Actually Works

After any plugin change, on a fresh machine (or after full reload):

```bash
# 1. Check the install dir has the expected files
ls ~/.claude/plugins/marketplaces/<name>/commands/ | head
cat ~/.claude/plugins/marketplaces/<name>/.claude-plugin/plugin.json

# 2. Check what Claude Code's loader actually sees
claude plugin details <name>
# Look for: correct version + "Commands (N)" inventory line + "Skills (N)" inventory line

# 3. In Claude Code, type a unique slash command and verify it appears in autocomplete
# /<plugin>:<unique-cmd-name>

# 4. If autocomplete shows it but execution fails, the command file itself has an issue
# (bad frontmatter, missing body, broken Skill tool reference)
```

If step 2 shows a stale version: apply Gotcha 5's escalation ladder.
If step 3 shows nothing: commands declaration missing or cache stale (Gotchas 2 + 5).
If install itself fails: schema validation error (Gotcha 3 or related).

## Cross-references

- `.claude/rules/release-version-sync.md` — the rule that enforces Gotcha 1 prevention
- `docs/solutions/best-practices/vendor-skills-without-external-deps-SoloshipPlugin-20260511.md` — yesterday's sibling lesson about vendoring; this doc covers the plugin-format layer above that
- `docs/plans/archive/2026-05-12-both-install-paths-complete.md` — the plan that surfaced these gotchas

## Why The Earlier Versions Shipped Broken

- v0.1.0 → v0.2.0 → v0.3.0: nobody on the team had tested plugin-marketplace install on a clean machine. Shawn's primary Mac used manual symlinks (CLAUDE.md documented setup script) which made the marketplace install look unnecessary.
- The npm path (`npx soloship init`) was tested. The plugin path was not.
- The marketplace.json version drift hid the bug from anyone who DID try plugin install — the marketplace told them they were up to date on 0.1.0, which never had commands, so failure looked like "old broken version."
- Schema validation errors weren't surfaced until v0.4.0's commands push (Gotcha 3, the agents field).
- v0.4.0 → v0.4.1 added `"commands": "./commands"` to plugin.json believing it enabled discovery. Tested again on the Mac mini — still "unknown command." That third failure on the same install path forced the deeper read of the schema reference, which surfaced Gotcha 7 (the "Replaces the default" semantics).

**The single most valuable prevention:** A clean-machine install + slash-command-fires test as a release gate. Not yet automated; should be.

## Update Log

- **2026-05-12 (initial publication):** Documented Gotchas 1-6. Recommended declaring `"commands": "./commands"` in plugin.json (Gotcha 2).
- **2026-05-12 (later same day, after Mac mini v0.4.0/0.4.1 still failed):** Added Gotcha 7. The earlier recommendation about declaring `commands` was overturned. Plugin authors should NOT declare `commands` or `skills` in plugin.json when using the default `commands/` and `skills/` directories at plugin root — declaration is for non-default paths only, and `commands` declaration *replaces* the default scan. Corrected Final Working Configuration to show v0.5.1's minimal plugin.json with no component-path fields.
