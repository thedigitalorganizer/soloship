#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const REQUIRED_RULE_COUNT = 11;
const REQUIRED_SKILL_COUNT = 44;
const REQUIRED_AGENT_PROMPT_COUNT = 5;

const errors = [];

function readJson(relativePath) {
  const absolutePath = join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    errors.push(`${relativePath} is missing`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(absolutePath, "utf-8"));
  } catch (error) {
    errors.push(`${relativePath} is not valid JSON: ${error.message}`);
    return null;
  }
}

function requireField(object, path, label = path.join(".")) {
  let current = object;
  for (const segment of path) {
    if (
      current === null ||
      typeof current !== "object" ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      errors.push(`${label} is missing`);
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function baseVersion(version) {
  return typeof version === "string" ? version.split("+")[0] : "";
}

function countSkillFiles() {
  const skillsRoot = join(repoRoot, "skills");
  if (!existsSync(skillsRoot)) return 0;
  return readdirSync(skillsRoot, { withFileTypes: true }).filter((entry) => {
    return (
      entry.isDirectory() &&
      existsSync(join(skillsRoot, entry.name, "SKILL.md"))
    );
  }).length;
}

function countAgentPrompts() {
  const promptsRoot = join(repoRoot, "skills", "references", "agents");
  if (!existsSync(promptsRoot)) return 0;
  return readdirSync(promptsRoot, { withFileTypes: true }).filter(
    (entry) => entry.isFile() && entry.name.endsWith(".md")
  ).length;
}

function validateCodexManifest(codexPlugin, packageVersion) {
  if (!codexPlugin) return;

  if (codexPlugin.name !== "soloship") {
    errors.push(".codex-plugin/plugin.json name must be soloship");
  }
  if (!SEMVER_RE.test(codexPlugin.version || "")) {
    errors.push(".codex-plugin/plugin.json version must be strict semver");
  }
  if (baseVersion(codexPlugin.version) !== packageVersion) {
    errors.push(
      `.codex-plugin/plugin.json base version ${baseVersion(
        codexPlugin.version
      )} does not match package.json ${packageVersion}`
    );
  }
  if (codexPlugin.skills !== "./skills/") {
    errors.push('.codex-plugin/plugin.json skills must be "./skills/"');
  }
  for (const unsupported of ["hooks", "apps", "mcpServers"]) {
    if (Object.prototype.hasOwnProperty.call(codexPlugin, unsupported)) {
      errors.push(
        `.codex-plugin/plugin.json must not declare ${unsupported} until companion files exist`
      );
    }
  }

  const interfaceBlock = requireField(codexPlugin, ["interface"], "interface");
  if (interfaceBlock && typeof interfaceBlock === "object") {
    for (const field of [
      "displayName",
      "shortDescription",
      "longDescription",
      "developerName",
      "category",
      "capabilities",
      "websiteURL",
      "defaultPrompt",
      "brandColor",
    ]) {
      requireField(interfaceBlock, [field], `interface.${field}`);
    }
  }
}

function validateCodexMarketplace(marketplace) {
  if (!marketplace) return;

  if (marketplace.name !== "soloship") {
    errors.push(".agents/plugins/marketplace.json name must be soloship");
  }
  requireField(
    marketplace,
    ["interface", "displayName"],
    "interface.displayName"
  );

  const plugins = marketplace.plugins;
  if (!Array.isArray(plugins)) {
    errors.push(".agents/plugins/marketplace.json plugins must be an array");
    return;
  }

  const entry = plugins.find((plugin) => plugin?.name === "soloship");
  if (!entry) {
    errors.push(".agents/plugins/marketplace.json must include soloship");
    return;
  }

  const source = requireField(entry, ["source"], "plugins[soloship].source");
  if (source?.source !== "url" && source?.source !== "local") {
    errors.push("Codex marketplace soloship source must be url or local");
  }
  if (source?.source === "url" && !source.url) {
    errors.push("Codex marketplace url source must include url");
  }
  if (source?.source === "local" && !source.path) {
    errors.push("Codex marketplace local source must include path");
  }

  if (entry.policy?.installation !== "AVAILABLE") {
    errors.push("Codex marketplace policy.installation must be AVAILABLE");
  }
  if (entry.policy?.authentication !== "ON_INSTALL") {
    errors.push("Codex marketplace policy.authentication must be ON_INSTALL");
  }
  if (!entry.category) {
    errors.push("Codex marketplace entry category is missing");
  }
}

const packageJson = readJson("package.json");
const claudePlugin = readJson(".claude-plugin/plugin.json");
const claudeMarketplace = readJson(".claude-plugin/marketplace.json");
const codexPlugin = readJson(".codex-plugin/plugin.json");
const codexMarketplace = readJson(".agents/plugins/marketplace.json");

const packageVersion = packageJson?.version;
if (!SEMVER_RE.test(packageVersion || "")) {
  errors.push("package.json version must be strict semver");
}

if (claudePlugin?.version !== packageVersion) {
  errors.push(
    `.claude-plugin/plugin.json version ${claudePlugin?.version} does not match package.json ${packageVersion}`
  );
}

const claudeMarketplaceEntry = claudeMarketplace?.plugins?.find(
  (plugin) => plugin?.name === "soloship"
);
if (!claudeMarketplaceEntry) {
  errors.push(".claude-plugin/marketplace.json must include soloship");
} else if (claudeMarketplaceEntry.version !== packageVersion) {
  errors.push(
    `.claude-plugin/marketplace.json version ${claudeMarketplaceEntry.version} does not match package.json ${packageVersion}`
  );
}

validateCodexManifest(codexPlugin, packageVersion);
validateCodexMarketplace(codexMarketplace);

const skillCount = countSkillFiles();
if (skillCount !== REQUIRED_SKILL_COUNT) {
  errors.push(`expected ${REQUIRED_SKILL_COUNT} active skills, found ${skillCount}`);
}

const agentPromptCount = countAgentPrompts();
if (agentPromptCount !== REQUIRED_AGENT_PROMPT_COUNT) {
  errors.push(
    `expected ${REQUIRED_AGENT_PROMPT_COUNT} skills/references/agents prompts, found ${agentPromptCount}`
  );
}

if (!existsSync(join(repoRoot, "skills", "references", "codex-compatibility.md"))) {
  errors.push("skills/references/codex-compatibility.md is missing");
}

if (errors.length > 0) {
  console.error("Plugin metadata validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Plugin metadata OK: ${packageVersion}, ${skillCount} skills, ${REQUIRED_RULE_COUNT} rules expected, ${agentPromptCount} research prompts.`
);
