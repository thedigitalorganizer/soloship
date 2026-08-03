import chalk from "chalk";
import {
  formatAgentSelection,
  parseAgentTarget,
  resolveAgentSelection,
  type AgentTarget,
} from "./agents.js";
import { detectProject, type ProjectInfo } from "./detect.js";
import { installHooks } from "./hooks.js";
import { installClaudeRules, installCodexRules } from "./rules.js";
import { writeVersionStamp } from "./scaffold.js";
import {
  actionIcon,
  printStaleNotice,
  syncSolutionGuide,
} from "./guide-freshness.js";
import { getVersion } from "./pkg.js";

/**
 * `soloship upgrade` — refresh the project's Soloship infrastructure to the
 * version of Soloship currently being executed via npx.
 *
 * Refreshes: hooks, rules, version stamp. CI scaffolding (ci.yml, fitness
 * test) is install-once and never touched by upgrade — projects customize it.
 * Preserves: CLAUDE.md, AGENTS.md, CHANGELOG.md, docs/, and any user content.
 *
 * The hooks installer already overwrites `.claude/settings.local.json`'s hooks
 * key wholesale, so users who hand-edited hooks will lose those changes — same
 * behavior as re-running `init`.
 */
interface UpgradeOptions {
  agent?: AgentTarget;
  refreshGuides?: boolean;
}

export async function runUpgrade(options: UpgradeOptions = {}): Promise<void> {
  const root = process.cwd();

  console.log(chalk.blue("Detecting project..."));
  const detected = detectProject(root);
  const agentTarget = parseAgentTarget(options.agent);
  const stack = detected.stack!;
  const existingDocs = detected.existingDocs!;
  const agentSelection = resolveAgentSelection(agentTarget, {
    hasCodex: detected.hasCodex || false,
  });

  const projectInfo: ProjectInfo = {
    name: detected.name || root.split("/").pop() || "my-project",
    description: "",
    stack,
    hasGit: detected.hasGit || false,
    hasClaude: detected.hasClaude || false,
    hasCodex: detected.hasCodex || false,
    existingDocs,
  };

  console.log(`  Guardrails: ${chalk.cyan(formatAgentSelection(agentSelection))}`);

  if (agentSelection.claude) {
    console.log("");
    console.log(chalk.blue("Refreshing Claude Code hooks..."));
    const hookResults = await installHooks(root, projectInfo);
    for (const result of hookResults) {
      console.log(`  ${chalk.green("+")} ${result}`);
    }
  } else {
    console.log("");
    console.log(chalk.dim("Skipping Claude Code hooks (--agent codex)."));
  }

  console.log("");
  console.log(chalk.blue("Refreshing workflow rules..."));
  if (agentSelection.claude) {
    const ruleResults = await installClaudeRules(root, { force: true });
    for (const result of ruleResults) {
      console.log(`  ${chalk.green("+")} Claude: ${result}`);
    }
  }
  if (agentSelection.codex) {
    const ruleResults = await installCodexRules(root, { force: true });
    for (const result of ruleResults) {
      console.log(`  ${chalk.green("+")} Codex: ${result}`);
    }
  }

  // CI files (.github/workflows/ci.yml, __arch__/fitness.test.ts) are
  // install-once scaffolding the project is expected to customize — upgrade
  // must never rewrite or resurrect them. A force-refresh here overwrote a
  // project's customized fitness test on 2026-07-06 (see
  // docs/solutions/integration-issues/upgrade-overwrote-customized-fitness-test-20260707.md).
  console.log("");
  console.log(
    chalk.dim("CI scaffolding left untouched (install-once; customize freely).")
  );

  console.log("");
  console.log(chalk.blue("Updating version stamp..."));
  const stampResults = writeVersionStamp(root);
  for (const result of stampResults) {
    const icon =
      result.action === "created"
        ? chalk.green("+")
        : result.action === "skipped"
          ? chalk.dim("-")
          : chalk.yellow("~");
    console.log(`  ${icon} ${result.path} ${chalk.dim(`(${result.action})`)}`);
  }

  // Generated reference docs — checked, not scaffolded. `upgrade` preserves
  // project docs by contract, so this reports staleness and only rewrites when
  // explicitly asked. Existing projects run `upgrade`, not `init`, so without
  // this the staleness check would never fire for the population that has stale
  // guides — the whole point of having it.
  console.log("");
  console.log(chalk.blue("Checking generated reference docs..."));
  const guideResults = syncSolutionGuide(root, {
    refresh: options.refreshGuides,
    createIfMissing: false,
  });
  if (guideResults.length === 0) {
    console.log(
      chalk.dim("  No generated reference docs found (run `npx soloship init` first).")
    );
  }
  for (const result of guideResults) {
    console.log(
      `  ${actionIcon(result.action)} ${result.path} ${chalk.dim(`(${result.action})`)}`
    );
  }
  printStaleNotice(guideResults, "npx soloship upgrade --refresh-guides");

  console.log("");
  console.log(
    chalk.green.bold(`Soloship upgraded to v${getVersion()}.`)
  );
  console.log(
    chalk.dim(
      "  Project docs (CLAUDE.md, AGENTS.md, CHANGELOG.md) were preserved."
    )
  );
  if (agentSelection.codex) {
    console.log(
      chalk.dim(
        "  Codex hooks were not ported; rules and AGENTS.md guidance are the Codex safety surface for this release."
      )
    );
  }
  console.log("");
}
