import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProjectInfo } from "./detect.js";
import { getVersion } from "./pkg.js";
import {
  generateClaudeMd,
  generateAgentsMd,
  generateSolutionGuide,
  generateAutomationRegistry,
  generateAutomationsReadme,
  generateChangelog,
} from "./templates.js";

interface ScaffoldResult {
  path: string;
  action: "created" | "exists" | "updated" | "skipped";
}

export async function scaffoldDocs(
  root: string,
  project: ProjectInfo,
  options: { createClaudeMd?: boolean; createAgentsMd?: boolean } = {}
): Promise<ScaffoldResult[]> {
  const results: ScaffoldResult[] = [];
  const createClaudeMd = options.createClaudeMd ?? true;
  const createAgentsMd = options.createAgentsMd ?? true;

  // Create directory structure
  const dirs = [
    "docs/plans",
    "docs/plans/archive",
    "docs/solutions",
    "docs/architecture",
    "docs/architecture/decisions",
    "docs/audit",
    "docs/automations",
  ];

  for (const dir of dirs) {
    const fullPath = join(root, dir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
      results.push({ path: dir + "/", action: "created" });
    } else {
      results.push({ path: dir + "/", action: "exists" });
    }
  }

  // CLAUDE.md — only create for Claude-targeted setup and never overwrite.
  if (!createClaudeMd) {
    results.push({ path: "CLAUDE.md", action: "skipped" });
  } else if (!project.existingDocs.hasClaudeMd) {
    const content = generateClaudeMd(project);
    writeFileSync(join(root, "CLAUDE.md"), content);
    results.push({ path: "CLAUDE.md", action: "created" });
  } else {
    results.push({ path: "CLAUDE.md", action: "exists" });
  }

  // AGENTS.md — root level, only if doesn't exist
  if (!createAgentsMd) {
    results.push({ path: "AGENTS.md", action: "skipped" });
  } else if (!project.existingDocs.hasAgentsMd) {
    const content = generateAgentsMd(project);
    writeFileSync(join(root, "AGENTS.md"), content);
    results.push({ path: "AGENTS.md", action: "created" });
  } else {
    results.push({ path: "AGENTS.md", action: "exists" });
  }

  // CHANGELOG.md — only if doesn't exist
  if (!project.existingDocs.hasChangelog) {
    const content = generateChangelog(project);
    writeFileSync(join(root, "CHANGELOG.md"), content);
    results.push({ path: "CHANGELOG.md", action: "created" });
  } else {
    results.push({ path: "CHANGELOG.md", action: "exists" });
  }

  // Solution Guide — always create (it's a reference doc)
  const solutionGuidePath = join(root, "docs", "SOLUTION_GUIDE.md");
  if (!existsSync(solutionGuidePath)) {
    writeFileSync(solutionGuidePath, generateSolutionGuide());
    results.push({ path: "docs/SOLUTION_GUIDE.md", action: "created" });
  } else {
    results.push({ path: "docs/SOLUTION_GUIDE.md", action: "exists" });
  }

  // Automation registry — the single source of truth for every cron/webhook/
  // scheduled job this project owns (automation-registry rule; /soloship:cron
  // is the console). Scaffolded empty; audit/bootstrap and /soloship:cron
  // populate it as automations are found or built.
  const automationRegistryPath = join(root, "docs", "automations", "registry.json");
  if (!existsSync(automationRegistryPath)) {
    writeFileSync(automationRegistryPath, generateAutomationRegistry());
    results.push({ path: "docs/automations/registry.json", action: "created" });
  } else {
    results.push({ path: "docs/automations/registry.json", action: "exists" });
  }
  const automationsReadmePath = join(root, "docs", "automations", "README.md");
  if (!existsSync(automationsReadmePath)) {
    writeFileSync(automationsReadmePath, generateAutomationsReadme());
    results.push({ path: "docs/automations/README.md", action: "created" });
  } else {
    results.push({ path: "docs/automations/README.md", action: "exists" });
  }

  // Semgrep config for automated security scanning
  const semgrepPath = join(root, ".semgrep.yml");
  if (!existsSync(semgrepPath)) {
    writeFileSync(semgrepPath, generateSemgrepConfig());
    results.push({ path: ".semgrep.yml", action: "created" });
  } else {
    results.push({ path: ".semgrep.yml", action: "exists" });
  }

  // Soloship version stamp + per-clone cache directory
  const stampResults = writeVersionStamp(root);
  results.push(...stampResults);

  return results;
}

export function writeVersionStamp(root: string): ScaffoldResult[] {
  const results: ScaffoldResult[] = [];
  const soloshipDir = join(root, ".soloship");
  if (!existsSync(soloshipDir)) {
    mkdirSync(soloshipDir, { recursive: true });
  }

  const versionPath = join(soloshipDir, "version");
  const exists = existsSync(versionPath);
  writeFileSync(versionPath, getVersion() + "\n");
  results.push({
    path: ".soloship/version",
    action: exists ? "updated" : "created",
  });

  // Local-only cache file is gitignored; the version stamp itself is committed
  // so collaborators see the same pinned version.
  const gitignorePath = join(soloshipDir, ".gitignore");
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, ".last-update-check\n");
    results.push({ path: ".soloship/.gitignore", action: "created" });
  }

  return results;
}

function generateSemgrepConfig(): string {
  return `# Semgrep configuration — Soloship automated security scanning
# Runs automatically on every commit via Claude Code hook.
# Critical findings block the commit. Medium findings warn.
#
# Install semgrep: pip install semgrep (or pipx install semgrep)
# Manual scan: semgrep --config .semgrep.yml src/

rules:
  # --- Injection ---
  - id: hardcoded-secret
    pattern-either:
      - pattern: $KEY = "..."
      - pattern: $KEY = '...'
    metavariable-regex:
      metavariable: $KEY
      regex: (?i)(api_key|secret|password|token|credential|private_key)
    message: "Possible hardcoded secret in $KEY. Use environment variables instead."
    severity: ERROR
    languages: [javascript, typescript, python, ruby]

  - id: sql-string-concat
    pattern-either:
      - pattern: |
          $QUERY = "..." + $INPUT + "..."
      - pattern: |
          $QUERY = \`...\${$INPUT}...\`
    message: "SQL query built with string concatenation. Use parameterized queries."
    severity: ERROR
    languages: [javascript, typescript]

  - id: eval-usage
    pattern-either:
      - pattern: eval(...)
      - pattern: new Function(...)
    message: "eval() or new Function() detected. This enables code injection."
    severity: ERROR
    languages: [javascript, typescript]

  # --- XSS ---
  - id: innerhtml-usage
    pattern: $EL.innerHTML = $VALUE
    message: "innerHTML assignment detected. Use textContent or sanitize input."
    severity: WARNING
    languages: [javascript, typescript]

  - id: dangerously-set-html
    pattern: dangerouslySetInnerHTML={...}
    message: "dangerouslySetInnerHTML usage. Ensure input is sanitized."
    severity: WARNING
    languages: [javascript, typescript]

  # --- Auth ---
  - id: jwt-none-algorithm
    pattern-either:
      - pattern: |
          jwt.sign($PAYLOAD, ..., {algorithm: "none"})
      - pattern: |
          jwt.verify($TOKEN, ..., {algorithms: ["none"]})
    message: "JWT with 'none' algorithm is insecure."
    severity: ERROR
    languages: [javascript, typescript]

  # Extend with p/owasp-top-ten for comprehensive coverage:
  # semgrep --config p/owasp-top-ten --config .semgrep.yml src/
`;
}
