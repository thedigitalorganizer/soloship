# AGENTS.md — scripts/

## Scope

Release-time guard rails. These are not build steps and nothing in `src/`
imports them — they are invoked by npm lifecycle hooks and by hand to stop a bad
release from leaving the machine. Each one exists because a specific bad release
already happened.

## Contracts

Wired through `package.json` scripts; changing a filename here breaks those:

- `prepublishOnly` → `check-version.js` (runs automatically on every `npm publish`)
- `validate:plugins` / `codex:validate-plugin` → `validate-plugin-metadata.js`
- `codex:sync-local` → `sync-codex-plugin.js`

`validate-plugin-metadata.js` exits non-zero on any failure and prints every
error at once rather than stopping at the first — keep that behavior; a
partial report sends people through several fix-run cycles.

## Key Files

- `check-version.js` — refuses to publish when `package.json`'s version already
  exists on the npm registry. Forces a real `npm version` bump first.
- `validate-plugin-metadata.js` — the release gate. Asserts the four version
  manifests agree (package.json, both `.claude-plugin/` files, `.codex-plugin/`),
  the skill/rule/agent-prompt counts, no command/skill name collisions, and that
  counts stated in README.md and AGENTS.md match live source.
- `sync-codex-plugin.js` — mirrors the plugin into the local Codex plugin dir
  for dogfooding.

## Pitfalls

### Pitfall: A count that is displayed but not asserted reads as verification
_Added by soloship-learn 2026-07-31_

This file has now been bitten twice by the same shape. First inside the
validator: `REQUIRED_RULE_COUNT` was printed in the success line but never
compared, so it reported "12 rules expected" while `src/rules.ts` registered 13
— and passed. Then one layer out, in prose: README.md and AGENTS.md stated hook,
rule, and skill counts that nothing checked, and drifted so far that README gave
two different hook numbers in one file (18 and 17) while its own enumeration
listed 19 and the real number was 25. If you add a number to any output or any
doc, assert it against source in the same change, or don't state it at all.

### Pitfall: A pattern-based check that stops matching must fail, not pass
_Added by soloship-learn 2026-07-31_

`DOC_COUNT_CHECKS` greps prose for phrases like `25 hook protections`. If someone
rewords the sentence, a naive implementation finds zero matches and reports
success — silently dropping to zero coverage while looking green. Zero matches is
therefore an explicit error telling the author to update the pattern. Preserve
that when editing these checks: the whole point is that coverage can't lapse
quietly.

### Pitfall: Never add a `commands/*.md` that shares a name with a `skills/*/` dir
_Added by soloship-learn 2026-07-31_

Claude Code resolves commands and skills in one namespace. Same name = the
command shadows the skill and the workflow becomes unreachable. Soloship shipped
46 such collisions through v0.20.0. `findCommandSkillCollisions()` in
`validate-plugin-metadata.js` blocks reintroduction — don't weaken it.
