import chalk from "chalk";
import { detectProject, type ProjectInfo } from "./detect.js";
import { installHooks } from "./hooks.js";
import { installRules } from "./rules.js";
import { installCi } from "./ci.js";
import { writeVersionStamp } from "./scaffold.js";
import { getVersion } from "./pkg.js";

/**
 * `soloship upgrade` — refresh the project's Soloship infrastructure to the
 * version of Soloship currently being executed via npx.
 *
 * Refreshes: hooks, rules, CI workflow, version stamp.
 * Preserves: CLAUDE.md, AGENTS.md, CHANGELOG.md, docs/, and any user content.
 *
 * The hooks installer already overwrites `.claude/settings.local.json`'s hooks
 * key wholesale, so users who hand-edited hooks will lose those changes — same
 * behavior as re-running `init`.
 */
export async function runUpgrade(): Promise<void> {
  const root = process.cwd();

  console.log(chalk.blue("Detecting project..."));
  const detected = detectProject(root);
  const stack = detected.stack!;
  const existingDocs = detected.existingDocs!;

  const projectInfo: ProjectInfo = {
    name: detected.name || root.split("/").pop() || "my-project",
    description: "",
    stack,
    hasGit: detected.hasGit || false,
    hasClaude: detected.hasClaude || false,
    existingDocs,
  };

  console.log("");
  console.log(chalk.blue("Refreshing Claude Code hooks..."));
  const hookResults = await installHooks(root, projectInfo);
  for (const result of hookResults) {
    console.log(`  ${chalk.green("+")} ${result}`);
  }

  console.log("");
  console.log(chalk.blue("Refreshing workflow rules..."));
  const ruleResults = await installRules(root, { force: true });
  for (const result of ruleResults) {
    console.log(`  ${chalk.green("+")} ${result}`);
  }

  console.log("");
  console.log(chalk.blue("Refreshing CI..."));
  const ciResults = await installCi(root, projectInfo);
  for (const result of ciResults) {
    console.log(`  ${chalk.green("+")} ${result}`);
  }

  console.log("");
  console.log(chalk.blue("Updating version stamp..."));
  const stampResults = writeVersionStamp(root);
  for (const result of stampResults) {
    const icon =
      result.action === "created" ? chalk.green("+") : chalk.yellow("~");
    console.log(`  ${icon} ${result.path} ${chalk.dim(`(${result.action})`)}`);
  }

  console.log("");
  console.log(
    chalk.green.bold(`Soloship upgraded to v${getVersion()}.`)
  );
  console.log(
    chalk.dim(
      "  Project docs (CLAUDE.md, AGENTS.md, CHANGELOG.md) were preserved."
    )
  );
  console.log("");
}
