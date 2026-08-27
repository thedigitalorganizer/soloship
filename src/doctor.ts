/**
 * `soloship doctor` — filesystem/CLI report of Soloship install surfaces.
 */

import chalk from "chalk";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { getWorkflowRules, RETIRED_WORKFLOW_RULES } from "./rules.js";

type Severity = "required" | "recommended";

interface CheckResult {
  name: string;
  present: boolean;
  severity: Severity;
  purpose: string;
  install: string;
  notes?: string;
}

interface ReportSection {
  title: string;
  results: CheckResult[];
}

export async function runDoctor(): Promise<void> {
  const root = process.cwd();
  const home = homedir();
  const projectHasClaude = existsSync(join(root, ".claude"));
  const projectHasCodex = existsSync(join(root, ".codex"));
  const projectHasAntigravity =
    existsSync(join(root, ".agents")) || existsSync(join(root, "GEMINI.md"));
  const projectHasCursor = existsSync(join(root, ".cursor"));

  console.log(chalk.dim("Checking Soloship surfaces..."));
  console.log("");

  const sections: ReportSection[] = [
    {
      title: "Claude Code",
      results: [
        checkCommand("claude", {
          severity: "recommended",
          purpose: "Claude Code CLI available for the Claude plugin surface.",
          install: "Install Claude Code from https://claude.com/claude-code",
        }),
        checkClaudePlugin(home),
        checkProjectFile(join(root, ".claude", "settings.local.json"), {
          name: ".claude/settings.local.json",
          severity: projectHasClaude ? "required" : "recommended",
          purpose: "Project-level Claude hooks installed by npx soloship init.",
          install: "npx soloship init --agent claude",
        }),
        checkRuleSet(join(root, ".claude", "rules"), {
          name: ".claude/rules",
          severity: projectHasClaude ? "required" : "recommended",
          purpose: "Claude-facing auto-loaded Soloship workflow rules.",
          install: "npx soloship upgrade --agent claude",
        }),
      ],
    },
    {
      title: "Codex",
      results: [
        checkCommand("codex", {
          severity: "recommended",
          purpose: "Codex CLI available for the Codex plugin surface.",
          install: "Install Codex, then run: codex login",
        }),
        checkCodexPlugin(),
        checkCodexMarketplace(root, home),
        checkProjectFile(join(root, "AGENTS.md"), {
          name: "AGENTS.md",
          severity: projectHasCodex ? "required" : "recommended",
          purpose: "Codex-facing project guidance.",
          install: "npx soloship init --agent codex",
        }),
        checkRuleSet(join(root, ".codex", "rules"), {
          name: ".codex/rules",
          severity: projectHasCodex ? "required" : "recommended",
          purpose: "Codex-facing Soloship workflow rules, including Browser QA Gate.",
          install: "npx soloship upgrade --agent codex",
        }),
        {
          name: ".codex/hooks.json",
          present: existsSync(join(root, ".codex", "hooks.json")) && codexHooksFeatureFlagSet(root),
          severity: projectHasCodex ? "required" : "recommended",
          purpose: "Codex hook adapters (shared .soloship/hooks/*.cjs) + config.toml [features] hooks = true (off without it).",
          install: "npx soloship upgrade --agent codex",
        },
      ],
    },
    {
      title: "Antigravity",
      results: [
        checkAntigravityPlugin(home),
        checkProjectFile(join(root, ".agents", "hooks.json"), {
          name: ".agents/hooks.json",
          severity: projectHasAntigravity ? "required" : "recommended",
          purpose: "Project-level Antigravity hooks installed by npx soloship init.",
          install: "npx soloship init --agent antigravity",
        }),
        checkRuleSet(join(root, ".agents", "rules"), {
          name: ".agents/rules",
          severity: projectHasAntigravity ? "required" : "recommended",
          purpose: "Antigravity-facing auto-loaded Soloship workflow rules.",
          install: "npx soloship upgrade --agent antigravity",
        }),
      ],
    },
    {
      title: "Cursor",
      results: [
        checkCommand("cursor", {
          severity: "recommended",
          purpose: "Cursor CLI available for the Cursor surface.",
          install: "Install Cursor from https://cursor.com, then enable the CLI",
        }),
        checkProjectFile(join(root, ".cursor", "hooks.json"), {
          name: ".cursor/hooks.json",
          severity: projectHasCursor ? "required" : "recommended",
          purpose:
            "Cursor-native project hooks. COMMIT THIS — Cursor cloud agents load committed .cursor/hooks.json only, never ~/.cursor/hooks.json and never Claude Code hooks.",
          install: "npx soloship upgrade --agent cursor",
        }),
        checkRuleSet(join(root, ".cursor", "rules"), {
          name: ".cursor/rules",
          ext: ".mdc",
          severity: projectHasCursor ? "required" : "recommended",
          purpose:
            "Cursor-facing always-on Soloship workflow rules (.mdc — plain .md here is silently ignored by Cursor).",
          install: "npx soloship upgrade --agent cursor",
        }),
      ],
    },
    {
      title: "Shared Package",
      results: [
        checkProjectFile(join(root, ".soloship", "version"), {
          name: ".soloship/version",
          severity: "recommended",
          purpose: "Pinned Soloship npm guardrail version for this project.",
          install: "npx soloship init",
        }),
        checkProjectFile(join(root, "docs", "plans"), {
          name: "docs/plans/",
          severity: "recommended",
          purpose: "Plan artifact directory used by Soloship workflows.",
          install: "npx soloship init",
        }),
        checkProjectFile(join(root, "docs", "solutions"), {
          name: "docs/solutions/",
          severity: "recommended",
          purpose: "Solution memory searched before planning/debugging.",
          install: "npx soloship init",
        }),
        checkCoordinationDir(root),
        checkAutomationRegistry(root),
      ],
    },
  ];

  for (const section of sections) {
    printSection(section);
  }

  const exitCode = printSummary(sections);
  process.exit(exitCode);
}

