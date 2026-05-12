/**
 * Project slug resolution for the browse daemon.
 *
 * Used by domain-skills (per-project storage) and sidebar prompt-context
 * injection. Cached after first call — slug is derived from the daemon's
 * git remote (or env override) and doesn't change between commands.
 *
 * Slug derivation mirrors `bin/remote-slug`:
 *   - `git remote get-url origin` → strip trailing `.git` → match owner/repo
 *     from SSH (`git@host:owner/repo`) or HTTPS (`https://host/owner/repo`)
 *     → output `owner-repo`.
 *   - On any failure, fall back to `basename(git-toplevel)` or `basename(cwd)`.
 */

import * as path from 'path';
import { execSync } from 'child_process';

let cachedSlug: string | null = null;

function deriveSlug(): string {
  // 1) Try git remote origin.
  try {
    const url = execSync('git remote get-url origin', {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (url) {
      const trimmed = url.replace(/\.git$/, '');
      const match = trimmed.match(/[:/]([^/]+)\/([^/]+)$/);
      if (match) return `${match[1]}-${match[2]}`;
    }
  } catch {
    // fall through to basename fallback
  }

  // 2) Fall back to basename of git toplevel or cwd.
  try {
    const top = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (top) return path.basename(top);
  } catch {
    // fall through
  }

  return path.basename(process.cwd()) || 'unknown';
}

export function getCurrentProjectSlug(): string {
  if (cachedSlug) return cachedSlug;
  // Allow explicit override (useful for daemon spawners and tests).
  const explicit = process.env.GSTACK_PROJECT_SLUG;
  if (explicit) {
    cachedSlug = explicit;
    return explicit;
  }
  cachedSlug = deriveSlug();
  return cachedSlug;
}

/** Reset cache; for tests only. */
export function _resetProjectSlugCache(): void {
  cachedSlug = null;
}
