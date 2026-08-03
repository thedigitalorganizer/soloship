import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProjectInfo } from "./detect.js";
import { getVersion } from "./pkg.js";
import { syncSolutionGuide, type DocAction } from "./guide-freshness.js";
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
  action: DocAction;
}

// The document taxonomy. Each folder has exactly one kind of artifact and one
// lifecycle — that separation is what keeps docs/plans/ trustworthy. Before
// this split, docs/plans/ was an open namespace: drafts, grill outputs,
// handoffs, decision logs, and status reports all landed there alongside real
// plans, and a reader (human or agent) could not tell a live plan from an
// abandoned draft. Worse, only real /plan output carries status frontmatter, so
// half the directory was invisible to the plan-truth gate by construction.
//
// The README in each folder is not decoration: an agent that lands in the
// folder learns the contract without having to read a skill first.
export const SCAFFOLD_DIRS = [
  "docs/plans", // live plans ONLY — status frontmatter required (enforced)
  "docs/plans/archive", // completed / abandoned plans
  "docs/drafts", // pre-plan exploration — self-deletes on promotion to a plan
  "docs/handoffs", // session handoffs — self-deletes when consumed
  "docs/reports", // point-in-time snapshots — inherently historical
  "docs/solutions",
  "docs/architecture",
  "docs/architecture/decisions", // decision logs live here (the ADR home)
  "docs/audit",
  "docs/automations",
] as const;

// Folder-level contracts, written as README.md into each new folder.
const FOLDER_READMES: Record<string, string> = {
  "docs/plans": `# docs/plans/

**Live plans only.** Every file here must carry YAML frontmatter with a
\`status:\` field in the canonical vocabulary: \`planned\`, \`in-progress\`,
\`blocked\`, \`done\`, \`abandoned\`, \`superseded\`.

This is enforced — the plan-namespace gate blocks any write to this folder of a
file without valid status frontmatter.

**Anything else belongs elsewhere:**

| If it is… | It goes in… |
|---|---|
| Pre-plan exploration, a draft, a design note, a grill output | \`docs/drafts/\` |
| A session handoff | \`docs/handoffs/\` |
| A point-in-time report or snapshot | \`docs/reports/\` |
| A decision log / ADR | \`docs/architecture/decisions/\` |

**Why:** agents read plans and act on them. A plan whose status lies — saying
"planned" for work that is already live — can send an agent to build the same
thing a second time. The status field is only trustworthy if nothing else can
masquerade as a plan.

Completed plans are archived to \`archive/\` (large) or deleted (small), per the
plan-lifecycle rule.
`,
  "docs/drafts": `# docs/drafts/

Pre-plan exploration: drafts, design notes, brainstorm and grill outputs,
half-formed ideas. Nothing here is a commitment, and nothing here should be
executed.

**Lifecycle — these self-clean.** When a draft is promoted into a real plan, the
plan records \`promoted_from: docs/drafts/<file>\` in its frontmatter and the
draft is **deleted in the same commit**. The plan supersedes it; keeping both
means the next agent has to guess which one is current.

\`/soloship:cleanup\` sweeps orphans (a draft whose plan already exists).
`,
  "docs/handoffs": `# docs/handoffs/

Session-boundary handoff documents — what the next session needs to know to pick
up work in flight.

**Lifecycle — these self-clean.** A handoff is consumed exactly once. When the
work it describes is executed, the handoff is **deleted** by the skill that
consumed it. A handoff that outlives its execution is worse than no handoff: it
describes a world that no longer exists, and the next agent cannot tell.

\`/soloship:cleanup\` sweeps orphans (a handoff whose plan is already \`done\`).
`,
  "docs/reports": `# docs/reports/

Point-in-time snapshots: morning reports, status reports, one-off analyses.

These are **historical records, never actionable work.** A report describes what
was true at a moment; it does not describe what should happen next. Nothing here
should ever be executed, and nothing here needs cleaning up — a stale report is
still a true record of its moment.

If a report produces work that should happen, that work becomes a plan in
\`docs/plans/\`.
`,
};

export async function scaffoldDocs(
  root: string,
  project: ProjectInfo,
  options: {
    createClaudeMd?: boolean;
    createAgentsMd?: boolean;
    refreshGuides?: boolean;
  } = {}
): Promise<ScaffoldResult[]> {
  const results: ScaffoldResult[] = [];
  const createClaudeMd = options.createClaudeMd ?? true;
  const createAgentsMd = options.createAgentsMd ?? true;
  const refreshGuides = options.refreshGuides ?? false;

  // Create directory structure
  for (const dir of SCAFFOLD_DIRS) {
    const fullPath = join(root, dir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
      results.push({ path: dir + "/", action: "created" });
    } else {
      results.push({ path: dir + "/", action: "exists" });
    }

    // Folder contract. Never overwrite — a project may have customized it.
    const readme = FOLDER_READMES[dir];
    if (readme) {
      const readmePath = join(fullPath, "README.md");
      if (!existsSync(readmePath)) {
        writeFileSync(readmePath, readme);
        results.push({ path: dir + "/README.md", action: "created" });
      }
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

  // Solution Guide — created when absent, version-checked when present.
  // `upgrade` runs the same reconciliation without the create half, so the
  // logic lives in guide-freshness.ts rather than here.
  results.push(
    ...syncSolutionGuide(root, {
      refresh: refreshGuides,
      createIfMissing: true,
    })
  );

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
