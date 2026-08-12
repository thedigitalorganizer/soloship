// Gauntlet — CLI surface.
//
// Six subcommands, one per lifecycle stage: init, calibrate, run, score,
// review, report. Conspicuously absent: anything that merges.

import { Command } from "commander";
import chalk from "chalk";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  BUILTIN_ADAPTERS,
  buildConfig,
  expandArms,
  readConfig,
  runDir,
  validateConfig,
  writeConfig,
  GAUNTLET_DIR,
} from "./config.js";
import { preflightRepo } from "./workspace.js";
import { readBrief, readResults, runGauntlet } from "./run.js";
import {
  calibrateCourse,
  pruneScoringCheckouts,
  readScores,
  scoreArm,
  writeScores,
} from "./score.js";
import { buildSubmissions } from "./anonymize.js";
import {
  PAIRWISE_FILENAME,
  RUBRIC_FILENAME,
  runPairwiseReview,
  runRubricReview,
  writeVerdicts,
} from "./review.js";
import {
  readCodenames,
  readJsonArray,
  renderScorecard,
  writeScorecard,
} from "./report.js";
import type {
  ArmScore,
  Condition,
  PairwiseVerdict,
  RubricVerdict,
} from "./types.js";

/** Starter brief written by `init`. Deliberately a template with prompts the
 *  author must replace — a vague course produces vague results, and the
 *  cheapest place to catch that is before anything runs. */
const BRIEF_TEMPLATE = `# Course brief

> Every arm receives this file verbatim. It carries FACTS, never METHOD.
> Describing how to approach the work here would leak the harness's job into
> the control condition and invalidate the comparison.

## What we need

<Describe the outcome in product terms. What should be true when this is done?>

## Why it matters

<One short paragraph. Agents perform measurably better knowing the intent.>

## How to work in this repo

- Install: \`<command>\`
- Run the test suite: \`<command>\`
- Run the app: \`<command>\`
- Relevant code lives in: \`<paths>\`

## Constraints

- <Public API stays unchanged / no new dependencies / etc.>

## Done when

- <Observable condition 1>
- <Observable condition 2>
`;

const ACCEPTANCE_README = `# Sealed acceptance tests

These never enter an arm's worktree. They are copied into a throwaway checkout
at scoring time only, so no arm can read, run, or optimize against them.

Write them so they FAIL on the baseline and PASS on \`../reference.patch\`.
\`soloship gauntlet calibrate\` refuses to let a run start until both hold.

Have the suite print \`GAUNTLET_ACCEPT <passed>/<total>\` for an exact ratio;
otherwise TAP assertions, vitest summaries, and exit codes are parsed
automatically.

Point \`acceptanceCommand\` at the test FILES, not the directory — some runners
treat a bare directory as a module path, and others report one pass per file
rather than per assertion, which flattens the score:

    node --test "gauntlet-acceptance/*.test.js"    # per-assertion, correct
    node --test gauntlet-acceptance/               # module resolution error
`;

function ok(message: string): void {
  console.log(`${chalk.green("✓")} ${message}`);
}

function warn(message: string): void {
  console.log(`${chalk.yellow("!")} ${message}`);
}

function fail(message: string): never {
  console.error(`${chalk.red("✗")} ${message}`);
  process.exit(1);
}

function loadConfigOrExit(repo: string, runId: string) {
  try {
    return readConfig(repo, runId);
  } catch (error) {
    return fail((error as Error).message);
  }
}

