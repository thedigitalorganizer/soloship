import { Command } from "commander";
import chalk from "chalk";
import { runInit } from "./init.js";
import { runRollback } from "./rollback.js";
import { runDoctor } from "./doctor.js";
import { runUpgrade } from "./upgrade.js";
import { getVersion } from "./pkg.js";


const program = new Command();

program
  .name("soloship")
  .description("Ship solo, safely — guardrails for AI-assisted development")
  .version(getVersion());

program
  .command("init")
  .description("Initialize Soloship in the current project")
  .option("--skip-prompts", "Use defaults without asking questions")
  .option(
    "--agent <agent>",
    "Project guardrail target: claude, codex, antigravity, cursor, both, or all"
  )
  .option(
    "--refresh-guides",
    "Rewrite generated reference docs built against an older schema (keeps a .bak of each)"
  )
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
        chalk.dim("  Existing project: ") +
          "Run /soloship:audit in Claude Code or invoke the Soloship audit skill in Codex"
      );
      console.log(
        chalk.dim("  New project:      ") +
          "Run /soloship:bootstrap in Claude Code or invoke the Soloship bootstrap skill in Codex"
      );
      console.log("");
    } catch (err) {
      console.error(chalk.red("Setup failed:"), err);
      process.exit(1);
    }
  });

program
  .command("upgrade")
  .description(
    "Refresh hooks and rules to the version of Soloship being run via npx (CI scaffolding is install-once, never touched)"
  )
  .option(
    "--agent <agent>",
    "Project guardrail target: claude, codex, antigravity, cursor, both, or all"
  )
  .option(
    "--refresh-guides",
    "Rewrite generated reference docs built against an older schema (keeps a .bak of each)"
  )
  .action(async (options) => {
    console.log("");
    console.log(chalk.bold("Soloship Upgrade"));
    console.log(
      chalk.dim(
        "Refreshing project hooks and rules. Project docs and CI scaffolding are preserved."
      )
    );
    console.log("");

    try {
      await runUpgrade(options);
    } catch (err) {
      console.error(chalk.red("Upgrade failed:"), err);
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
    "Audit your Claude Code, Codex, Antigravity, and Cursor environment for Soloship readiness"
  )
  .action(async () => {
    console.log("");
    console.log(chalk.bold("Soloship Doctor"));
    console.log(
      chalk.dim(
        "Checking Claude Code, Codex, Antigravity, Cursor, and shared project guardrail status."
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
