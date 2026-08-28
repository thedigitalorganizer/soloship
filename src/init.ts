import { input } from "@inquirer/prompts";
import { execSync } from "node:child_process";
import chalk from "chalk";
import {
  formatAgentSelection,
  parseAgentTarget,
  resolveAgentSelection,
  type AgentTarget,
} from "./agents.js";
import { detectProject, type ProjectInfo } from "./detect.js";
import { scaffoldDocs } from "./scaffold.js";
import { ensureSafetyGatesInAgentsMd } from "./templates.js";
import { actionIcon, printStaleNotice } from "./guide-freshness.js";
import {
  installHooks,
  installAntigravityHooks,
  installCursorHooks,
  installCodexHooks,
} from "./hooks.js";
import { syncSkillsCanonical } from "./skills-sync.js";
import { installCloudPluginEnablement } from "./cloud-enablement.js";
import {
  installClaudeRules,
  installCodexRules,
  installAntigravityRules,
  installCursorRules,
} from "./rules.js";
import { installCi } from "./ci.js";

interface InitOptions {
  skipPrompts?: boolean;
  agent?: AgentTarget;
  refreshGuides?: boolean;
}

export async function runInit(options: InitOptions): Promise<void> {
  const root = process.cwd();

  // Step 1: Detect project
  console.log(chalk.blue("Detecting project..."));
  const detected = detectProject(root);
  const agentTarget = parseAgentTarget(options.agent);

  const stack = detected.stack!;
  const existingDocs = detected.existingDocs!;
  const agentSelection = resolveAgentSelection(agentTarget, {
    hasCodex: detected.hasCodex || false,
    hasAntigravity: detected.hasAntigravity || false,
    hasCursor: detected.hasCursor || false,
  });

  if (stack.language !== "unknown") {
    console.log(
      `  Stack: ${chalk.cyan(stack.language)}` +
        (stack.framework ? ` + ${chalk.cyan(stack.framework)}` : "")
    );
    console.log(`  Package manager: ${chalk.cyan(stack.packageManager)}`);
  }

  if (existingDocs.hasClaudeMd) {
    console.log(`  ${chalk.yellow("CLAUDE.md already exists")} — will not overwrite`);
  }
  if (existingDocs.hasAgentsMd) {
    console.log(`  ${chalk.yellow("AGENTS.md already exists")} — will not overwrite`);
  }
  console.log(
    `  Guardrails: ${chalk.cyan(formatAgentSelection(agentSelection))}`
  );

  console.log("");

  // Step 2: Gather project info
  let projectName = detected.name;
  let projectDescription: string | undefined;

  if (!options.skipPrompts) {
    if (!projectName) {
      projectName = await input({
        message: "Project name:",
        default: root.split("/").pop(),
      });
    } else {
      console.log(`  Project: ${chalk.bold(projectName)}`);
    }

    projectDescription = await input({
      message: "One sentence — what does this project do?",
    });
  }

  const projectInfo: ProjectInfo = {
    name: projectName || root.split("/").pop() || "my-project",
    description: projectDescription || "",
    stack,
    hasGit: detected.hasGit || false,
    hasClaude: detected.hasClaude || false,
    hasCodex: detected.hasCodex || false,
    hasAntigravity: detected.hasAntigravity || false,
    hasCursor: detected.hasCursor || false,
    existingDocs,
  };

  // Step 3: Scaffold documentation infrastructure
  console.log("");
  console.log(chalk.blue("Creating documentation infrastructure..."));
  const scaffoldResults = await scaffoldDocs(root, projectInfo, {
    createClaudeMd: agentSelection.claude,
    createAgentsMd: true,
    refreshGuides: options.refreshGuides,
  });
  for (const result of scaffoldResults) {
    console.log(
      `  ${actionIcon(result.action)} ${result.path} ${chalk.dim(`(${result.action})`)}`
    );
  }
  printStaleNotice(scaffoldResults, "npx soloship init --refresh-guides");

  // scaffoldDocs above only WRITES AGENTS.md when it doesn't already exist
  // (never overwrites); an existing AGENTS.md on a re-run of `init` needs the
  // same mechanical-section ensure `upgrade` uses, or a project whose
  // AGENTS.md predates the Safety gates section never gets it.
  const safetyGatesResult = ensureSafetyGatesInAgentsMd(root, projectInfo);
  if (safetyGatesResult.action !== "unchanged") {
    console.log(
      `  ${chalk.green("+")} ${safetyGatesResult.path} (Safety gates section ${safetyGatesResult.action})`
    );
  }

  // Step 4: Install Hooks
  if (agentSelection.claude) {
    console.log("");
    console.log(chalk.blue("Configuring Claude Code hooks..."));
    const hookResults = await installHooks(root, projectInfo);
    for (const result of hookResults) {
      console.log(`  ${chalk.green("+")} ${result}`);
    }
    for (const result of installCloudPluginEnablement(root)) {
      console.log(`  ${chalk.green("+")} ${result}`);
    }
  }

  if (agentSelection.antigravity) {
    console.log("");
    console.log(chalk.blue("Configuring Antigravity hooks..."));
    const agHookResults = await installAntigravityHooks(root, projectInfo);
    for (const result of agHookResults) {
      console.log(`  ${chalk.green("+")} ${result}`);
    }
  }

  if (agentSelection.cursor) {
    console.log("");
    console.log(chalk.blue("Configuring Cursor hooks..."));
    const cursorHookResults = await installCursorHooks(root, projectInfo);
    for (const result of cursorHookResults) {
      console.log(`  ${chalk.green("+")} ${result}`);
    }
  }

  if (agentSelection.codex) {
    console.log("");
    console.log(chalk.blue("Configuring Codex hooks..."));
    const codexHookResults = await installCodexHooks(root, projectInfo);
    for (const result of codexHookResults) {
      console.log(`  ${chalk.green("+")} ${result}`);
    }
  }

  // Step 5: Install rules
  console.log("");
  console.log(chalk.blue("Installing workflow rules..."));
  if (agentSelection.claude) {
    const ruleResults = await installClaudeRules(root);
    for (const result of ruleResults) {
      console.log(`  ${chalk.green("+")} Claude: ${result}`);
    }
  }
  if (agentSelection.codex) {
    const ruleResults = await installCodexRules(root);
    for (const result of ruleResults) {
      console.log(`  ${chalk.green("+")} Codex: ${result}`);
    }
  }
  if (agentSelection.antigravity) {
    const ruleResults = await installAntigravityRules(root);
    for (const result of ruleResults) {
      console.log(`  ${chalk.green("+")} Antigravity: ${result}`);
    }
  }
  if (agentSelection.cursor) {
    const ruleResults = await installCursorRules(root);
    for (const result of ruleResults) {
      console.log(`  ${chalk.green("+")} Cursor: ${result}`);
    }
  }

  // Step 5.5: Canonicalize project skills (.agents/skills/ real, .claude/skills/ symlinked)
  const skillResults = syncSkillsCanonical(root);
  if (skillResults.length > 0) {
    console.log("");
    console.log(chalk.blue("Syncing project skills to the canonical layout..."));
    for (const result of skillResults) {
      console.log(`  ${chalk.green("+")} ${result}`);
    }
  }

  // Step 6: Install CI + architecture fitness functions
  console.log("");
  console.log(chalk.blue("Setting up CI..."));
  const ciResults = await installCi(root, projectInfo);
  for (const result of ciResults) {
    console.log(`  ${chalk.green("+")} ${result}`);
  }

  // Post-install notes
  const notes: string[] = [];
  try {
    execSync("command -v semgrep", { stdio: "ignore" });
  } catch {
    notes.push(
      `Semgrep not found. Security scanning hooks will skip until installed: ${chalk.cyan("pipx install semgrep")}`
    );
  }
  if (notes.length > 0) {
    console.log("");
    console.log(chalk.yellow("Notes:"));
    for (const note of notes) {
      console.log(`  ${chalk.dim("→")} ${note}`);
    }
  }

}
