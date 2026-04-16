import { input, confirm } from "@inquirer/prompts";
import chalk from "chalk";
import { detectProject, type ProjectInfo } from "./detect.js";
import { scaffoldDocs } from "./scaffold.js";
import { installHooks } from "./hooks.js";
import { installRules } from "./rules.js";
import { installCi } from "./ci.js";

interface InitOptions {
  skipPrompts?: boolean;
}

export async function runInit(options: InitOptions): Promise<void> {
  const root = process.cwd();

  // Step 1: Detect project
  console.log(chalk.blue("Detecting project..."));
  const detected = detectProject(root);

  const stack = detected.stack!;
  const existingDocs = detected.existingDocs!;

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
    existingDocs,
  };

  // Step 3: Scaffold documentation infrastructure
  console.log("");
  console.log(chalk.blue("Creating documentation infrastructure..."));
  const scaffoldResults = await scaffoldDocs(root, projectInfo);
  for (const result of scaffoldResults) {
    const icon = result.action === "created" ? chalk.green("+") : chalk.yellow("~");
    console.log(`  ${icon} ${result.path} ${chalk.dim(`(${result.action})`)}`);
  }

  // Step 4: Install Claude Code hooks
  console.log("");
  console.log(chalk.blue("Configuring Claude Code hooks..."));
  const hookResults = await installHooks(root, projectInfo);
  for (const result of hookResults) {
    console.log(`  ${chalk.green("+")} ${result}`);
  }

  // Step 5: Install rules
  console.log("");
  console.log(chalk.blue("Installing workflow rules..."));
  const ruleResults = await installRules(root);
  for (const result of ruleResults) {
    console.log(`  ${chalk.green("+")} ${result}`);
  }

  // Step 6: Install CI + architecture fitness functions
  console.log("");
  console.log(chalk.blue("Setting up CI..."));
  const ciResults = await installCi(root, projectInfo);
  for (const result of ciResults) {
    console.log(`  ${chalk.green("+")} ${result}`);
  }
}
