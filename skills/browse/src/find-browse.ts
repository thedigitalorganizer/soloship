/**
 * find-browse — locate the Soloship-bundled browse binary.
 *
 * Compiled to skills/browse/dist/find-browse (standalone binary, no bun runtime needed).
 * Outputs the absolute path to the browse binary on stdout, or exits 1 if not found.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { readdirSync } from 'fs';

// ─── Binary Discovery ───────────────────────────────────────────

function getGitRoot(): string | null {
  try {
    const proc = Bun.spawnSync(['git', 'rev-parse', '--show-toplevel'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (proc.exitCode !== 0) return null;
    return proc.stdout.toString().trim();
  } catch {
    return null;
  }
}

export function locateBinary(): string | null {
  const root = getGitRoot();
  const home = homedir();
  const candidates: string[] = [];

  // 1. Workspace-local (for development inside a Soloship-installed project)
  if (root) {
    candidates.push(join(root, '.claude', 'skills', 'soloship', 'skills', 'browse', 'dist', 'browse'));
    candidates.push(join(root, '.claude', 'skills', 'browse', 'dist', 'browse'));
  }

  // 2. Global Soloship installs — Claude Code plugin and user skill paths
  candidates.push(join(home, '.claude', 'plugins', 'marketplaces', 'soloship', 'skills', 'browse', 'dist', 'browse'));
  candidates.push(join(home, '.claude', 'skills', 'soloship', 'skills', 'browse', 'dist', 'browse'));
  candidates.push(join(home, '.claude', 'skills', 'browse', 'dist', 'browse'));

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }

  // 3. Glob fallback: any plugin-style install under ~/.claude/plugins/.
  //    Plugins land under a marketplace dir; the soloship plugin can also be
  //    installed directly. Scan one level deep.
  try {
    const pluginsRoot = join(home, '.claude', 'plugins');
    if (existsSync(pluginsRoot)) {
      for (const dir of readdirSync(pluginsRoot)) {
        const direct = join(pluginsRoot, dir, 'soloship', 'skills', 'browse', 'dist', 'browse');
        if (existsSync(direct)) return direct;
        // marketplace layout: ~/.claude/plugins/<marketplace>/<plugin>/skills/...
        const marketplaceDir = join(pluginsRoot, dir);
        try {
          for (const sub of readdirSync(marketplaceDir)) {
            const candidate = join(marketplaceDir, sub, 'skills', 'browse', 'dist', 'browse');
            if (existsSync(candidate)) return candidate;
          }
        } catch {
          // not a dir or unreadable — keep going
        }
      }
    }
  } catch {
    // home/.claude/plugins missing — fall through to null
  }

  return null;
}

// ─── Main ───────────────────────────────────────────────────────

function main() {
  const bin = locateBinary();
  if (!bin) {
    process.stderr.write('ERROR: browse binary not found. Run scripts/build-soloship.sh inside the browse skill dir.\n');
    process.exit(1);
  }

  console.log(bin);
}

// Only run main() when this module is the entry point. Without this guard,
// any test that imports `locateBinary` from this file would have main() fire
// at module-load time, calling process.exit(1) when no compiled binary
// exists — killing the test process before any test runs.
if (import.meta.main) {
  main();
}
