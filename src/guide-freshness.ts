/**
 * Generated-reference-doc freshness — shared by `init` and `upgrade`.
 *
 * `docs/SOLUTION_GUIDE.md` is generated from the schema in
 * `solution-schema.ts` and written only when absent, so a project bootstrapped
 * under an older schema keeps its guide forever. The guide embeds a schema
 * version marker; this module compares it and reports staleness.
 *
 * It lives here rather than in `scaffold.ts` because BOTH entry points need it
 * and they need different halves: `init` scaffolds (create-if-missing),
 * `upgrade` only reports (it preserves project docs by contract). Duplicating
 * the check or the notice across the two would be the same one-definition
 * failure this whole schema fix exists to remove — the first version of this
 * feature shipped in `init` only, which meant the population that actually has
 * stale guides (existing projects, who run `upgrade`) never saw the report.
 */

import chalk from "chalk";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readSchemaVersion, SOLUTION_SCHEMA_VERSION } from "./solution-schema.js";
import { generateSolutionGuide } from "./templates.js";

/** "stale" = exists but generated against an older schema. Reported, never silently replaced. */
export type DocAction = "created" | "exists" | "updated" | "skipped" | "stale";

export interface DocResult {
  path: string;
  action: DocAction;
}

/** Suffix for the copy kept when a refresh rewrites an existing guide. */
export const BACKUP_SUFFIX = ".bak";

const SOLUTION_GUIDE_RELATIVE = "docs/SOLUTION_GUIDE.md";

/**
 * Reconcile the on-disk solution guide with the shipped schema.
 *
 * - absent + `createIfMissing` → written ("created"); absent otherwise → no result
 * - current → "exists"
 * - older or unmarked → "stale", or "updated" (+ a ".bak") when `refresh`
 *
 * Refresh is opt-in because the guide is a file projects extend — MAPS grew its
 * copy to 314 lines of tag registry on top of the generated base, and clobbering
 * that is worse than a stale header.
 */
export function syncSolutionGuide(
  root: string,
  options: { refresh?: boolean; createIfMissing?: boolean } = {}
): DocResult[] {
  const refresh = options.refresh ?? false;
  const createIfMissing = options.createIfMissing ?? false;
  const absolutePath = join(root, SOLUTION_GUIDE_RELATIVE);

  if (!existsSync(absolutePath)) {
    if (!createIfMissing) return [];
    writeFileSync(absolutePath, generateSolutionGuide());
    return [{ path: SOLUTION_GUIDE_RELATIVE, action: "created" }];
  }

  const version = readSchemaVersion(readFileSync(absolutePath, "utf8"));
  const isCurrent = version !== null && version >= SOLUTION_SCHEMA_VERSION;
  if (isCurrent) {
    return [{ path: SOLUTION_GUIDE_RELATIVE, action: "exists" }];
  }

  if (!refresh) {
    return [{ path: SOLUTION_GUIDE_RELATIVE, action: "stale" }];
  }

  renameSync(absolutePath, absolutePath + BACKUP_SUFFIX);
  writeFileSync(absolutePath, generateSolutionGuide());
  return [
    { path: SOLUTION_GUIDE_RELATIVE, action: "updated" },
    { path: SOLUTION_GUIDE_RELATIVE + BACKUP_SUFFIX, action: "created" },
  ];
}

/** The icon a result gets in CLI output. Stale is red — it needs an action, not a shrug. */
export function actionIcon(action: DocAction): string {
  if (action === "created") return chalk.green("+");
  if (action === "skipped") return chalk.dim("-");
  if (action === "stale") return chalk.red("!");
  return chalk.yellow("~");
}

/**
 * Print the remedy for any stale docs. A stale reference doc is the one result
 * that needs an instruction rather than just an icon: it describes rules that no
 * longer hold, and the failure this ends is a stale guide sitting unnoticed
 * behind an "(exists)" line for months.
 *
 * `command` differs per entry point so the suggested fix is the one the user is
 * already running.
 */
export function printStaleNotice(results: DocResult[], command: string): void {
  const stale = results.filter((result) => result.action === "stale");
  if (stale.length === 0) return;

  console.log("");
  console.log(
    chalk.red.bold("  Stale reference docs — generated against an older schema:")
  );
  for (const doc of stale) {
    console.log(`    ${doc.path}`);
  }
  console.log(
    chalk.dim(
      "  These are NOT overwritten automatically — your project may have extended them."
    )
  );
  console.log(
    chalk.dim("  To refresh (keeps a .bak of each): ") + command
  );
}
