#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const REQUIRED_RULE_COUNT = 7;
const REQUIRED_SKILL_COUNT = 51;
const REQUIRED_AGENT_PROMPT_COUNT = 5;
const SKILLS_DIR = "skills";
const COMMANDS_DIR = "commands";
// Phase 6 of docs/plans/2026-08-27-one-source-of-truth-across-agent-hosts.md:
// the 7 rules moved from a map in rules.ts (now prune-only, no map left) to
// safety-gates.ts's SAFETY_GATE_FILENAMES; hooks stopped being one Claude-only
// enumeration and are now shared gate scripts across 4 hosts, so a flat
// "count the build*Script functions in hooks.ts" no longer means what it used
// to. countRegisteredRules/countHookScripts below were rewritten accordingly.
const RULES_SOURCE = join("src", "safety-gates.ts");
const HOOKS_SOURCE = join("src", "hooks.ts");
const GATES_SOURCE = join("src", "committed-gates.ts");
// Cursor's hook set is untouched by this plan (Phase 1 explicitly left it
// alone — see committed-gates work) and has no shared-source count to derive
// from, so it stays a hand-maintained constant like the others were before
// this file existed. Update it only if Cursor's own hook count changes.
const CURSOR_HOOK_COUNT = 3;

// Prose docs state counts ("25 hook protections", "18 workflow rules") that
// nothing verified, so they drifted silently. On 2026-07-31 README.md claimed
// 18 hook protections in one place and 17 in another while its own enumeration
// listed 19 (actual: 25); AGENTS.md was at 43 skills / 14 rules / 10 hooks.
// Each entry asserts every occurrence of `pattern` in `file` equals the live
// count from source. Rewording a phrase fails this check by design — update the
// pattern deliberately rather than letting the number rot.
const DOC_COUNT_CHECKS = [
  { file: "README.md", pattern: /(\d+) hook protections/g, truth: "hooks" },
  { file: "README.md", pattern: /(\d+) always-on safety gates/g, truth: "rules" },
  { file: "README.md", pattern: /(\d+) workflow skills/g, truth: "skills" },
  { file: "AGENTS.md", pattern: /(\d+) skills for audit/g, truth: "skills" },
  { file: "AGENTS.md", pattern: /\((\d+) rules\)/g, truth: "rules" },
  { file: "AGENTS.md", pattern: /\((\d+) hooks\)/g, truth: "hooks" },
];

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

function listSkillNames() {
  const skillsRoot = join(repoRoot, SKILLS_DIR);
  if (!existsSync(skillsRoot)) return [];
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(join(skillsRoot, entry.name, "SKILL.md"))
    )
    .map((entry) => entry.name);
}

function countSkillFiles() {
  return listSkillNames().length;
}

// Claude Code 2.1.219+ resolves commands/ and skills/ in ONE namespace — the
// component inventory has no separate "Commands (N)" line. A command file whose
// name matches a skill directory registers a second entry under the same name,
// the command wins, and the real skill becomes unreachable. Soloship shipped 46
// such collisions through v0.20.0: every /soloship:* returned a 4-line shim and
// always-on token cost doubled (~10.9k). See Gotcha 8 in
// docs/solutions/best-practices/claude-code-plugin-format-gotchas-SoloshipPlugin-20260512.md
function findCommandSkillCollisions() {
  const commandsRoot = join(repoRoot, COMMANDS_DIR);
  if (!existsSync(commandsRoot)) return [];
  const skillNames = new Set(listSkillNames());
  return readdirSync(commandsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name.replace(/\.md$/, ""))
    .filter((name) => skillNames.has(name));
}

function countAgentPrompts() {
  const promptsRoot = join(repoRoot, "skills", "references", "agents");
  if (!existsSync(promptsRoot)) return 0;
  return readdirSync(promptsRoot, { withFileTypes: true }).filter(
    (entry) => entry.isFile() && entry.name.endsWith(".md")
  ).length;
}

// Count the 7 always-on rules — the entries of SAFETY_GATE_FILENAMES in
// safety-gates.ts, rendered once into every AGENTS.md's `## Safety gates`
// section rather than written per-host (rules.ts, despite the filename, no
// longer writes rule files at all — it only prunes old generated ones).
// Reading the source (rather than a compiled import) keeps this runnable
// pre-build, the same as every other check here.
function countSharedGateNames() {
  const gatesSource = join(repoRoot, GATES_SOURCE);
  if (!existsSync(gatesSource)) return 0;
  const source = readFileSync(gatesSource, "utf-8");
  const match = source.match(/export const GATE_NAMES = \[([\s\S]*?)\] as const;/);
  if (!match) return 0;
  return (match[1].match(/"[a-z0-9-]+"/g) || []).length;
}

