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
- `installHooks()` overwrites the whole `hooks` key of
  `.claude/settings.local.json`; other settings keys are preserved.
- `hooks.ts` exports SESSION_PRUNE_HOURS / SESSION_ACTIVE_MIN /
  SESSION_IDLE_MIN / DEPLOY_LOCK_STALE_MIN and rewrites them to
  `<git-common-dir>/soloship/config.json` on every SessionStart — skills read
  that file; never hardcode copies of these thresholds elsewhere.
- Rule count and skill count are asserted by
  `scripts/validate-plugin-metadata.js` — adding a rule in `rules.ts` or a
  skill dir requires bumping those constants.

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