function checkCommand(
  command: string,
  metadata: Omit<CheckResult, "name" | "present">
): CheckResult {
  return {
    name: `${command} CLI`,
    present: commandExists(command),
    ...metadata,
  };
}

function codexHooksFeatureFlagSet(root: string): boolean {
  const toml = readFileSafe(join(root, ".codex", "config.toml"));
  return !!toml && /^\[features\]\s*$[\s\S]*?^hooks\s*=\s*true\s*$/m.test(toml);
}

function checkClaudePlugin(home: string): CheckResult {
  const settings = readJsonSafe(join(home, ".claude", "settings.json"));
  const enabled = (settings?.enabledPlugins as Record<string, boolean> | undefined) || {};
  const present = Object.keys(enabled).some((key) => key.startsWith("soloship@"));

  return {
    name: "soloship Claude plugin",
    present,
    severity: "recommended",
    purpose: "Claude slash-command surface for /soloship:* workflows.",
    install:
      "/plugin marketplace add thedigitalorganizer/soloship, then /plugin install soloship@soloship",
  };
}

function checkAntigravityPlugin(home: string): CheckResult {
  const pluginDir = join(home, ".gemini", "config", "plugins", "soloship");
  const manifest = join(pluginDir, "plugin.json");
  const present = existsSync(manifest);

  return {
    name: "soloship Antigravity plugin",
    present,
    severity: "recommended",
    purpose: "Antigravity plugin surface for Soloship workflows and safety hooks.",
    install: "npm run antigravity:install-local",
  };
}

function checkCodexPlugin(): CheckResult {
  const result = readCodexPluginList();
  const installed = Array.isArray(result?.installed) ? result.installed : [];
  const present = installed.some((plugin) => plugin?.name === "soloship");

  return {
    name: "soloship Codex plugin",
    present,
    severity: "recommended",
    purpose: "Codex skill surface for Soloship workflows.",
    install:
      "codex plugin marketplace add thedigitalorganizer/soloship, then codex plugin add soloship@soloship",
    notes: result === null ? "codex plugin list --json was unavailable" : undefined,
  };
}

