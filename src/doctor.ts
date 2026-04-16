/**
 * `soloship doctor` — audit the user's Claude Code environment against
 * Soloship's dependency manifest.
 *
 * Reads the local filesystem only — no network calls. Reports what's present,
 * what's missing, and how to install the missing pieces. Exits 0 if all
 * REQUIRED dependencies are present (recommended ones are informational),
 * exits 1 if any required dep is missing.
 */

import chalk from "chalk";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import {
  SOLOSHIP_MANIFEST,
  type HookDep,
  type McpServerDep,
  type PluginDep,
  type Severity,
  type SkillDep,
} from "./manifest.js";

interface CheckResult {
  name: string;
  present: boolean;
  severity: Severity;
  purpose: string;
  install: string;
  notes?: string;
  usedBy?: string[];
}

interface ReportSection {
  title: string;
  results: CheckResult[];
}

export async function runDoctor(): Promise<void> {
  const home = homedir();
  const settingsPath = join(home, ".claude", "settings.json");
  const claudeJsonPath = join(home, ".claude.json");
  const skillsDir = join(home, ".claude", "skills");

  const settings = readJsonSafe(settingsPath);
  const claudeJson = readJsonSafe(claudeJsonPath);

  console.log(chalk.dim("Checking your Claude Code environment..."));
  console.log("");

  const sections: ReportSection[] = [
    {
      title: "Plugins",
      results: SOLOSHIP_MANIFEST.plugins.map((dep) => checkPlugin(dep, settings)),
    },
    {
      title: "MCP servers",
      results: SOLOSHIP_MANIFEST.mcpServers.map((dep) =>
        checkMcpServer(dep, claudeJson)
      ),
    },
    {
      title: "Global skills",
      results: SOLOSHIP_MANIFEST.skills.map((dep) => checkSkill(dep, skillsDir)),
    },
    {
      title: "Hooks",
      results: SOLOSHIP_MANIFEST.hooks.map((dep) => checkHook(dep, settings)),
    },
  ];

  for (const section of sections) {
    printSection(section);
  }

  const exitCode = printSummary(sections);
  process.exit(exitCode);
}

// ---------------------------------------------------------------------------
// Individual check functions
// ---------------------------------------------------------------------------

function checkPlugin(dep: PluginDep, settings: Record<string, unknown> | null): CheckResult {
  const enabled = (settings?.enabledPlugins as Record<string, boolean> | undefined) || {};
  // Plugin keys in settings.json look like "superpowers@superpowers-marketplace"
  const expectedKey = `${dep.id}@${dep.source}`;
  // Also accept a bare id match for marketplaces whose names we may not know
  // precisely — any key starting with "dep.id@" counts as present.
  const present = Object.keys(enabled).some(
    (key) => key === expectedKey || key.startsWith(`${dep.id}@`)
  );

  return {
    name: dep.id,
    present,
    severity: dep.severity,
    purpose: dep.purpose,
    install: dep.install,
    usedBy: dep.usedBy,
  };
}

function checkMcpServer(dep: McpServerDep, claudeJson: Record<string, unknown> | null): CheckResult {
  const servers = (claudeJson?.mcpServers as Record<string, unknown> | undefined) || {};
  const present = Object.prototype.hasOwnProperty.call(servers, dep.name);

  return {
    name: dep.name,
    present,
    severity: dep.severity,
    purpose: dep.purpose,
    install: dep.install,
    notes: dep.notes,
  };
}

function checkSkill(dep: SkillDep, skillsDir: string): CheckResult {
  let present = false;
  if (existsSync(skillsDir)) {
    try {
      const entries = readdirSync(skillsDir);
      present = entries.includes(dep.name);
    } catch {
      // Permission error or similar — treat as missing
    }
  }

  return {
    name: dep.name,
    present,
    severity: dep.severity,
    purpose: dep.purpose,
    install: dep.install,
  };
}

function checkHook(dep: HookDep, settings: Record<string, unknown> | null): CheckResult {
  const hooks = (settings?.hooks as Record<string, unknown> | undefined) || {};
  const eventEntries = (hooks[dep.event] as Array<Record<string, unknown>> | undefined) || [];

  const present = eventEntries.some((entry) => {
    const matcher = entry.matcher as string | undefined;
    if (dep.matcher !== null && matcher !== dep.matcher) {
      return false;
    }
    const nestedHooks = (entry.hooks as Array<Record<string, unknown>> | undefined) || [];
    return nestedHooks.some((h) => {
      const command = h.command as string | undefined;
      return typeof command === "string" && command.includes(dep.commandContains);
    });
  });

  const matcherLabel = dep.matcher ? `(${dep.matcher})` : "";
  return {
    name: `${dep.event}${matcherLabel}`,
    present,
    severity: dep.severity,
    purpose: dep.purpose,
    install: dep.install,
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

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

  const nameColumn = result.name.padEnd(28);
  const severityTag =
    result.severity === "required" ? chalk.red("[required]") : chalk.dim("[recommended]");

  console.log(`${marker} ${nameColumn} ${severityTag}`);
  console.log(`     ${chalk.dim(result.purpose)}`);

  if (!result.present) {
    console.log(`     ${chalk.cyan("install:")} ${result.install}`);
    if (result.notes) {
      console.log(`     ${chalk.cyan("notes:")}   ${result.notes}`);
    }
    if (result.usedBy && result.usedBy.length > 0) {
      console.log(`     ${chalk.cyan("used by:")} ${result.usedBy.join(", ")}`);
    }
  }
}

function printSummary(sections: ReportSection[]): number {
  const all = sections.flatMap((s) => s.results);
  const requiredMissing = all.filter((r) => r.severity === "required" && !r.present);
  const recommendedMissing = all.filter((r) => r.severity === "recommended" && !r.present);

  console.log(chalk.bold("SUMMARY"));

  if (requiredMissing.length === 0 && recommendedMissing.length === 0) {
    console.log(chalk.green("  All dependencies present — environment is Soloship-ready."));
    console.log("");
    return 0;
  }

  if (requiredMissing.length > 0) {
    console.log(chalk.red(`  ${requiredMissing.length} required dependency missing:`));
    for (const r of requiredMissing) {
      console.log(`    - ${r.name}`);
    }
  }

  if (recommendedMissing.length > 0) {
    console.log(
      chalk.yellow(`  ${recommendedMissing.length} recommended dependency missing:`)
    );
    for (const r of recommendedMissing) {
      console.log(`    - ${r.name}`);
    }
  }

  console.log("");

  if (requiredMissing.length > 0) {
    console.log(
      chalk.red(
        "Some Soloship skills will not work until the required dependencies are installed."
      )
    );
    console.log("");
    return 1;
  }

  console.log(
    chalk.dim(
      "Recommended dependencies improve non-coder workflow but are not strictly required."
    )
  );
  console.log("");
  return 0;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJsonSafe(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
