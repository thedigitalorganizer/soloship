#!/usr/bin/env bash
# Soloship build entry point for the gs-browse daemon.
#
# Builds three artifacts into dist/:
#   - dist/browse           (~55MB launcher executable, bun --compile of src/cli.ts)
#   - dist/find-browse      (~55MB path-discovery executable, bun --compile of src/find-browse.ts)
#   - dist/server-node.mjs  (Windows Node.js fallback, via scripts/build-node-server.sh)
#
# The launcher binary spawns `bun src/server.ts` at runtime, so node_modules
# (playwright, diff, socks) must be installed alongside src/ for browse to work.
# This script does `bun install` first to populate node_modules, then compiles.

set -e

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$SKILL_DIR/src"
DIST_DIR="$SKILL_DIR/dist"

cd "$SKILL_DIR"

# ─── Pre-flight: bun ──────────────────────────────────────────────

if ! command -v bun >/dev/null 2>&1; then
  echo "ERROR: bun is required to build the gs-browse daemon." >&2
  echo "Install with: curl -fsSL https://bun.sh/install | bash" >&2
  exit 1
fi
echo "[gs-browse-build] bun: $(bun --version)"

# ─── Install dependencies ─────────────────────────────────────────

if [ ! -d "$SKILL_DIR/node_modules" ]; then
  echo "[gs-browse-build] installing dependencies (bun install)…"
  bun install --no-progress
else
  echo "[gs-browse-build] node_modules already present, skipping install"
fi

mkdir -p "$DIST_DIR"

# ─── Build dist/browse (CLI launcher) ─────────────────────────────

echo "[gs-browse-build] compiling dist/browse (bun --compile src/cli.ts)…"
bun build --compile "$SRC_DIR/cli.ts" --outfile "$DIST_DIR/browse"
chmod +x "$DIST_DIR/browse"

# ─── Build dist/find-browse (path discovery) ──────────────────────

echo "[gs-browse-build] compiling dist/find-browse (bun --compile src/find-browse.ts)…"
bun build --compile "$SRC_DIR/find-browse.ts" --outfile "$DIST_DIR/find-browse"
chmod +x "$DIST_DIR/find-browse"

# ─── Build dist/server-node.mjs (Windows Node.js fallback) ────────

echo "[gs-browse-build] building Windows Node.js fallback (server-node.mjs)…"
bash "$SKILL_DIR/scripts/build-node-server.sh"

# ─── Record version metadata ──────────────────────────────────────

GIT_REV="$(git -C "$SKILL_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
echo "$GIT_REV" > "$DIST_DIR/.version"

# ─── Cleanup bun --compile temp files ─────────────────────────────

# `bun build --compile` leaves dot-prefixed temp files in the cwd.
# Mirror upstream's `(rm -f .*.bun-build || true)` post-build step.
(rm -f "$SKILL_DIR"/.*.bun-build || true)

# ─── Summary ──────────────────────────────────────────────────────

echo "[gs-browse-build] DONE. Built artifacts:"
ls -lh "$DIST_DIR/browse" "$DIST_DIR/find-browse" "$DIST_DIR/server-node.mjs" "$DIST_DIR/.version"
