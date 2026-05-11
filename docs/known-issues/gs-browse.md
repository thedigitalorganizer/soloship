---
date: 2026-05-11
status: open
component: gs-browse
source: vendored from gstack v1.31.1.0
---

# gs-browse — known issues

Issues observed in the Soloship-vendored `gs-browse` skill that originate in upstream gstack and don't have local fixes yet. None are shipping blockers — every one has a documented workaround.

## `snapshot -i -a -o <path>` errors with "Selector matched multiple elements"

**Symptom:** On pages with multiple elements sharing the same role + accessible name (e.g., two `[heading] "Section"` blocks, or several `[button] "Submit"` controls), the annotated screenshot pipeline can throw `Selector matched multiple elements. Be more specific or use @refs from 'snapshot'.` even though no `-s <selector>` flag was passed.

**Root cause:** The dedup logic in `src/snapshot.ts` (around line 224, "Disambiguate with nth() if multiple elements share role+name") doesn't disambiguate every duplicate case. The annotate pipeline ends up generating an ambiguous selector internally.

**Workaround:** Re-run the snapshot command. The error is intermittent — depends on whether the same duplicate set is still present when the second snapshot fires. Observed during QA testing on 2026-05-11 against a real login flow; the retry succeeded.

**Upstream:** Bug exists in gstack v1.31.1.0 (and prior). Worth filing against gstack/browse if encountered repeatedly.

## Daemon may swallow unknown-command errors when invoked from agents

**Symptom:** Running `$B cookie-clear` (a non-existent command) sometimes returns the full command-list help text rather than the expected `Unknown command: 'cookie-clear'. Did you mean ...?` message.

**Root cause:** Not fully verified. The unknown-command handler in `src/commands.ts:263-294` (`buildUnknownCommandError`) builds a proper error with Levenshtein suggestions, but the dispatch path may fall through to help output in some sub-paths. The full picture needs a clean repro session.

**Workaround:** If you get back a command list when you expected a result, treat that as "command not recognized." Check `$B --help` or this SKILL.md's command tables for the correct name.

## bun not on PATH in non-interactive shells

**Symptom:** After installing bun via the build script, subsequent invocations of `$B` (which the daemon shells out via bun internally) fail with `Executable not found in $PATH: 'bun'`. The bun installer adds itself to `~/.zshrc`, but `~/.zshrc` is only loaded by interactive shells. Bash tool calls from agents (and CI environments) spawn non-interactive shells that skip `~/.zshrc`.

**Fix in 0.1.2+:** The SETUP block in every browse-dependent skill (`gs-qa`, `gs-design-review`, etc.) and the `build-soloship.sh` script now prepend `~/.bun/bin` to `PATH` explicitly when the directory exists. Earlier installs may still be affected — re-run the SETUP from a current skill version, or manually add `export PATH="$HOME/.bun/bin:$PATH"` to your shell's session before invoking `$B`.

## Architecture-specific compiled binaries

**History:** Soloship v0.1.1 attempted to ship pre-compiled `dist/browse` binaries inside the plugin install. Because `bun --compile` produces native-arch executables, the shipped binary only worked on whichever Mac architecture it was built on (arm64 in v0.1.1's case). Intel Macs got a `bad CPU type in executable` error.

**Fix in 0.1.2+:** Soloship no longer ships pre-compiled binaries. The SETUP block detects a missing binary, points the user to `scripts/build-soloship.sh`, and the script compiles for the host architecture on first use. ~2 minutes one-time setup per machine; subsequent uses are instant. This also resolves the project-level-install + arch-upgrade failure mode (committing a binary at project scope and then moving to a different CPU).
