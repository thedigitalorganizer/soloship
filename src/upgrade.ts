import chalk from "chalk";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatAgentSelection,
  parseAgentTarget,
  resolveAgentSelection,
  type AgentTarget,
} from "./agents.js";
import { detectProject, type ProjectInfo } from "./detect.js";
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
  // Suppresses the step-by-step console output below (headers, per-file
  // "+"/"~" lines). Added for the SessionStart plugin hook
  // (hooks/session-start-upgrade.cjs), which runs this unattended at every
  // session start when a version bump is pending — full verbose output has
  // no reader there and just adds noise to Claude Code's hook debug log.
  quiet?: boolean;
}

// Phase 3 of docs/plans/2026-08-27-one-source-of-truth-across-agent-hosts.md:
// migrating an existing fat CLAUDE.md into `@AGENTS.md` + a Claude-only
// appendix is judgment work (deciding what prose is genuinely Claude-specific
// vs. belongs in AGENTS.md) — that lives in /soloship:bootstrap, not here.
// `upgrade` only detects the old shape and nudges toward bootstrap; it never
// rewrites CLAUDE.md itself, matching upgrade's standing promise to preserve
// project docs. Threshold: a real `@AGENTS.md`-shaped CLAUDE.md (import +
// short appendix) is well under 1 KB — see the size assertion in
// __arch__/agents-md-instruction-file.test.ts.
const OLD_CLAUDE_MD_SIZE_THRESHOLD_BYTES = 1000;

export function hasOldShapeClaudeMd(root: string): boolean {
  const path = join(root, "CLAUDE.md");
  if (!existsSync(path)) return false;
  let content: string;
  try {
    content = readFileSync(path, "utf-8");
  } catch {
    return false;
  }
  return (
    content.length > OLD_CLAUDE_MD_SIZE_THRESHOLD_BYTES &&
    !content.trimStart().startsWith("@AGENTS.md")
  );
}

