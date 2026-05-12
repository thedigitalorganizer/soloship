---
module: gs-browse
date: 2026-05-11
problem_type: best_practice
component: tooling
symptoms:
  - "Intel Mac users get 'bad CPU type in executable' on first /gs-qa invocation"
  - "Plugin install completes successfully but binary fails immediately on run"
  - "Project-level installs break for team members on a different CPU architecture"
  - "Customer cannot use any browse-dependent skill until rebuilding from source"
root_cause: incomplete_setup
resolution_type: workflow_improvement
severity: high
tags: [arch-mismatch, prebuilt-binary, cross-platform, plugin-distribution, bun-compile, gs-browse]
---

# Troubleshooting: Pre-compiled binaries in plugin installs cause arch mismatch on first install

## Problem

Soloship v0.1.1 shipped a pre-compiled `dist/browse` launcher binary (and `dist/find-browse`) inside the Claude Code plugin install, intending to save customers a ~30-second compile step on first use. The binary was compiled on the maintainer's arm64 Mac. When a customer (or the maintainer himself, on a second Intel Mac) installed the plugin, the binary failed immediately with `bad CPU type in executable`. The entire browse-dependent skill family (`/gs-qa`, `/gs-design-review`, `/gs-plan-design-review`, `/gs-office-hours`) was unusable until the customer manually rebuilt the binary from source.

## Environment

- Module: gs-browse (Claude Code plugin skill, vendored from gstack v1.31.1.0)
- Affected Component: Plugin distribution / native-compiled launcher binary
- Build tool: `bun build --compile`
- Stage: Post-implementation (surfaced in v0.1.1 fresh-machine test; fixed in v0.1.2)
- Date: 2026-05-11

## Symptoms

- Plugin clone via `/plugin marketplace add` completes successfully
- First invocation of any browse-dependent skill triggers SETUP block
- SETUP block reports `READY: <path>/dist/browse` (because the binary file IS executable on disk)
- First actual command (`$B goto <url>`, `$B status`, etc.) fails with `bad CPU type in executable`
- Customer has no obvious next step — the skill doesn't know how to recover
- Same failure mode triggers when a project commits a built `dist/browse` at project scope and a team member with a different arch tries to use it
- Same failure mode triggers when a single user upgrades from Intel → arm64 (or vice versa) and their previously-built binary becomes invalid

## What Didn't Work

**Attempted Solution 1: Cross-compile both architectures and ship both.**
- **Approach:** Use `bun build --compile --target=bun-darwin-arm64` and `--target=bun-darwin-x64` to produce two binaries; have SETUP pick via `uname -m`.
- **Why this was rejected:** Doesn't generalize. Doubles the plugin clone size (~220MB instead of ~110MB). Doesn't help Linux or Windows users (would need a 3rd/4th binary). Still doesn't solve the project-level-commit + team-member-different-arch failure mode — only the first-install-from-marketplace case.

**Attempted Solution 2: Document the requirement, ask customers to rebuild.**
- **Approach:** Ship the arm64 binary as default, document that Intel Macs need to run `scripts/build-soloship.sh` first.
- **Why this was rejected:** Forces non-coder customers to read docs and run a shell script before the skill works. The whole point of the plugin install is "it works immediately." Documentation as a workaround for a broken install is hostile UX.

## Solution

**Stop shipping pre-compiled binaries entirely. Build on first use, per host machine.**

Changes shipped in Soloship v0.1.2 → v0.1.3:

1. `.gitignore` now excludes `skills/gs-browse/dist/browse`, `dist/find-browse`, and `dist/.version`. Only `dist/server-node.mjs` (the Windows Node.js fallback bundle, arch-neutral and ~530KB) and `dist/bun-polyfill.cjs` stay tracked.

2. `scripts/build-soloship.sh` is genuinely self-sufficient — installs bun (SHA-pinned), runs `bun install`, compiles for the host architecture, builds the Windows fallback, downloads Playwright Chromium. One invocation, ~2 minutes one-time per machine.

3. SETUP blocks in all five browse-aware skills (`gs-browse`, `gs-design-review`, `gs-qa`, `gs-office-hours`, `gs-plan-design-review`) now distinguish three states:
   - `READY: <path>` — binary present, ready to use
   - `NEEDS_SETUP: <path-to-build-script>` — skill installed, binary missing → run the script
   - `NEEDS_SETUP_NO_DIR` — Soloship plugin not installed at all → tell the user

4. SETUP blocks also prepend `~/.bun/bin` to `PATH` explicitly so a freshly-installed bun is reachable in non-interactive shells (Bash tool subshells skip `~/.zshrc`).

**Code changes — `.gitignore`:**

```diff
 node_modules/
 dist/
-# The gs-browse skill ships its compiled launcher binary inside the plugin —
-# users get the prebuilt artifact via the Claude Code plugin clone.
-!skills/gs-browse/dist/
-!skills/gs-browse/dist/**
+# gs-browse builds its launcher binaries on first invocation (per-arch) rather
+# than shipping them. dist/server-node.mjs is the Windows fallback bundle —
+# small and arch-neutral, so we do ship it. Arch-specific compiled binaries
+# stay out of git.
+!skills/gs-browse/dist/
+skills/gs-browse/dist/browse
+skills/gs-browse/dist/find-browse
+skills/gs-browse/dist/.version
```

