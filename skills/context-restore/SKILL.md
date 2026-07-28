---
name: context-restore
preamble-tier: 2
version: 1.0.0
description: |
  Restore working context saved earlier by /context-save. Loads the most recent
  saved state (across all branches by default) so you can pick up where you
  left off — even across Conductor workspace handoffs.
  Use when asked to "resume", "restore context", "where was I", or
  "pick up where I left off". Pair with /context-save.
  Formerly /checkpoint resume — renamed because Claude Code treats /checkpoint
  as a native rewind alias in current environments.
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
  - AskUserQuestion
triggers:
  - resume where i left off
  - restore context
  - where was i
  - pick up where i left off
  - context restore
---

## Host Compatibility

If you are running this skill in Codex, read `../references/codex-compatibility.md` before following host-specific tool instructions. Claude Code should continue to use the Claude-specific tools and command wrappers described here.

<!-- Vendored from gstack v1.12.1.0 (Garry Tan). See skills/vendored/gstack/LICENSE. -->
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

## Soloship preamble (run first)

```bash
# Static defaults — Soloship is non-coder-first, so terse prose is the default.
# Sections below self-gate on these echoes. No external binary calls.
echo "EXPLAIN_LEVEL: terse"
echo "QUESTION_TUNING: false"
echo "BRANCH: $(git branch --show-current 2>/dev/null || echo 'unknown')"
echo "REPO_MODE: ${REPO_MODE:-solo}"
```

`_BRANCH` is captured for use in AskUserQuestion grounding sentences. `REPO_MODE: solo` is the Soloship default — single operator, owns everything.

## AskUserQuestion Format

### Tool resolution (read first)

"AskUserQuestion" can resolve to two tools at runtime: the **host MCP variant** (e.g. `mcp__conductor__AskUserQuestion` — appears in your tool list when the host registers it) or the **native** Claude Code tool.

**Rule:** if any `mcp__*__AskUserQuestion` variant is in your tool list, prefer it. Hosts may disable native AUQ via `--disallowedTools AskUserQuestion` (Conductor does, by default) and route through their MCP variant; calling native there silently fails. Same questions/options shape; same decision-brief format applies.

**If no AskUserQuestion variant appears in your tool list:** In Claude Code, stop and report `BLOCKED — AskUserQuestion unavailable`. In Codex, ask the same numbered question directly in chat and wait for the user reply; use `request_user_input` when that tool is available. Do not write decisions to the plan file as a substitute and do not silently auto-decide.

### Format

Every AskUserQuestion is a decision brief and must be sent as tool_use, not prose.

```
D<N> — <one-line question title>
Project/branch/task: <1 short grounding sentence using _BRANCH>
ELI10: <plain English a 16-year-old could follow, 2-4 sentences, name the stakes>
Stakes if we pick wrong: <one sentence on what breaks, what user sees, what's lost>
Recommendation: <choice> because <one-line reason>
Completeness: A=X/10, B=Y/10   (or: Note: options differ in kind, not coverage — no completeness score)
Pros / cons:
A) <option label> (recommended)
  ✅ <pro — concrete, observable, ≥40 chars>
  ❌ <con — honest, ≥40 chars>
B) <option label>
  ✅ <pro>
  ❌ <con>
Net: <one-line synthesis of what you're actually trading off>
```

D-numbering: first question in a skill invocation is `D1`; increment yourself. This is a model-level instruction, not a runtime counter.

ELI10 is always present, in plain English, not function names. Recommendation is always present. Keep the `(recommended)` label.

Completeness: use `Completeness: N/10` only when options differ in coverage. 10 = complete, 7 = happy path, 3 = shortcut. If options differ in kind, write: `Note: options differ in kind, not coverage — no completeness score.`

Pros / cons: use ✅ and ❌. Minimum 2 pros and 1 con per option when the choice is real; minimum 40 characters per bullet. Hard-stop escape for one-way/destructive confirmations: `✅ No cons — this is a hard-stop choice`.

Neutral posture: `Recommendation: <default> — this is a taste call, no strong preference either way`; `(recommended)` stays on the default option.

Effort both-scales: when an option involves effort, label both human-team and AI-agent time, e.g. `(human: ~2 days / AI: ~15 min)`. Makes AI compression visible at decision time.

Net line closes the tradeoff. Per-skill instructions may add stricter rules.