export async function runUpgrade(options: UpgradeOptions = {}): Promise<void> {
  const root = process.cwd();
  const log = options.quiet ? (..._args: unknown[]) => {} : console.log;

  log(chalk.blue("Detecting project..."));
  const detected = detectProject(root);
  const agentTarget = parseAgentTarget(options.agent);
  const stack = detected.stack!;
  const existingDocs = detected.existingDocs!;
  const agentSelection = resolveAgentSelection(agentTarget, {
    hasCodex: detected.hasCodex || false,
    hasAntigravity: detected.hasAntigravity || false,
    hasCursor: detected.hasCursor || false,
  });

  const projectInfo: ProjectInfo = {
    name: detected.name || root.split("/").pop() || "my-project",
    description: "",
    stack,
    hasGit: detected.hasGit || false,
    hasClaude: detected.hasClaude || false,
    hasCodex: detected.hasCodex || false,
    hasAntigravity: detected.hasAntigravity || false,
    hasCursor: detected.hasCursor || false,
    existingDocs,
  };

  log(`  Guardrails: ${chalk.cyan(formatAgentSelection(agentSelection))}`);

  if (agentSelection.claude) {
    log("");
    log(chalk.blue("Refreshing Claude Code hooks..."));
    const hookResults = await installHooks(root, projectInfo);
    for (const result of hookResults) {
      log(`  ${chalk.green("+")} ${result}`);
    }
    for (const result of installCloudPluginEnablement(root)) {
      log(`  ${chalk.green("+")} ${result}`);
    }
  }

  if (agentSelection.antigravity) {
    log("");
    log(chalk.blue("Refreshing Antigravity hooks..."));
    const agHookResults = await installAntigravityHooks(root, projectInfo);
    for (const result of agHookResults) {
      log(`  ${chalk.green("+")} ${result}`);
    }
  }

  if (agentSelection.cursor) {
    log("");
    log(chalk.blue("Refreshing Cursor hooks..."));
    const cursorHookResults = await installCursorHooks(root, projectInfo);
    for (const result of cursorHookResults) {
      log(`  ${chalk.green("+")} ${result}`);
    }
  }

  if (agentSelection.codex) {
    log("");
    log(chalk.blue("Refreshing Codex hooks..."));
    const codexHookResults = await installCodexHooks(root, projectInfo);
    for (const result of codexHookResults) {
      log(`  ${chalk.green("+")} ${result}`);
    }
  }

  log("");
  log(chalk.blue("Refreshing workflow rules..."));
  if (agentSelection.claude) {
    const ruleResults = await installClaudeRules(root, { force: true });
    for (const result of ruleResults) {
      log(`  ${chalk.green("+")} Claude: ${result}`);
    }
  }
  if (agentSelection.codex) {
    const ruleResults = await installCodexRules(root, { force: true });
    for (const result of ruleResults) {
      log(`  ${chalk.green("+")} Codex: ${result}`);
    }
  }
  if (agentSelection.antigravity) {
    const ruleResults = await installAntigravityRules(root, { force: true });
    for (const result of ruleResults) {
      log(`  ${chalk.green("+")} Antigravity: ${result}`);
    }
  }
  if (agentSelection.cursor) {
    const ruleResults = await installCursorRules(root, { force: true });
    for (const result of ruleResults) {
      log(`  ${chalk.green("+")} Cursor: ${result}`);
    }
  }

  const skillResults = syncSkillsCanonical(root);
  if (skillResults.length > 0) {
    log("");
    log(chalk.blue("Syncing project skills to the canonical layout..."));
    for (const result of skillResults) {
      log(`  ${chalk.green("+")} ${result}`);
    }
  }

  // CI files (.github/workflows/ci.yml, __arch__/fitness.test.ts) are
  // install-once scaffolding the project is expected to customize — upgrade
  // must never rewrite or resurrect them. A force-refresh here overwrote a
  // project's customized fitness test on 2026-07-06 (see
  // docs/solutions/integration-issues/upgrade-overwrote-customized-fitness-test-20260707.md).
  log("");
  log(
    chalk.dim("CI scaffolding left untouched (install-once; customize freely).")
  );

  log("");
  log(chalk.blue("Updating version stamp..."));
  const stampResults = writeVersionStamp(root);
  for (const result of stampResults) {
    const icon =
      result.action === "created"
        ? chalk.green("+")
        : result.action === "skipped"
          ? chalk.dim("-")
          : chalk.yellow("~");
    log(`  ${icon} ${result.path} ${chalk.dim(`(${result.action})`)}`);
  }

  // Generated reference docs — checked, not scaffolded. `upgrade` preserves
  // project docs by contract, so this reports staleness and only rewrites when
  // explicitly asked. Existing projects run `upgrade`, not `init`, so without
  // this the staleness check would never fire for the population that has stale
  // guides — the whole point of having it.
  log("");
  log(chalk.blue("Checking generated reference docs..."));
  const guideResults = syncSolutionGuide(root, {
    refresh: options.refreshGuides,
    createIfMissing: false,
  });
  if (guideResults.length === 0) {
    log(
      chalk.dim("  No generated reference docs found (run `npx soloship init` first).")
    );
  }
  for (const result of guideResults) {
    log(
      `  ${actionIcon(result.action)} ${result.path} ${chalk.dim(`(${result.action})`)}`
    );
  }
  printStaleNotice(guideResults, "npx soloship upgrade --refresh-guides");

  log("");
  log(
    chalk.green.bold(`Soloship upgraded to v${getVersion()}.`)
  );
  log(
    chalk.dim(
      "  Project docs (CLAUDE.md, AGENTS.md, CHANGELOG.md) were preserved."
    )
  );
  if (hasOldShapeClaudeMd(root)) {
    log("");
    log(
      chalk.yellow(
        "  CLAUDE.md looks like the old fat-file shape (not an @AGENTS.md import)."
      )
    );
    log(
      chalk.dim(
        "  Deciding what to move into AGENTS.md vs. keep Claude-specific is judgment work — run /soloship:bootstrap to migrate it."
      )
    );
  }
  log("");
}
