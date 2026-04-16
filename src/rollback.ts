import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import chalk from "chalk";

/**
 * Rollback to the last Soloship safety snapshot.
 *
 * Checkpoints are created automatically at session start by the checkpoint hook.
 * The checkpoint reference (a commit SHA) is stored in .ai/.last-checkpoint.
 *
 * Rollback strategy:
 * 1. If .ai/.last-checkpoint exists, reset to that commit
 * 2. All changes after the checkpoint become uncommitted (soft reset)
 * 3. User can then discard or keep specific changes
 */
export async function runRollback(): Promise<void> {
  const root = process.cwd();

  // Verify git repo
  try {
    execSync("git rev-parse --is-inside-work-tree", {
      cwd: root,
      stdio: "pipe",
    });
  } catch {
    console.error(chalk.red("Not a git repository. Rollback requires git."));
    process.exit(1);
  }

  const checkpointFile = join(root, ".ai", ".last-checkpoint");

  if (!existsSync(checkpointFile)) {
    console.error(
      chalk.red("No checkpoint found.") +
        " Checkpoints are created automatically when a Claude Code session starts."
    );
    console.error(
      chalk.dim(
        "If this is a fresh project, run a Claude Code session first to create a checkpoint."
      )
    );
    process.exit(1);
  }

  const checkpointSha = readFileSync(checkpointFile, "utf-8").trim();

  if (!checkpointSha) {
    console.error(chalk.red("Checkpoint file is empty."));
    process.exit(1);
  }

  // Verify the checkpoint commit exists
  try {
    execSync(`git cat-file -e ${checkpointSha}`, {
      cwd: root,
      stdio: "pipe",
    });
  } catch {
    console.error(
      chalk.red(`Checkpoint commit ${checkpointSha} not found.`) +
        " It may have been garbage-collected or the history was rewritten."
    );
    process.exit(1);
  }

  // Check for pre-session stash snapshot
  const stashFile = join(root, ".ai", ".last-checkpoint-stash");
  const stashSha = existsSync(stashFile)
    ? readFileSync(stashFile, "utf-8").trim()
    : null;

  // Show what will be rolled back
  const shortSha = checkpointSha.substring(0, 7);
  const currentSha = execSync("git rev-parse --short HEAD", {
    cwd: root,
    encoding: "utf-8",
  }).trim();

  console.log("");
  console.log(chalk.bold("Soloship Rollback"));
  console.log("");
  console.log(`  Restore point:  ${chalk.cyan(shortSha)} (saved when AI session started)`);
  console.log(`  You are now at: ${chalk.cyan(currentSha)}`);
  if (stashSha) {
    console.log(`  Your pre-session work: ${chalk.cyan("preserved")}`);
  }
  console.log("");

  // Count commits between checkpoint and HEAD
  try {
    const commitCount = execSync(
      `git rev-list --count ${checkpointSha}..HEAD`,
      { cwd: root, encoding: "utf-8" }
    ).trim();

    if (commitCount === "0") {
      // Check for uncommitted changes
      const hasChanges =
        execSync("git status --porcelain", {
          cwd: root,
          encoding: "utf-8",
        }).trim().length > 0;

      if (!hasChanges) {
        console.log(
          chalk.green("Already at checkpoint.") + " Nothing to roll back."
        );
        return;
      }

      console.log(
        `  Removing changes made during this session...`
      );
      // Discard all current changes
      execSync("git checkout -- .", { cwd: root, stdio: "pipe" });
      execSync("git clean -fd", { cwd: root, stdio: "pipe" });

      // Restore pre-session changes if they were captured
      if (stashSha) {
        restorePreSessionChanges(root, stashSha);
      }
    } else {
      console.log(
        `  Undoing ${chalk.yellow(commitCount)} commit(s) from this session...`
      );
      // Hard reset to checkpoint — discards agent's commits and working tree changes
      execSync(`git reset --hard ${checkpointSha}`, {
        cwd: root,
        stdio: "pipe",
      });

      // Restore pre-session changes if they were captured
      if (stashSha) {
        restorePreSessionChanges(root, stashSha);
      }
    }
  } catch (err) {
    console.error(chalk.red("Rollback failed:"), err);
    process.exit(1);
  }

  console.log("");
  console.log(chalk.green.bold("Rolled back to checkpoint."));
  if (stashSha) {
    console.log(
      chalk.dim("Your pre-session changes have been restored.")
    );
  }
  console.log("");
}

function restorePreSessionChanges(root: string, stashSha: string): void {
  try {
    // Verify the stash object still exists (git gc could have collected it)
    execSync(`git cat-file -e ${stashSha}`, { cwd: root, stdio: "pipe" });
    execSync(`git stash apply ${stashSha}`, { cwd: root, stdio: "pipe" });
  } catch {
    console.log(
      chalk.yellow(
        "Could not restore pre-session changes (snapshot may have been cleaned up)." +
        " Working tree is clean at the checkpoint commit."
      )
    );
  }
}
