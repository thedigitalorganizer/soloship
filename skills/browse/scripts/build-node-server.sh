#!/usr/bin/env bash
# Build a Node.js-compatible server bundle for Windows.
#
# On Windows, Bun can't launch or connect to Playwright's Chromium
# (oven-sh/bun#4253, #9911). This script produces a server bundle
# that runs under Node.js with Bun API polyfills.

set -e

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$SKILL_DIR/src"
DIST_DIR="$SKILL_DIR/dist"

echo "Building Node-compatible server bundle..."

# Step 1: Transpile server.ts to a single .mjs bundle (externalize runtime deps)
#
# Externalize packages with native addons, dynamic imports, or runtime resolution.
# If you add a new dependency that uses `await import()` or has a .node addon,
# add it here. Otherwise `bun build --outfile` will fail with
# "cannot write multiple output files without an output directory".
bun build "$SRC_DIR/server.ts" \
  --target=node \
  --outfile "$DIST_DIR/server-node.mjs" \
  --external playwright \
  --external playwright-core \
  --external diff \
  --external "bun:sqlite" \
  --external "@ngrok/ngrok"

# Step 2: Post-process
# Replace import.meta.dir with a resolvable reference
perl -pi -e 's/import\.meta\.dir/__browseNodeSrcDir/g' "$DIST_DIR/server-node.mjs"
# Bun's bundler injects `var __dirname = "<absolute build-machine path>"` for
# any module that references __dirname. That (a) bakes the build machine's
# filesystem path into the shipped, git-tracked bundle — a privacy leak in a
# public plugin — and (b) is wrong on every other machine, since that path
# won't exist there. The injected value is always the source dir, which is
# exactly what __browseNodeSrcDir resolves to at runtime — repoint __dirname
# at the portable shim so the bundle is both leak-free and correct anywhere.
perl -pi -e 's{var __dirname = "[^"]*";}{var __dirname = __browseNodeSrcDir;}g' "$DIST_DIR/server-node.mjs"
# Stub out bun:sqlite (macOS-only cookie import, not needed on Windows)
perl -pi -e 's|import { Database } from "bun:sqlite";|const Database = null; // bun:sqlite stubbed on Node|g' "$DIST_DIR/server-node.mjs"

# Step 3: Create the final file with polyfill header injected after the first line
{
  head -1 "$DIST_DIR/server-node.mjs"
  echo '// ── Windows Node.js compatibility (auto-generated) ──'
  echo 'import { fileURLToPath as _ftp } from "node:url";'
  echo 'import { dirname as _dn } from "node:path";'
  echo 'const __browseNodeSrcDir = _dn(_dn(_ftp(import.meta.url))) + "/src";'
  echo '{ const _r = createRequire(import.meta.url); _r("./bun-polyfill.cjs"); }'
  echo '// ── end compatibility ──'
  tail -n +2 "$DIST_DIR/server-node.mjs"
} > "$DIST_DIR/server-node.tmp.mjs"

mv "$DIST_DIR/server-node.tmp.mjs" "$DIST_DIR/server-node.mjs"

# Step 4: Copy polyfill to dist/
cp "$SRC_DIR/bun-polyfill.cjs" "$DIST_DIR/bun-polyfill.cjs"

# Step 5: Leak guard — this bundle is git-tracked and ships in a public plugin.
# Fail the build if any absolute build-machine path survived post-processing
# (covers __dirname, __filename, or any other path the bundler might inject in
# the future), so a leak can never reach a commit silently again.
if grep -qE '"/(Users|home|root)/[^"]+"' "$DIST_DIR/server-node.mjs"; then
  echo "ERROR: server-node.mjs contains an absolute build-machine path — refusing to ship." >&2
  echo "Offending literals:" >&2
  grep -oE '"/(Users|home|root)/[^"]+"' "$DIST_DIR/server-node.mjs" | sort -u >&2
  echo "Add a Step 2 perl rewrite that repoints it at a runtime-resolvable reference." >&2
  exit 1
fi

echo "Node server bundle ready: $DIST_DIR/server-node.mjs"