// Claude and Antigravity each report most of their hooks as one
// `results.push("<Event>: description")` call per hook, so those are still
// individually countable by grepping for the event-name prefix. Codex's
// installer reports its whole PreToolUse set as ONE combined line (it has
// nothing but the shared gates), and Antigravity reports its shared portion
// the same way — both of those get added back in as countSharedGateNames(),
// once per host, rather than being (mis)counted as a single hook each. See
// README.md's "How it works" section for the human-readable version of this
// same breakdown.
function countHookScripts() {
  const hooksSource = join(repoRoot, HOOKS_SOURCE);
  if (!existsSync(hooksSource)) return 0;
  const source = readFileSync(hooksSource, "utf-8");
  const individuallyReported = (
    source.match(
      /results\.push\("(PreToolUse|PostToolUse|Stop|SessionStart|SessionEnd|beforeShellExecution|preToolUse|stop)/g
    ) || []
  ).length;
  const sharedGates = countSharedGateNames();
  // individuallyReported already includes Claude's 8 shared + 5 own PreToolUse,
  // 3 PostToolUse, 3 Stop, 2 SessionStart, 2 SessionEnd (21), plus
  // Antigravity's 2 own (file-protection, stop-check) — 23 total. Codex's
  // hooks are ENTIRELY the shared set (reported as one combined line, so add
  // sharedGates once); Antigravity's shared portion is also one combined line
  // (add sharedGates again); Cursor is untouched, hand-maintained.
  return individuallyReported + sharedGates * 2 + CURSOR_HOOK_COUNT;
}

function checkDocumentedCounts(truths) {
  for (const { file, pattern, truth } of DOC_COUNT_CHECKS) {
    const absolutePath = join(repoRoot, file);
    if (!existsSync(absolutePath)) {
      errors.push(`${file} is missing (documented-count check)`);
      continue;
    }
    const contents = readFileSync(absolutePath, "utf-8");
    const found = [...contents.matchAll(pattern)].map((m) => Number(m[1]));
    if (found.length === 0) {
      errors.push(
        `${file}: no match for ${pattern} — the phrase moved or was reworded, so the ` +
          `${truth} count is no longer verified. Update DOC_COUNT_CHECKS to match the new wording.`
      );
      continue;
    }
    const expected = truths[truth];
    const wrong = found.filter((n) => n !== expected);
    if (wrong.length > 0) {
      errors.push(
        `${file}: documented ${truth} count is stale — says ${[...new Set(wrong)].join("/")}, ` +
          `actual is ${expected} (pattern ${pattern})`
      );
    }
  }
}

function countRegisteredRules() {
  const rulesSource = join(repoRoot, RULES_SOURCE);
  if (!existsSync(rulesSource)) return 0;
  const source = readFileSync(rulesSource, "utf-8");
  const match = source.match(/export const SAFETY_GATE_FILENAMES = \[([\s\S]*?)\] as const;/);
  if (!match) return 0;
  return (match[1].match(/"[a-z0-9-]+\.md"/g) || []).length;
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

function validateAntigravityManifest(antigravityPlugin, packageVersion) {
  if (!antigravityPlugin) return;

  if (antigravityPlugin.name !== "soloship") {
    errors.push(".antigravity-plugin/plugin.json name must be soloship");
  }
  if (!SEMVER_RE.test(antigravityPlugin.version || "")) {
    errors.push(".antigravity-plugin/plugin.json version must be strict semver");
  }
  if (baseVersion(antigravityPlugin.version) !== packageVersion) {
    errors.push(
      `.antigravity-plugin/plugin.json base version ${baseVersion(
        antigravityPlugin.version
      )} does not match package.json ${packageVersion}`
    );
  }
  if (antigravityPlugin.skills !== "./skills/") {
    errors.push('.antigravity-plugin/plugin.json skills must be "./skills/"');
  }
}

const packageJson = readJson("package.json");
const claudePlugin = readJson(".claude-plugin/plugin.json");
const claudeMarketplace = readJson(".claude-plugin/marketplace.json");
const codexPlugin = readJson(".codex-plugin/plugin.json");
const codexMarketplace = readJson(".agents/plugins/marketplace.json");
const antigravityPlugin = readJson(".antigravity-plugin/plugin.json");

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
validateAntigravityManifest(antigravityPlugin, packageVersion);

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

// REQUIRED_RULE_COUNT used to be declared and printed but never asserted — the
// validator reported "12 rules expected" while src/rules.ts registered 13, and
// passed. A count that is displayed but not checked is worse than no check: it
// reads as verification. Count the rules actually registered in the RULES map.
const ruleCount = countRegisteredRules();
if (ruleCount !== REQUIRED_RULE_COUNT) {
  errors.push(
    `expected ${REQUIRED_RULE_COUNT} rules registered in src/safety-gates.ts, found ${ruleCount}`
  );
}

checkDocumentedCounts({
  skills: skillCount,
  rules: ruleCount,
  hooks: countHookScripts(),
});

const collisions = findCommandSkillCollisions();
if (collisions.length > 0) {
  errors.push(
    `${collisions.length} command file(s) collide with skill directories of the same name ` +
      `(commands/ and skills/ share one namespace — the command shadows the skill and the ` +
      `workflow becomes unreachable): ${collisions.join(", ")}`
  );
}

if (!existsSync(join(repoRoot, SKILLS_DIR, "references", "codex-compatibility.md"))) {
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