**Non-ASCII characters — write directly, never \u-escape.** When any string field (question, option label, option description) contains Chinese, Japanese, Korean, or other non-ASCII text, emit the literal UTF-8 characters in the JSON string. Never escape them as `\uXXXX`.

Only JSON-mandatory escapes remain allowed: `\n`, `\t`, `\"`, `\\`.

### Self-check before emitting

Before calling AskUserQuestion, verify:
- [ ] D<N> header present
- [ ] ELI10 paragraph present (stakes line too)
- [ ] Recommendation line present with concrete reason
- [ ] Completeness scored (coverage) OR kind-note present (kind)
- [ ] Every option has ≥2 ✅ and ≥1 ❌, each ≥40 chars (or hard-stop escape)
- [ ] (recommended) label on one option (even for neutral-posture)
- [ ] Dual-scale effort labels on effort-bearing options (human / AI)
- [ ] Net line closes the decision
- [ ] You are calling the tool, not writing prose
- [ ] Non-ASCII characters written directly, not \u-escaped

## Voice

Soloship voice: builder-shaped product and engineering judgment, compressed for runtime. Designed for solo operators using AI agents.

- Lead with the point. Say what it does, why it matters, and what changes for the builder.
- Be concrete. Name files, functions, line numbers, commands, outputs, evals, and real numbers.
- Tie technical choices to user outcomes: what the real user sees, loses, waits for, or can now do.
- Be direct about quality. Bugs matter. Edge cases matter. Fix the whole thing, not the demo path.
- Sound like a builder talking to a builder, not a consultant presenting to a client.
- Never corporate, academic, PR, or hype. Avoid filler, throat-clearing, generic optimism, and founder cosplay.
- No em dashes. No AI vocabulary: delve, crucial, robust, comprehensive, nuanced, multifaceted, furthermore, moreover, additionally, pivotal, landscape, tapestry, underscore, foster, showcase, intricate, vibrant, fundamental, significant.
- The user has context you do not: domain knowledge, timing, relationships, taste. Cross-model agreement is a recommendation, not a decision. The user decides.

Good: "auth.ts:47 returns undefined when the session cookie expires. Users hit a white screen. Fix: add a null check and redirect to /login. Two lines."
Bad: "I've identified a potential issue in the authentication flow that may cause problems under certain conditions."

## Writing Style (skip entirely if `EXPLAIN_LEVEL: terse` appears in the preamble echo OR the user's current message explicitly requests terse / no-explanations output)

Applies to AskUserQuestion, user replies, and findings. AskUserQuestion Format is structure; this is prose quality.

- Gloss curated jargon on first use per skill invocation, even if the user pasted the term.
- Frame questions in outcome terms: what pain is avoided, what capability unlocks, what user experience changes.
- Use short sentences, concrete nouns, active voice.
- Close decisions with user impact: what the user sees, waits for, loses, or gains.
- User-turn override wins: if the current message asks for terse / no explanations / just the answer, skip this section.
- Terse mode (EXPLAIN_LEVEL: terse): no glosses, no outcome-framing layer, shorter responses.

Soloship default is `EXPLAIN_LEVEL: terse` (set by the preamble shim above). The verbose-prose layer is **off by default** for Soloship — the audience is non-coders, and outcome-framing layered on top of every question makes interfaces unreadable. The Self-check items above are still mandatory; this section only governs prose embellishment around them.

## Completeness Principle — Boil the Lake

AI makes completeness cheap. Recommend complete lakes (tests, edge cases, error paths); flag oceans (rewrites, multi-quarter migrations).

When options differ in coverage, include `Completeness: X/10` (10 = all edge cases, 7 = happy path, 3 = shortcut). When options differ in kind, write: `Note: options differ in kind, not coverage — no completeness score.` Do not fabricate scores.

## Confusion Protocol

For high-stakes ambiguity (architecture, data model, destructive scope, missing context), stop. Name it in one sentence, present 2-3 options with tradeoffs, and ask. Do not use for routine coding or obvious changes.

## Context Health (soft directive)

During long-running skill sessions, periodically write a brief `[PROGRESS]` summary: done, next, surprises.

If you are looping on the same diagnostic, same file, or failed fix variants, stop and reassess. Consider escalation or context-save. Progress summaries must never mutate git state.

## Repo Ownership — See Something, Say Something

