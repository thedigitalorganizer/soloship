#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  lstatSync,
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
  process.env.SOLOSHIP_CODEX_PLUGIN_DIR || join(home, "plugins", "soloship");
const marketplacePath =
  process.env.SOLOSHIP_CODEX_MARKETPLACE_PATH ||
  join(home, ".agents", "plugins", "marketplace.json");
const marketplaceRoot = dirname(dirname(marketplacePath));
const marketplacePluginPath = "./plugins/soloship";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function localCachebuster() {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "")
    .replace("T", "-");
  return `local-${stamp}`;
}

function withCodexCachebuster(version) {
  const base = String(version).split("+")[0];
  return `${base}+codex.${localCachebuster()}`;
}

function lstatExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function replaceTree(destinationPath, sourcePath) {
  if (existsSync(destinationPath) || lstatExists(destinationPath)) {
    rmSync(destinationPath, { recursive: true, force: true });
  }
  cpSync(sourcePath, destinationPath, {
    recursive: true,
    dereference: true,
  });
}

mkdirSync(join(pluginRoot, ".codex-plugin"), { recursive: true });

const manifest = readJson(join(repoRoot, ".codex-plugin", "plugin.json"));
manifest.version = withCodexCachebuster(manifest.version);
writeJson(join(pluginRoot, ".codex-plugin", "plugin.json"), manifest);

replaceTree(join(pluginRoot, "skills"), join(repoRoot, "skills"));
replaceTree(join(pluginRoot, "agents"), join(repoRoot, "agents"));

mkdirSync(dirname(marketplacePath), { recursive: true });
let marketplace;
if (existsSync(marketplacePath)) {
  marketplace = readJson(marketplacePath);
} else {
  marketplace = {
    name: "personal",
    interface: {
      displayName: "Personal",
    },
    plugins: [],
  };
}

if (!marketplace.interface) {
  marketplace.interface = { displayName: marketplace.name || "Personal" };
}
if (!Array.isArray(marketplace.plugins)) {
  marketplace.plugins = [];
}

const entry = {
  name: "soloship",
  source: {
    source: "local",
    path: marketplacePluginPath,
  },
  policy: {
    installation: "AVAILABLE",
    authentication: "ON_INSTALL",
  },
  category: "Coding",
};

const existingIndex = marketplace.plugins.findIndex(
  (plugin) => plugin?.name === "soloship"
);
if (existingIndex >= 0) {
  marketplace.plugins[existingIndex] = entry;
} else {
  marketplace.plugins.push(entry);
}

writeJson(marketplacePath, marketplace);

console.log(`Synced Soloship Codex plugin to ${pluginRoot}`);
console.log(`Manifest version: ${manifest.version}`);
console.log(
  `Marketplace: ${marketplace.name} at ${marketplacePath} (${relative(
    marketplaceRoot,
    pluginRoot
  )})`
);
console.log("Next: codex plugin add soloship@personal");
console.log("Then start a new Codex thread so the refreshed skills load.");
