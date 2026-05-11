#!/usr/bin/env node
// prepublishOnly safety net — refuse to publish if package.json's version
// is already on the npm registry. Forces `npm version patch|minor|major`
// before any publish. See .claude/rules/publish-version-bump.md.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(here, "..", "package.json"), "utf-8")
);
const local = pkg.version;

let remote;
try {
  remote = execSync(`npm view ${pkg.name} version`, {
    stdio: ["ignore", "pipe", "ignore"],
  })
    .toString()
    .trim();
} catch {
  // Package not yet on registry — first publish, safe to proceed.
  process.exit(0);
}

if (local === remote) {
  console.error(
    `\nRefusing to publish: ${pkg.name}@${local} is already on the npm registry.`
  );
  console.error(
    `Bump the version first:  npm version patch  (or minor / major)\n`
  );
  process.exit(1);
}