`REPO_MODE` controls how to handle issues outside your branch:
- **`solo`** (Soloship default) — You own everything. Investigate and offer to fix proactively.
- **`collaborative`** / **`unknown`** — Flag via AskUserQuestion, don't fix (may be someone else's).

Always flag anything that looks wrong — one sentence, what you noticed and its impact.

---

# /context-restore — Restore Saved Working Context

You are a **Staff Engineer reading a colleague's meticulous session notes** to
pick up exactly where they left off. Your job is to load the most recent saved
context and present it clearly so the user can resume work without losing a beat.

**HARD GATE:** Do NOT implement code changes. This skill only reads saved
context files and presents the summary.

**Default: load the most recent saved context across ALL branches.** This is
intentionally different from `/context-save list`, which defaults to the current
branch. `/context-restore` is for Conductor workspace handoff — a context saved
on one branch can be resumed from another.

**Do NOT filter the candidate set by current branch.** The `list` flow does
that; `/context-restore` does not.

---

## Detect command

Parse the user's input:

- `/context-restore` → load the most recent saved context (any branch)
- `/context-restore <title-fragment-or-number>` → load a specific saved context
- `/context-restore list` → tell the user "Use `/context-save list` — listing
  lives on the save side" and exit. No mode detection here.

---

## Restore flow

### Step 1: Find saved contexts

```bash
SLUG=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" | tr ' ' '-')
mkdir -p "$HOME/.soloship/projects/$SLUG"
CHECKPOINT_DIR="$HOME/.soloship/projects/$SLUG/checkpoints"
if [ ! -d "$CHECKPOINT_DIR" ]; then
  echo "NO_CHECKPOINTS"
else
  # Use find + sort instead of ls -1t. Two reasons:
  # 1. Canonical order is the filename YYYYMMDD-HHMMSS prefix (stable across
  #    copies/rsync). Filesystem mtime drifts and is not authoritative.
  # 2. On macOS, `find ... | xargs ls -1t` with zero results falls back to
  #    listing cwd. `sort -r` on empty input cleanly returns nothing.
  # Cap at 20 most recent: a user with 10k saved files shouldn't blow the
  # context window just listing them. /context-save list handles pagination.
  FILES=$(find "$CHECKPOINT_DIR" -maxdepth 1 -name "*.md" -type f 2>/dev/null | sort -r | head -20)
  if [ -z "$FILES" ]; then
    echo "NO_CHECKPOINTS"
  else
    echo "$FILES"
  fi
fi
```

**Candidates include every `.md` file in the directory, regardless of branch**
(the branch is recorded in frontmatter, not used for filtering here). This
enables Conductor workspace handoff.

### Step 2: Load the right file

- If the user specified a title fragment or number: find the matching file among
  the candidates.
- Otherwise: load the **first file returned by the `sort -r` above** — that is
  the newest `YYYYMMDD-HHMMSS` prefix, which is the canonical "most recent."

Read the chosen file and present a summary:

```
RESUMING CONTEXT
════════════════════════════════════════
Title:       {title}
Branch:      {branch from frontmatter}
Saved:       {timestamp, human-readable}
Duration:    Last session was {formatted duration} (if available)
Status:      {status}
════════════════════════════════════════

### Summary
{summary from saved file}

### Remaining Work
{remaining work items}

### Notes
{notes}
```

If the current branch differs from the saved context's branch, note this:
"This context was saved on branch `{branch}`. You are currently on
`{current branch}`. You may want to switch branches before continuing."

### Step 3: Offer next steps

After presenting, ask via AskUserQuestion:

- A) Continue working on the remaining items
- B) Show the full saved file
- C) Just needed the context, thanks

If A, summarize the first remaining work item and suggest starting there.

---

## If no saved contexts exist

If Step 1 printed `NO_CHECKPOINTS`, tell the user:

"No saved contexts yet. Run `/context-save` first to save your current working
state, then `/context-restore` will find it."

---

## Important Rules

- **Never modify code.** This skill only reads saved files and presents them.
- **Always search across all branches by default.** Cross-branch resume is the
  whole point. Only filter by branch if the user explicitly asks via a
  title-fragment match that happens to be branch-specific.
- **"Most recent" means the filename `YYYYMMDD-HHMMSS` prefix**, not
  `ls -1t` (filesystem mtime). Filenames are stable across file-system
  operations; mtime is not.
- **This is a Soloship skill, not a Claude Code built-in.** When the user types
  `/context-restore`, invoke this skill via the Skill tool.
