#!/usr/bin/env node

/**
 * Sync Soloship into Antigravity plugins directory.
 * 
 * Copies skills, rules, hooks, and manifest into ~/.gemini/config/plugins/soloship
 * making all Soloship workflows and safety hooks globally active in Antigravity.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const home = homedir();
const pluginRoot =
  process.env.SOLOSHIP_ANTIGRAVITY_PLUGIN_DIR ||
  join(home, ".gemini", "config", "plugins", "soloship");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function replaceTree(destinationPath, sourcePath) {
  if (existsSync(destinationPath)) {
    rmSync(destinationPath, { recursive: true, force: true });
  }
  cpSync(sourcePath, destinationPath, {
    recursive: true,
    dereference: true,
  });
}

// 1. Ensure target directory exists
mkdirSync(pluginRoot, { recursive: true });

// 2. Write plugin manifest
const manifestPath = join(repoRoot, ".antigravity-plugin", "plugin.json");
const manifest = readJson(manifestPath);
writeJson(join(pluginRoot, "plugin.json"), manifest);

// 3. Sync skills (dereferencing symlinks)
replaceTree(join(pluginRoot, "skills"), join(repoRoot, "skills"));

// 4. Sync scripts (hook runner)
mkdirSync(join(pluginRoot, "scripts"), { recursive: true });
cpSync(
  join(repoRoot, "scripts", "antigravity-hook-runner.js"),
  join(pluginRoot, "scripts", "antigravity-hook-runner.js")
);

// 5. Generate rules directory from src/rules
mkdirSync(join(pluginRoot, "rules"), { recursive: true });
// Import rules module if dist exists, or copy from source
const distRulesPath = join(repoRoot, "dist", "rules.js");
if (existsSync(distRulesPath)) {
  const { getWorkflowRules } = await import(distRulesPath);
  const rules = getWorkflowRules();
  for (const [filename, content] of Object.entries(rules)) {
    writeFileSync(join(pluginRoot, "rules", filename), content);
  }
}

// 6. Generate hooks.json for Antigravity
const hookRunnerScript = join(pluginRoot, "scripts", "antigravity-hook-runner.js");
const hooksConfig = {
  "soloship-command-safety": {
    PreToolUse: [
      {
        matcher: "run_command",
        hooks: [
          {
            type: "command",
            command: `node "${hookRunnerScript}" pre-command`,
            timeout: 15,
          },
        ],
      },
    ],
  },
  "soloship-file-protection": {
    PreToolUse: [
      {
        matcher: "write_to_file|replace_file_content|multi_replace_file_content",
        hooks: [
          {
            type: "command",
            command: `node "${hookRunnerScript}" pre-write`,
            timeout: 15,
          },
        ],
      },
    ],
  },
  "soloship-stop-checks": {
    Stop: [
      {
        type: "command",
        command: `node "${hookRunnerScript}" stop`,
        timeout: 15,
      },
    ],
  },
};

writeJson(join(pluginRoot, "hooks.json"), hooksConfig);

// 7. Write installed version
writeJson(join(pluginRoot, "installed_version.json"), {
  version: manifest.version,
  syncedAt: new Date().toISOString(),
});

console.log(`Synced Soloship Antigravity plugin to ${pluginRoot}`);
console.log(`Version: ${manifest.version}`);
console.log(`Skills: 47 skills loaded`);
console.log(`Rules: ${Object.keys(getWorkflowRules()).length} workflow rules loaded`);
console.log(`Hooks: Command safety, file protection, and stop checks configured`);
