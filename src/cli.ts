import { Command } from "commander";
import chalk from "chalk";
import { runInit } from "./init.js";
import { runRollback } from "./rollback.js";
import { runDoctor } from "./doctor.js";


const program = new Command();

program
  .name("soloship")
  .description("Ship solo, safely — guardrails for AI-assisted development")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize Soloship in the current project")
  .option("--skip-prompts", "Use defaults without asking questions")
  .action(async (options) => {
    console.log("");
    console.log(
      chalk.bold("Soloship") + " — Ship Solo, Safely"
    );
    console.log(
      chalk.dim(
        "Setting up mechanical enforcement, documentation infrastructure, and workflow rules."
      )
    );
    console.log("");

    try {
      await runInit(options);
      console.log("");
      console.log(chalk.green.bold("Soloship initialized."));
      console.log("");
      console.log("Next steps:");
      console.log(
        chalk.dim("  Existing project: ") + "Run /audit in Claude Code"
      );
      console.log(
        chalk.dim("  New project:      ") + "Run /bootstrap in Claude Code"
      );
      console.log("");
    } catch (err) {
      console.error(chalk.red("Setup failed:"), err);
      process.exit(1);
    }
  });

program
  .command("rollback")
  .description("Roll back to the last Soloship safety snapshot")
  .action(async () => {
    try {
      await runRollback();
    } catch (err) {
      console.error(chalk.red("Rollback failed:"), err);
      process.exit(1);
    }
  });

program
  .command("doctor")
  .description(
    "Audit your Claude Code environment for Soloship companion dependencies"
  )
  .action(async () => {
    console.log("");
    console.log(chalk.bold("Soloship Doctor"));
    console.log(
      chalk.dim(
        "Checking plugins, MCP servers, global skills, and hooks against the Soloship manifest."
      )
    );
    console.log("");

    try {
      await runDoctor();
    } catch (err) {
      console.error(chalk.red("Doctor failed:"), err);
      process.exit(1);
    }
  });

program.parse();