export function registerGauntletCommand(program: Command): void {
  const gauntlet = program
    .command("gauntlet")
    .description(
      "Run a blind model-vs-harness bake-off: many agents attempt one sealed task, independent judges score the results, and nothing is ever merged"
    );

  gauntlet
    .command("init")
    .description("Scaffold a new gauntlet run and pin its baseline commit")
    .requiredOption("--run <id>", "Run id, e.g. 2026-08-12-rate-limiter")
    .option("--repo <path>", "Repository under test", process.cwd())
    .option("--baseline <ref>", "Commit every arm starts from", "HEAD")
    .option("--plugin-root <path>", "Soloship plugin root for harnessed arms")
    .option("--reps <n>", "Repetitions per model+condition", "3")
    .option(
      "--conditions <list>",
      "Comma-separated conditions: harnessed,bare",
      "harnessed,bare"
    )
    .option("--judge-model <model>", "Model the independent reviewers run on")
    .action((options) => {
      const repo = resolve(options.repo);
      let baseline: string;
      try {
        const preflight = preflightRepo(repo, options.baseline);
        baseline = preflight.baseline;
        preflight.warnings.forEach(warn);
      } catch (error) {
        return fail((error as Error).message);
      }

      const conditions = String(options.conditions)
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean) as Condition[];

      const config = buildConfig({
        repoRoot: repo,
        runId: options.run,
        baseline,
        pluginRoot: options.pluginRoot ? resolve(options.pluginRoot) : undefined,
        conditions,
        reps: Number(options.reps),
        judgeModel: options.judgeModel,
      });

      const issues = validateConfig(config);
      if (issues.length > 0) {
        issues.forEach((issue) => console.error(`  ${issue.field}: ${issue.message}`));
        return fail("Configuration is invalid.");
      }

      const dir = runDir(repo, options.run);
      mkdirSync(join(dir, "course", "acceptance"), { recursive: true });
      const briefPath = join(dir, config.course.briefPath);
      if (!existsSync(briefPath)) writeFileSync(briefPath, BRIEF_TEMPLATE, "utf-8");
      const acceptanceReadme = join(dir, config.course.acceptancePath, "README.md");
      if (!existsSync(acceptanceReadme)) {
        writeFileSync(acceptanceReadme, ACCEPTANCE_README, "utf-8");
      }
      const configFile = writeConfig(config);

      ok(`Gauntlet "${options.run}" scaffolded`);
      console.log(`  config:     ${configFile}`);
      console.log(`  brief:      ${briefPath}`);
      console.log(`  acceptance: ${join(dir, config.course.acceptancePath)}`);
      console.log(`  baseline:   ${baseline.slice(0, 12)}`);
      console.log(`  arms:       ${expandArms(config).length}`);
      console.log("");
      console.log(chalk.dim(`Add "${GAUNTLET_DIR}/" to .gitignore, fill in the brief and`));
      console.log(chalk.dim("acceptance tests, then run: soloship gauntlet calibrate --run <id>"));
    });

  gauntlet
    .command("calibrate")
    .description(
      "Prove the course discriminates: acceptance must fail on the baseline and pass on the reference solution"
    )
    .requiredOption("--run <id>", "Run id")
    .option("--repo <path>", "Repository under test", process.cwd())
    .action((options) => {
      const config = loadConfigOrExit(resolve(options.repo), options.run);
      pruneScoringCheckouts(config);
      const result = calibrateCourse(config);

      console.log(
        `  baseline:  ${result.baselineOutcome.passed}/${result.baselineOutcome.total} acceptance tests pass`
      );
      console.log(
        `  reference: ${
          result.referenceOutcome
            ? `${result.referenceOutcome.passed}/${result.referenceOutcome.total} pass`
            : "not run"
        }`
      );
      result.leakage.forEach((leak) => warn(`leakage: ${leak}`));

      if (!result.discriminates || result.problems.length > 0) {
        result.problems.forEach((problem) => console.error(`  ${problem}`));
        return fail(
          "Course does not discriminate. Fix it before running arms — an uncalibrated course produces confident meaningless numbers."
        );
      }
      ok("Course calibrated: fails on baseline, passes on reference.");
    });

  gauntlet
    .command("run")
    .description("Execute every arm in its own worktree on its own branch")
    .requiredOption("--run <id>", "Run id")
    .option("--repo <path>", "Repository under test", process.cwd())
    .option("--only <ids>", "Comma-separated arm ids to run")
    .option("--force", "Re-run arms that already have results")
    .option("--skip-calibration", "Run without the calibration gate (not advised)")
    .action(async (options) => {
      const config = loadConfigOrExit(resolve(options.repo), options.run);

      if (!options.skipCalibration) {
        const calibration = calibrateCourse(config);
        if (!calibration.discriminates) {
          calibration.problems.forEach((problem) => console.error(`  ${problem}`));
          return fail(
            "Refusing to run: the course is not calibrated. Use --skip-calibration only if you know why the check is wrong."
          );
        }
        ok("Calibration gate passed.");
      }

      const results = await runGauntlet({
        config,
        only: options.only ? String(options.only).split(",") : undefined,
        force: Boolean(options.force),
        onEvent: (message) => console.log(chalk.dim(message)),
      });

      const completed = results.filter((r) => r.status === "completed").length;
      ok(`${completed}/${results.length} arms completed`);
      console.log(chalk.dim("Next: soloship gauntlet score --run " + options.run));
    });

  gauntlet
    .command("score")
    .description("Run the sealed acceptance tests against every arm's result")
    .requiredOption("--run <id>", "Run id")
    .option("--repo <path>", "Repository under test", process.cwd())
    .action((options) => {
      const config = loadConfigOrExit(resolve(options.repo), options.run);
      pruneScoringCheckouts(config);
      const results = readResults(config);
      if (results.length === 0) fail("No run results. Run the arms first.");

      const scores: ArmScore[] = [];
      for (const result of results) {
        if (!result.headSha) {
          console.log(chalk.dim(`  ${result.armId}: no output to score`));
          continue;
        }
        const score = scoreArm(config, result.armId, result.headSha);
        scores.push(score);
        console.log(
          chalk.dim(
            `  ${result.armId}: ${score.acceptancePassed}/${score.acceptanceTotal} acceptance, ` +
              `${score.scopeClean ? "scope clean" : `traps touched: ${score.trapsTouched.join(", ")}`}`
          )
        );
      }
      writeScores(config, scores);
      ok(`Scored ${scores.length} arm(s)`);
    });

  gauntlet
    .command("review")
    .description(
      "Anonymize every result and dispatch independent blind reviewers (rubric + order-balanced pairwise)"
    )
    .requiredOption("--run <id>", "Run id")
    .option("--repo <path>", "Repository under test", process.cwd())
    .option("--skip-pairwise", "Rubric scoring only")
    .action(async (options) => {
      const config = loadConfigOrExit(resolve(options.repo), options.run);
      const results = readResults(config);
      const heads = new Map(
        results
          .filter((result) => result.headSha)
          .map((result) => [result.armId, result.headSha!])
      );

      const bundle = buildSubmissions(config, expandArms(config), heads);
      bundle.empty.forEach((armId) =>
        console.log(chalk.dim(`  ${armId}: nothing reviewable, skipped`))
      );
      if (bundle.leaked.length > 0) {
        bundle.leaked.forEach((leak) =>
          console.error(`  ${leak.armId} still names: ${leak.patterns.join(", ")}`)
        );
        return fail(
          "Refusing to review: a submission survived scrubbing with its identity intact. Add the offending strings to review.extraScrubPatterns and retry."
        );
      }
      if (bundle.submissions.length === 0) fail("No submissions to review.");

      ok(`${bundle.submissions.length} anonymized submission(s) ready`);

      const task = readBrief(config);
      const rubric = await runRubricReview({
        config,
        task,
        submissions: bundle.submissions,
        onEvent: (message) => console.log(chalk.dim(message)),
      });
      const pairwise = options.skipPairwise
        ? []
        : await runPairwiseReview({
            config,
            task,
            submissions: bundle.submissions,
            onEvent: (message) => console.log(chalk.dim(message)),
          });

      writeVerdicts(config, rubric, pairwise);
      ok(`${rubric.length} rubric verdict(s), ${pairwise.length} pairwise comparison(s)`);
      console.log(chalk.dim("Next: soloship gauntlet report --run " + options.run));
    });

  gauntlet
    .command("report")
    .description("Render the scorecard (and never merge anything)")
    .requiredOption("--run <id>", "Run id")
    .option("--repo <path>", "Repository under test", process.cwd())
    .action((options) => {
      const config = loadConfigOrExit(resolve(options.repo), options.run);
      const markdown = renderScorecard({
        config,
        results: readResults(config),
        scores: readScores(config),
        rubric: readJsonArray<RubricVerdict>(config, RUBRIC_FILENAME),
        pairwise: readJsonArray<PairwiseVerdict>(config, PAIRWISE_FILENAME),
        codenames: readCodenames(config),
      });
      const path = writeScorecard(config, markdown);
      ok(`Scorecard written to ${path}`);
    });

  gauntlet
    .command("status")
    .description("Show where a run stands")
    .requiredOption("--run <id>", "Run id")
    .option("--repo <path>", "Repository under test", process.cwd())
    .action((options) => {
      const config = loadConfigOrExit(resolve(options.repo), options.run);
      const arms = expandArms(config);
      const results = new Map(readResults(config).map((r) => [r.armId, r]));
      const scores = new Map(readScores(config).map((s) => [s.armId, s]));

      console.log(chalk.bold(`Gauntlet ${config.runId}`));
      console.log(
        chalk.dim(
          `  baseline ${config.baseline.slice(0, 12)} · ${arms.length} arms · judge ${config.review.model}`
        )
      );
      for (const arm of arms) {
        const result = results.get(arm.id);
        const score = scores.get(arm.id);
        console.log(
          `  ${arm.id.padEnd(30)} ${(result?.status ?? "pending").padEnd(10)} ` +
            `${score ? `${score.acceptancePassed}/${score.acceptanceTotal}` : ""}`
        );
      }
    });

  gauntlet
    .command("adapters")
    .description("List the built-in agent adapters")
    .action(() => {
      for (const adapter of Object.values(BUILTIN_ADAPTERS)) {
        console.log(
          `  ${chalk.bold(adapter.id.padEnd(10))} ${adapter.command} · telemetry: ${adapter.telemetry}`
        );
      }
      console.log("");
      console.log(
        chalk.dim(
          'Add a vendor by copying the "generic" adapter in gauntlet.json and filling in command + baseArgs with {{prompt}} and {{model}}.'
        )
      );
    });
}
