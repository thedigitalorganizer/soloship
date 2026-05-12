#!/usr/bin/env bash
# Soloship gs-browse — self-sufficient first-run build.
#
# Builds three artifacts into dist/:
#   - dist/browse           (~55MB CLI launcher, bun --compile of src/cli.ts)
#   - dist/find-browse      (~55MB path-discovery exe, bun --compile of src/find-browse.ts)
#   - dist/server-node.mjs  (Windows Node.js fallback, via scripts/build-node-server.sh)
#
# The binaries are compiled for the user's current architecture. Soloship does
# NOT ship pre-compiled binaries — they're built on first invocation. That
# avoids the arch-mismatch class of bugs that surface when a binary built on
# (say) an arm64 machine fails on an x86_64 machine, or when a binary committed
# at project-level breaks for team members on a different architecture.
#
# This script is idempotent and self-sufficient:
#   1. Installs bun if missing (SHA-pinned)
#   2. Adds ~/.bun/bin to PATH for the current shell session
#   3. Runs bun install (if node_modules is missing)
#   4. Compiles the launcher for the host arch
#   5. Builds the Node.js fallback bundle
#   6. Runs `bun x playwright install chromium` (downloads Chromium if missing)

set -e

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$SKILL_DIR/src"
DIST_DIR="$SKILL_DIR/dist"

cd "$SKILL_DIR"

# ─── Pre-flight: bun ──────────────────────────────────────────────

# Make ~/.bun/bin visible to this script even if the user's shell hasn't loaded
# it (Bash tool invocations from agents skip interactive .zshrc).
if [ -d "$HOME/.bun/bin" ]; then
  export PATH="$HOME/.bun/bin:$PATH"
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "[gs-browse-build] bun not found — installing pinned version…"
  BUN_VERSION="1.3.10"
  BUN_INSTALL_SHA="bab8acfb046aac8c72407bdcce903957665d655d7acaa3e11c7c4616beae68dd"
  tmpfile=$(mktemp)
  curl -fsSL "https://bun.sh/install" -o "$tmpfile"
  actual_sha=$(shasum -a 256 "$tmpfile" | awk '{print $1}')
  if [ "$actual_sha" != "$BUN_INSTALL_SHA" ]; then
    echo "ERROR: bun install script checksum mismatch" >&2
    echo "  expected: $BUN_INSTALL_SHA" >&2
    echo "  got:      $actual_sha" >&2
    rm "$tmpfile"; exit 1
  fi
  BUN_VERSION="$BUN_VERSION" bash "$tmpfile"
  rm "$tmpfile"
  export PATH="$HOME/.bun/bin:$PATH"
  if ! command -v bun >/dev/null 2>&1; then
    echo "ERROR: bun installer ran but bun is still not on PATH." >&2
    echo "  Try opening a new terminal and re-running this script." >&2
    exit 1
  fi
fi
echo "[gs-browse-build] bun: $(bun --version) ($(which bun))"

# ─── Install dependencies ─────────────────────────────────────────

if [ ! -d "$SKILL_DIR/node_modules" ]; then
  echo "[gs-browse-build] installing dependencies (bun install)…"
  bun install --no-progress
else
  echo "[gs-browse-build] node_modules present, skipping bun install"
fi

mkdir -p "$DIST_DIR"

# ─── Build dist/browse (CLI launcher) ─────────────────────────────

ARCH="$(uname -m)"
echo "[gs-browse-build] compiling dist/browse for $ARCH (bun --compile src/cli.ts)…"
bun build --compile "$SRC_DIR/cli.ts" --outfile "$DIST_DIR/browse"
chmod +x "$DIST_DIR/browse"

# ─── Build dist/find-browse (path discovery) ──────────────────────

echo "[gs-browse-build] compiling dist/find-browse for $ARCH (bun --compile src/find-browse.ts)…"
bun build --compile "$SRC_DIR/find-browse.ts" --outfile "$DIST_DIR/find-browse"
chmod +x "$DIST_DIR/find-browse"

# ─── Build dist/server-node.mjs (Windows Node.js fallback) ────────

echo "[gs-browse-build] building Windows Node.js fallback (server-node.mjs)…"
bash "$SKILL_DIR/scripts/build-node-server.sh"

# ─── Install Playwright Chromium ──────────────────────────────────

# Playwright auto-downloads Chromium on first use, but we trigger it here so
# the first /gs-qa or /gs-design-review call doesn't take an extra minute.
# `bun x playwright install chromium` is idempotent — skips if cache hit.
echo "[gs-browse-build] ensuring Playwright Chromium is installed…"
bun x playwright install chromium 2>&1 | tail -3

# ─── Record version metadata ──────────────────────────────────────

GIT_REV="$(git -C "$SKILL_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
echo "$GIT_REV" > "$DIST_DIR/.version"

# ─── Cleanup bun --compile temp files ─────────────────────────────

(rm -f "$SKILL_DIR"/.*.bun-build || true)

# ─── Summary ──────────────────────────────────────────────────────

echo "[gs-browse-build] DONE. Built artifacts (arch: $ARCH):"
ls -lh "$DIST_DIR/browse" "$DIST_DIR/find-browse" "$DIST_DIR/server-node.mjs" "$DIST_DIR/.version"
echo "[gs-browse-build] Subsequent /gs-qa, /gs-design-review, etc. will reuse these artifacts."