**Code changes — SETUP block (excerpt from `skills/gs-browse/SKILL.md`):**

```bash
# Before: assumed binary was always present at a fixed path
B="$HOME/.claude/plugins/marketplaces/soloship/skills/gs-browse/dist/browse"
[ -x "$B" ] && echo "READY: $B" || echo "NEEDS_SETUP"

# After: discover skill dir, then check for compiled binary, report exact rebuild path
[ -d "$HOME/.bun/bin" ] && export PATH="$HOME/.bun/bin:$PATH"
GSB_DIR=""
for CANDIDATE in \
  "$HOME/.claude/plugins/marketplaces/soloship/skills/gs-browse" \
  "$HOME/.claude/skills/soloship/skills/gs-browse" \
  "$HOME/.claude/skills/gs-browse" \
  ".claude/skills/soloship/skills/gs-browse"; do
  if [ -d "$CANDIDATE" ]; then GSB_DIR="$CANDIDATE"; break; fi
done
if [ -n "$GSB_DIR" ] && [ -x "$GSB_DIR/dist/browse" ]; then
  echo "READY: $GSB_DIR/dist/browse"
elif [ -n "$GSB_DIR" ]; then
  echo "NEEDS_SETUP: $GSB_DIR/scripts/build-soloship.sh"
else
  echo "NEEDS_SETUP_NO_DIR: gs-browse skill directory not found under \$HOME/.claude/"
fi
```

**Commands run by user on first invocation:**

```bash
# SETUP reports NEEDS_SETUP: /Users/.../skills/gs-browse/scripts/build-soloship.sh
# Agent prompts user; user approves; agent runs:
bash /Users/.../skills/gs-browse/scripts/build-soloship.sh
# Script installs bun if missing, runs bun install, compiles for host arch,
# downloads Playwright Chromium. ~2 min total.
# Subsequent SETUP calls return READY:.
```

## Why This Works

**Root cause:** `bun build --compile` produces a native-architecture executable that embeds the Bun runtime and compiled bytecode targeted at a specific CPU. Once compiled, the binary cannot run on a different CPU architecture, even if the underlying OS and source code are identical. This is fundamental to native compilation — the same property that makes the binary fast at runtime also makes it non-portable across architectures.

The v0.1.1 strategy assumed the maintainer's build machine had a representative architecture. That assumption fails as soon as one customer or contributor has a different arch — and in 2026 the Mac install base is split between arm64 (Apple Silicon) and x86_64 (still in service Intel Macs). A non-trivial chunk of customers were guaranteed to hit this.

Build-on-first-use sidesteps the entire class of problems because each machine compiles for its own architecture at install time. The trade-off — a one-time 2-minute setup cost per machine — is much smaller than the cost of "the plugin doesn't work at all" for the affected customers.

**Adjacent benefit:** `bun --compile` isn't really producing a standalone binary anyway. The compiled launcher spawns `bun src/server.ts` at runtime, which requires the source tree + `node_modules` to be present on disk. So the "shipping a binary saves time" framing was always somewhat misleading — we were never shipping a true standalone executable, just a small launcher that depends on the source tree being there. Removing the binary from git doesn't lose true standalone-ness; the system was never truly standalone.

## Prevention

**Default-mode for native-compiled artifacts in plugin installs:** Don't ship them. Build on first use. The ~30-60 second one-time cost per machine is dwarfed by the cost of arch-mismatch breakage.

**The "what if customer has a different CPU?" question:** Add it to the architecture review checklist for any new build artifact. If the answer is "the artifact breaks," design for build-on-first-use from day one.

**Bytecode interpreted runtimes are safer:** Java (JVM bytecode), .NET (CIL), Python (.pyc) compile to architecture-neutral representations that the runtime interprets per-machine. Native AOT compilation (Go binaries, Rust binaries, `bun --compile`) is what creates this class of bug.

**Project-scope artifacts are a separate failure mode:** Even build-on-first-use can fail when a single user commits the built artifact to a project that other team members share, or when a single user upgrades their machine across the arm64/x86_64 line. The `.gitignore` rules need to actively block the artifact from being committed (which is what we did) — relying on convention isn't enough.

**Verification before claiming "ready" in install instructions:** If your install flow says "binary at X is ready to use," your test for that should be `run the binary on a fresh machine with a different arch than the build machine`, not just `stat the binary on the build machine`. The fresh-machine test is what surfaced this in Phase 5 of the gs-browse rebuild.

## Related Issues

No related issues documented yet — this is Soloship's first solution doc.

For the broader context that surfaced this issue, see:
- `docs/known-issues/gs-browse.md` — the v0.1.1 → v0.1.2 testing report that flagged this and three sibling issues (build-soloship.sh didn't auto-install bun, bun PATH not propagating to non-interactive shells, daemon's silent-fallback-to-help on unknown commands).
- CHANGELOG entries for `[0.1.2]` and `[0.1.3]` — the shipped fixes.
- `docs/plans/archive/2026-05-11-rebuild-gs-browse-for-soloship.md` — the original plan that proposed shipping the pre-built binary (Option A in Phase 4.5), and the Phase 5 fresh-machine test that exposed why that was wrong.
