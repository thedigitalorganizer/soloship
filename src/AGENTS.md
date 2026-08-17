# AGENTS.md — src/

## Scope

TypeScript source of the `soloship` npm CLI: `cli.ts` (Commander definition)
routes to `init.ts` / `upgrade.ts` / `rollback.ts` / `doctor.ts`. The
installers generate project guardrails: `hooks.ts` (inline-bash Claude Code
hooks written to `.claude/settings.local.json`), `rules.ts` (markdown rules
for `.claude/rules/` + `.codex/rules/`), `scaffold.ts`, `templates.ts`,
`agents.ts`, `ci.ts`. Compiles to `dist/` via `tsc`.

## Contracts

- `bin/soloship.js` shims to `dist/cli.js` — CLI surface changes are semver
  events (see `.claude/rules/publish-version-bump.md`).
- `installHooks()` **own-and-merges** the `hooks` key of
  `.claude/settings.local.json`: it replaces only entries stamped
  `_soloshipManaged` (or legacy-fingerprinted) and preserves user-custom
  hooks; other settings keys are preserved. (Stale "overwrites the whole
  key" wording corrected 2026-07-23 — see the own-and-merge pitfall below.)
- `hooks.ts` exports SESSION_PRUNE_HOURS / SESSION_ACTIVE_MIN /
  SESSION_IDLE_MIN / DEPLOY_LOCK_STALE_MIN and rewrites them to
  `<git-common-dir>/soloship/config.json` on every SessionStart — skills read
  that file; never hardcode copies of these thresholds elsewhere.
- Rule count and skill count are asserted by
  `scripts/validate-plugin-metadata.js` — adding a rule in `rules.ts` or a
  skill dir requires bumping those constants.
- `hooks.ts` also exports `BROWSER_CLAIM_STALE_MIN` and
  `BROWSER_TEARDOWN_REMIND_MIN` (added 2026-07-29) — `BROWSER_CLAIM_STALE_MIN`
  deliberately equals `SESSION_IDLE_MIN` rather than being its own number; when
  adding new "presumed dead" staleness logic, check for an existing threshold
  in `config.json` before inventing a new one. `SessionEnd` is now a supported
  hook event (added to `HOOK_EVENTS` and the settings-merge machinery
  alongside `PreToolUse`/`PostToolUse`/`Stop`/`SessionStart`) — it can only
  ever run cleanup on graceful exit; anything that must also catch the
  still-running-but-gone-quiet case needs a paired `Stop` hook (see the
  browser-claim-teardown pitfall below).

## Key Files

- `hooks.ts` — builders returning `bash -c '...'` strings; guard-first (exit 0
  outside git), no apostrophes inside the single-quoted script, `\\"` for
  quotes, `\${VAR}` for bash braces vs `${TS_CONST}` for TS interpolation
- `rules.ts` — `getWorkflowRules()` map of installed rule markdown
- `doctor.ts` — read-only surface checks incl. the session coordination dir
- `init.ts` / `upgrade.ts` — install + refresh orchestration (upgrade forces
  hook/rule refresh, preserves docs)

## Pitfalls

### Pitfall: Multibyte character adjacent to a shell variable eats the expansion
_Added by soloship-learn 2026-07-06_
In generated hook scripts, a non-ASCII character (e.g. an em-dash) placed
directly after `$VAR` gets its first UTF-8 byte absorbed into the variable
name, so the expansion silently renders empty plus garbage bytes. Always
write `\${VAR}` (braces) in the TS template and keep hook-emitted messages
ASCII-only. Verify generated scripts by executing them with real stdin
payloads — this class is invisible in source review. See
`docs/solutions/runtime-errors/multibyte-char-adjacent-to-shell-var-eats-expansion-20260706.md`.

### Pitfall: `installHooks` must own-and-merge settings, never replace the block
_Added by soloship-learn 2026-07-15_
`installHooks` writes into the user's `.claude/settings.local.json`, which the
user can also add their own hooks to. It stamps every entry it creates with
`_soloshipManaged: true` and MERGES (keep unmarked user hooks, replace only its
own), rather than doing `settings.hooks = hooks`. A whole-block replace silently
wipes user-custom hooks on every re-init/upgrade. If you add a new hook, it is
stamped automatically by the merge path — do not reintroduce a bare assignment.
Legacy (pre-marker) Soloship hooks are cleaned up by `isLegacySoloshipHook`'s
fingerprint regex; extend it when adding a hook whose command lacks an existing
signature. Test idempotency: run init 2–3× over a config with a foreign hook and
assert no duplication + the foreign hook survives. See
`docs/solutions/patterns/installer-own-and-merge-config-not-replace-20260715.md`.

### Pitfall: Advisory teardown prose alone doesn't survive the collapse zone
_Added by soloship-learn 2026-07-29_
A "clean up X when done" instruction living only in skill markdown gets
forgotten at the tail of long sessions, exactly where context is thinnest.
`SessionEnd` alone isn't a full fix either — it only fires on a clean exit, so
a session that goes quiet but keeps running (moved on to other work, still
holding a browser claim) is invisible to it. The browser-claim system pairs
`SessionEnd` (releases on clean exit) with a `Stop` hook
(`buildBrowserTeardownReminderScript`) that checks the CURRENT session's own
claim file age on every reply-end and nags with the exact release command once
it has gone quiet past `BROWSER_TEARDOWN_REMIND_MIN` — mechanical, not
probabilistic. Reuse this two-hook pattern (`SessionEnd` + `Stop`, not either
alone) for any future "must release a shared resource, even if the session
never exits cleanly" case. See
`docs/solutions/workflow-issues/browser-qa-false-blockers-credential-refusal-and-stale-claims-20260729.md`.

### Pitfall: Similar-looking MCP tool surfaces can be architecturally opposite
_Added by soloship-learn 2026-07-29_
Two MCP browser surfaces (Google's Chrome DevTools MCP and the Claude in
Chrome extension) both present as "a Chrome window with automation attached,"
but one launches its own fully isolated managed Chrome with no access to the
user's data and the other IS the user's real, logged-in everyday Chrome. A
first-draft rule conflated them under one label; the correction only happened
because the maintainer could observe a second application window opening that
clearly wasn't his daily browser. Before naming or ranking any browser/tool
MCP surface in a rule, verify empirically what it actually connects to (e.g.
`mcp__claude-in-chrome__list_connected_browsers`) rather than inferring from
the tool name or how it visually presents. See
`docs/solutions/workflow-issues/browser-qa-false-blockers-credential-refusal-and-stale-claims-20260729.md`.

### Pitfall: macOS git grep ERE has no `\b` — boundary regexes silently match nothing
_Added by soloship-learn 2026-07-23_
Any ERE handed to `git grep -E` (or POSIX grep) inside a generated hook script
must not use `\b` — it's a GNU-only atom; BSD/macOS regcomp never matches it,
and a fail-safe hook (exit 0 on internal error, correct design) converts the
dead regex into "nothing to report." Use `([^A-Za-z0-9_]|$)` boundary classes.
Every fail-safe hook needs must-fire behavioral fixtures (see
`__arch__/component-hook.test.ts` — exec the generated script with the real
`HOOK_MODIFIED_FILE` contract); a unit test of the builder string passes right
through this bug. See
`docs/solutions/integration-issues/macos-git-grep-ere-no-word-boundary-20260723.md`.

### Pitfall: installRulesAt only writes at cwd — multi-level installs shadow and drift
_Added by soloship-learn 2026-08-17_
There is no global installer: `installRulesAt` writes `<cwd>/.claude/rules/`
only, and `upgrade --force` refreshes only that level. Running init/upgrade at
home, workspace, and project levels over time leaves same-named rule files at
multiple ancestor levels — Claude Code loads ALL of them, and the copies drift
(found live 2026-08-13: two contradictory `deploy-from-main-only` variants in
one session's context). Never assume the template in rules.ts is what sessions
read; diff the installed stack. Doctor's planned rule-stack report makes this
visible; removal is tombstone-by-byte-match only. See
`docs/solutions/workflow-issues/2026-08-17-ancestor-rule-copies-shadow-and-drift.md`.