function checkCodexMarketplace(root: string, home: string): CheckResult {
  const repoMarketplace = join(root, ".agents", "plugins", "marketplace.json");
  const personalMarketplace = join(home, ".agents", "plugins", "marketplace.json");
  const marketplaceText = runCommandText("codex", ["plugin", "marketplace", "list"]);
  const marketplaceFileHasSoloship =
    marketplaceHasPlugin(repoMarketplace, "soloship") ||
    marketplaceHasPlugin(personalMarketplace, "soloship");
  const present =
    marketplaceFileHasSoloship ||
    Boolean(marketplaceText && /^soloship\s/m.test(marketplaceText));

  return {
    name: "soloship Codex marketplace",
    present,
    severity: "recommended",
    purpose: "Marketplace source that lets Codex install or update Soloship.",
    install: "codex plugin marketplace add thedigitalorganizer/soloship",
  };
}

function checkCoordinationDir(root: string): CheckResult {
  // Cross-session live state (session presence, plan claims, deploy lock)
  // lives in the git common dir — the one directory every worktree of a repo
  // shares. Created by the SessionStart presence hook on first session.
  const commonDirRaw = runCommandText("git", ["rev-parse", "--git-common-dir"]);
  const commonDir = commonDirRaw?.trim();
  const coordDir = commonDir
    ? join(isAbsolute(commonDir) ? commonDir : join(root, commonDir), "soloship")
    : null;
  const present = coordDir ? existsSync(coordDir) : false;

  let notes: string | undefined;
  if (!commonDir) {
    notes = "not a git repository";
  } else if (present && coordDir) {
    const sessionsDir = join(coordDir, "sessions");
    const sessionCount = existsSync(sessionsDir)
      ? readdirSync(sessionsDir).filter((f) => f.endsWith(".json")).length
      : 0;
    const lockHeld = existsSync(join(coordDir, "deploy.lock"));
    notes = `${sessionCount} session file(s); deploy lock ${lockHeld ? "HELD" : "not held"}`;
  }

  return {
    name: "session coordination dir",
    present,
    severity: "recommended",
    purpose:
      "Cross-session live state (session presence, plan claims, deploy lock) in the git common dir.",
    install:
      "Created automatically by the SessionStart presence hook (npx soloship init installs the hook, then start a Claude session).",
    notes,
  };
}

/** Warn when the project visibly defines scheduled automations (cron
 *  triggers) but has no automation registry — those jobs fail silently by
 *  construction until they're registered and watched (/soloship:cron). */
function checkAutomationRegistry(root: string): CheckResult {
  const registryPath = join(root, "docs", "automations", "registry.json");
  const hasRegistry = existsSync(registryPath);

  const cronSignals: string[] = [];
  for (const file of ["wrangler.jsonc", "wrangler.toml", "vercel.json"]) {
    const p = join(root, file);
    if (existsSync(p) && /"?crons"?\s*[:=]/.test(readFileSync(p, "utf-8"))) {
      cronSignals.push(file);
    }
  }
  const workflowsDir = join(root, ".github", "workflows");
  if (existsSync(workflowsDir)) {
    for (const f of readdirSync(workflowsDir)) {
      if (!f.endsWith(".yml") && !f.endsWith(".yaml")) continue;
      if (/^\s*schedule:/m.test(readFileSync(join(workflowsDir, f), "utf-8"))) {
        cronSignals.push(`.github/workflows/${f}`);
        break;
      }
    }
  }

  if (hasRegistry || cronSignals.length === 0) {
    return {
      name: "docs/automations/registry.json",
      present: true,
      severity: "recommended",
      purpose: "Automation registry — every cron/webhook/scheduled job + watchdog thresholds.",
      install: "npx soloship init",
      notes: hasRegistry
        ? undefined
        : "no cron triggers detected — registry optional until the first automation",
    };
  }
  return {
    name: "docs/automations/registry.json",
    present: false,
    severity: "recommended",
    purpose: `Cron triggers found (${cronSignals.join(", ")}) but no automation registry — these jobs fail silently by construction. Run /soloship:cron to register them.`,
    install: "npx soloship init",
  };
}

function checkProjectFile(
  path: string,
  metadata: Omit<CheckResult, "present">
): CheckResult {
  return {
    present: existsSync(path),
    ...metadata,
  };
}

