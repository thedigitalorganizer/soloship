# Adapters — adding Codex, Grok, or any other agent CLI

An adapter is a declarative record describing how to invoke one agent
non-interactively. Adding a vendor is a config entry, not a code change —
because a runner hard-wired to one CLI has to be rewritten for each new vendor,
which means it never is, and the question goes unanswered.

List what is built in:

```bash
npx soloship gauntlet adapters
```

## The shape

```jsonc
{
  "id": "grok",
  "command": "grok",                 // resolved on PATH
  "baseArgs": ["--model", "{{model}}", "--yes", "{{prompt}}"],
  "harnessedArgs": [],               // appended when condition = harnessed
  "bareArgs": [],                    // appended when condition = bare
  "env": {},                         // extra environment for the child process
  "telemetry": "none",               // "claude-json" | "codex-json" | "none"
  "promptOnStdin": false             // send the prompt on stdin instead of argv
}
```

Placeholders available in any `baseArgs`/`harnessedArgs`/`bareArgs` entry and
in `env` values:

| Placeholder | Value |
|---|---|
| `{{prompt}}` | The full brief plus the shared autonomy clause |
| `{{model}}` | The model id from the model entry |
| `{{cwd}}` | The arm's worktree path (also the child's working directory) |
| `{{pluginRoot}}` | Soloship plugin root, for harnessed arms |
| `{{budgetUsd}}` | The per-arm spend cap |

## Built-in: claude

```jsonc
{
  "command": "claude",
  "baseArgs": ["-p", "{{prompt}}", "--model", "{{model}}",
               "--output-format", "json",
               "--permission-mode", "bypassPermissions",
               "--max-budget-usd", "{{budgetUsd}}"],
  "harnessedArgs": ["--plugin-dir", "{{pluginRoot}}"],
  "bareArgs": ["--safe-mode"],
  "telemetry": "claude-json"
}
```

`--safe-mode` is the bare condition: Claude Code's own switch for *all
customizations disabled* — CLAUDE.md, skills, plugins, hooks, agents, output
styles. It was chosen over deleting those files from the arm's worktree, which
would have polluted every bare diff with deletions and corrupted both the
diff-size metric and the reviewers' view.

**Running as root** (containers, CI): agent CLIs refuse to bypass permission
prompts as root. The runner sets `IS_SANDBOX=1` in that case and announces it
in the run log. If you are not in a disposable environment, do not run a
gauntlet as root.

## Built-in: codex (OpenAI)

```jsonc
{
  "command": "codex",
  "baseArgs": ["exec", "--model", "{{model}}",
               "--sandbox", "workspace-write", "--json", "{{prompt}}"],
  "telemetry": "codex-json"
}
```

Soloship ships a Codex plugin (`.codex-plugin/`), so both conditions are
available. Codex resolves plugins from its own install rather than a
per-invocation flag, so the harnessed/bare split is set up once at the
installation level:

- **harnessed:** `npm run codex:install-local` in the Soloship repo before the
  run, so the skills are present.
- **bare:** run the arms with the plugin removed, or point `command` at a
  `codex` invocation with a config that excludes it.

Because that split is installation-wide rather than per-arm, **do not run
harnessed and bare Codex arms in the same gauntlet invocation.** Run them as
two gauntlets against the same course and baseline, and compare the scorecards.
Note it in your writeup — it is a weaker control than the Claude arms get.

## Adding Grok

> **Consider OpenRouter instead.** For any cross-vendor comparison, running
> every model through one neutral harness via OpenRouter is a materially better
> experiment than one CLI per vendor — it holds the harness constant and
> restores the cost columns. It also has one trap that will void your results
> if you miss it. Read `openrouter.md` before choosing.

There is no single official Grok coding CLI, so this is a `generic` adapter
with the command filled in. Whatever CLI you use needs three things: it runs
non-interactively, it accepts a prompt, and it can edit files in its working
directory.

```jsonc
"adapters": {
  "grok": {
    "id": "grok",
    "command": "grok",
    "baseArgs": ["--model", "{{model}}", "--non-interactive", "{{prompt}}"],
    "harnessedArgs": [],
    "bareArgs": [],
    "telemetry": "none"
  }
},
"models": [
  { "id": "grok-code", "adapter": "grok", "model": "grok-code-fast",
    "label": "Grok Code Fast", "conditions": ["bare"] }
]
```

Two honest notes:

1. **Telemetry degrades to wall-clock.** `telemetry: "none"` means cost and
   token columns read `n/a` — never `0`. Wall-clock is the one metric every
   vendor can be compared on without a shared format, and it is the metric the
   speed question actually needs.

2. **Set `conditions: ["bare"]` unless a Soloship port exists for that CLI.**
   Soloship targets Claude Code and Codex. Claiming a "harnessed" Grok arm
   without the harness would put a mislabeled row in the table, which is worse
   than a missing one.

## Per-model condition overrides

Any model entry may narrow its own conditions. Use this when a vendor supports
only one:

```jsonc
{ "id": "grok-code", "adapter": "grok", "model": "grok-code-fast",
  "label": "Grok Code Fast", "conditions": ["bare"] }
```

## Verifying a new adapter before spending a run

Do this every time. A misconfigured adapter produces four identical empty arms
and looks like a model failure.

1. Run its command by hand in a scratch directory with a trivial prompt
   ("create a file called `ok.txt`") and confirm the file appears.
2. Add the adapter and one model, set `--reps 1`, and run a single arm with
   `--only <arm-id>`.
3. Check `.gauntlet/<run>/logs/<arm>.stderr.log` — an arm that finishes in
   under two seconds with no files changed failed to launch.
4. Confirm the telemetry columns look right, or say `n/a` rather than `0`.
