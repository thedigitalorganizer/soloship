# Critical Patterns (Required Reading)

> Patterns Soloship has gotten wrong more than once and that **must** be followed every time. Read before any work that touches the area each pattern covers.

Patterns are numbered. They are added in the order they were promoted, not by priority — every pattern here is critical. If you spot a new pattern that belongs here, propose it through `/compound-engineering:compound-docs`.

---

## 1. Claude Code plugin.json — do NOT declare `commands`, `skills`, or `agents` when using default directories (ALWAYS REQUIRED)

### ❌ WRONG (will register zero slash commands; install succeeds silently)

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "commands": "./commands",
  "skills": "./skills",
  "agents": "./agents"
}
```

The intuition is symmetric: directory exists, declare it in the manifest. The intuition is wrong for two reasons.

1. The official schema treats declared `commands` (and `agents`) as **replacing** the default auto-scan. Declaring it as a string-to-directory both suppresses the default AND fails to register anything (because the schema expects an array of specific .md file paths).
2. `agents` isn't a valid manifest field at all and rejects the whole install with `Validation errors: agents: Invalid input`.

`skills` happens to be additive rather than replacing, so the string form doesn't hard-break, but it's still wrong-format.

### ✅ CORRECT

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "..."
}
```

Just metadata. Place files at the default locations and let auto-discovery do its job:

- `commands/<name>.md` at plugin root
- `skills/<name>/SKILL.md` at plugin root
- `agents/<name>.md` at plugin root
- `hooks/hooks.json` at plugin root
- `.mcp.json` at plugin root

**Why:** Per [Claude Code's plugin manifest schema](https://code.claude.com/docs/en/plugins-reference#plugin-manifest-schema):

> **Replaces the default**: `commands`, `agents`, `outputStyles`, `experimental.themes`, `experimental.monitors`. For example, when the manifest specifies `commands`, the default `commands/` directory is not scanned.
>
> **Adds to the default**: `skills`. The default `skills/` directory is always scanned, and directories listed in `skills` are loaded alongside it.

And the canonical example shows `commands` as `["./specialized/deploy.md", "./utilities/batch-process.md"]` — an array of specific file paths, never a directory-string.

If you genuinely need a non-default location, use the array-of-file-paths form for `commands` and a directory-string for `skills`. **For most plugins using the standard layout, omit these fields entirely.**

**Placement/Context:** Any time you author or edit `.claude-plugin/plugin.json`. Especially when adding a new component type (commands, agents, hooks) and reaching for a `"x": "./x"` declaration. The failure mode is silent — install succeeds, files are on disk, but the loader registers nothing.

**Documented in:** [`docs/solutions/best-practices/claude-code-plugin-format-gotchas-SoloshipPlugin-20260512.md`](../best-practices/claude-code-plugin-format-gotchas-SoloshipPlugin-20260512.md) (Gotcha 7)

**Failure history:** Soloship hit this across v0.1.0 → v0.4.1 — five published plugin releases where slash commands silently didn't load for any marketplace user. Discovered on a fresh-install Mac mini in 2026-05-12 because Shawn's primary Mac used dev symlinks at `~/.claude/skills/soloship-*` that masked the plugin-loader path entirely. Fixed in v0.4.2 by removing both `commands` and `skills` from the manifest.

---
