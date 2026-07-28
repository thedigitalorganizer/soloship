# Codex Compatibility

Soloship skills are shared by Claude Code and Codex. When a skill mentions a host-specific tool, use the closest available behavior in the current host.

## Tool Mapping

| Claude Code wording | Codex behavior |
| --- | --- |
| `Read` | Use shell reads such as `sed -n`, `cat`, or `rg` context. |
| `Grep` | Use `rg`. |
| `Glob` | Use `rg --files` or `find`. |
| `Write` | Use `apply_patch` for new files unless a generated/bulk rewrite is more appropriate. |
| `Edit` / `MultiEdit` | Use `apply_patch`. |
| `Bash` | Use the shell command tool. |
| `AskUserQuestion` | If `request_user_input` is available, use it. Otherwise ask a concise numbered question in chat and wait for the reply. Never silently auto-decide. |
| `Task`, `Agent`, or subagent dispatch | Use Codex subagents if available. Otherwise run the referenced prompt sequentially in the main thread and state the single-agent fallback. |

## Research Prompts

When a skill dispatches a prompt from `references/agents/*.md`, first resolve it relative to this plugin's `skills/references/agents/` directory. If subagents are unavailable, read the prompt and perform the requested research in the main thread.

**Inline-fallback semantics (applies to any subagent prompt run in the main thread):** subagent prompts are written for a real worker-to-controller boundary — "return your findings", "report back", "your final message is the report". When the prompt runs inline, there is no boundary: treat every return/report instruction as "produce that content here (or write it to the stated file), then continue with the calling skill's next step." An inline-run prompt never ends the session; only the calling skill decides what happens next.

## Paths

Do not assume Claude-only paths such as `~/.claude/plugins/...`. Prefer paths relative to the loaded skill directory. For installed Codex plugin development, also check:

- `~/plugins/soloship/`
- `~/.codex/.tmp/marketplaces/*/`
- `~/.agents/skills/`
- repo-local `.agents/skills/`, if present

## Outside Voices

Some skills use `codex exec` as an outside model from Claude Code. If this skill is already running in Codex, do not spawn nested `codex exec` for the "Codex voice." Treat the current agent as the Codex voice and skip unavailable Claude subagent work unless a safe Claude CLI integration is explicitly configured.

## Claude Command Wrappers

The `commands/` directory is Claude Code-only. Codex should consume `skills/<name>/SKILL.md` directly from the Soloship plugin.