function checkRuleSet(
  path: string,
  metadata: Omit<CheckResult, "present"> & { ext?: string }
): CheckResult {
  // Cursor reads `.mdc` and silently ignores `.md` in its rules directory.
  const { ext = ".md", ...rest } = metadata;
  const toName = (f: string) => f.replace(/\.md$/, ext);
  const missing = Object.keys(getWorkflowRules()).filter(
    (f) => !existsSync(join(path, toName(f)))
  );
  const leftovers = RETIRED_WORKFLOW_RULES.filter((f) =>
    existsSync(join(path, toName(f)))
  );
  const ruleCount = existsSync(path)
    ? readdirSync(path).filter((e) => e.endsWith(ext)).length
    : 0;
  const extra =
    (missing.length ? `; missing ${missing.join(", ")}` : "") +
    (leftovers.length ? `; ${leftovers.length} retired leftovers — run npx soloship upgrade` : "");
  return {
    present: missing.length === 0 && leftovers.length === 0,
    notes: existsSync(path)
      ? `${ruleCount} rule files found${extra}`
      : "rules directory missing",
    ...rest,
  };
}

function marketplaceHasPlugin(path: string, pluginName: string): boolean {
  const marketplace = readJsonSafe(path);
  return Boolean(
    marketplace?.plugins?.some((plugin: { name?: string }) => plugin?.name === pluginName)
  );
}

function readCodexPluginList(): Record<string, unknown> | null {
  const output = runCommandText("codex", ["plugin", "list", "--json"]);
  if (!output) return null;
  const jsonStart = output.indexOf("{");
  if (jsonStart < 0) return null;
  try {
    return JSON.parse(output.slice(jsonStart));
  } catch {
    return null;
  }
}

function commandExists(command: string): boolean {
  try {
    execFileSync("sh", ["-c", `command -v ${command}`], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function runCommandText(command: string, args: string[]): string | null {
  try {
    return execFileSync(command, args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return null;
  }
}

function readFileSafe(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

function readJsonSafe(path: string): Record<string, any> | null {
  const raw = readFileSafe(path);
  try {
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function printSection(section: ReportSection): void {
  const present = section.results.filter((r) => r.present).length;
  const total = section.results.length;
  const required = section.results.filter((r) => r.severity === "required").length;
  const requiredPresent = section.results.filter(
    (r) => r.severity === "required" && r.present
  ).length;

  const header =
    chalk.bold(section.title.toUpperCase()) +
    chalk.dim(
      `  (${present}/${total} present` +
        (required > 0 ? `, ${requiredPresent}/${required} required` : "") +
        ")"
    );
  console.log(header);

  for (const result of section.results) {
    printResult(result);
  }
  console.log("");
}

function printResult(result: CheckResult): void {
  const marker = result.present
    ? chalk.green("  ✓")
    : result.severity === "required"
      ? chalk.red("  ✗")
      : chalk.yellow("  ✗");

  const nameColumn = result.name.padEnd(30);
  const severityTag =
    result.severity === "required" ? chalk.red("[required]") : chalk.dim("[recommended]");

  console.log(`${marker} ${nameColumn} ${severityTag}`);
  console.log(`     ${chalk.dim(result.purpose)}`);

  if (result.notes) {
    console.log(`     ${chalk.cyan("notes:")}   ${result.notes}`);
  }
  if (!result.present) {
    console.log(`     ${chalk.cyan("install:")} ${result.install}`);
  }
}

function printSummary(sections: ReportSection[]): number {
  const all = sections.flatMap((s) => s.results);
  const requiredMissing = all.filter((r) => r.severity === "required" && !r.present);
  const recommendedMissing = all.filter((r) => r.severity === "recommended" && !r.present);

  console.log(chalk.bold("SUMMARY"));

  if (requiredMissing.length === 0 && recommendedMissing.length === 0) {
    console.log(chalk.green("  All Soloship surfaces are present."));
    console.log("");
    return 0;
  }

  if (requiredMissing.length > 0) {
    console.log(chalk.red(`  ${requiredMissing.length} required item missing:`));
    for (const r of requiredMissing) {
      console.log(`    - ${r.name}`);
    }
  }

  if (recommendedMissing.length > 0) {
    console.log(
      chalk.yellow(`  ${recommendedMissing.length} recommended item missing:`)
    );
    for (const r of recommendedMissing) {
      console.log(`    - ${r.name}`);
    }
  }

  console.log("");
  return requiredMissing.length > 0 ? 1 : 0;
}
