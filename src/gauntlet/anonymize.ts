// Gauntlet — the blinding protocol.
//
// A reviewer told "this one is Opus" is measuring its priors, not the code. All
// blinding here is mechanical, and the residual scan FAILS the review rather
// than shipping a diff that names its author.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runDir } from "./config.js";
import { diffText } from "./workspace.js";
import type { Arm, GauntletConfig } from "./types.js";

/** Subdirectory holding anonymized submissions for reviewers. */
export const SUBMISSIONS_SUBDIR = "submissions";
/** Filename mapping codenames back to arms. Reviewers never read this. */
export const KEYS_FILENAME = "keys.json";

/**
 * Neutral codenames. Deliberately meaningless: anything evocative (ALPHA,
 * PRIME, FLAGSHIP) is itself a hint about which submission is meant to be good.
 */
export const CODENAME_POOL = [
  "ALDER", "BIRCH", "CEDAR", "DAMSON", "ELDER", "FILBERT",
  "GORSE", "HAZEL", "IVY", "JUNIPER", "KAURI", "LARCH",
  "MAPLE", "NUTMEG", "OLIVE", "PawPAW", "QUINCE", "ROWAN",
  "SORREL", "TEAK", "UMBER", "VETCH", "WILLOW", "XYLEM",
  "YARROW", "ZELKOVA",
];

/**
 * Strings that would reveal a submission's model or vendor. Matched
 * case-insensitively as whole words so ordinary prose ("the grok of it") is not
 * mangled while "claude-opus-5" is.
 */
export const IDENTITY_PATTERNS = [
  "claude", "anthropic", "opus", "sonnet", "haiku", "fable", "mythos",
  "openai", "gpt", "codex", "chatgpt",
  "grok", "xai",
  "gemini", "google deepmind", "llama", "mistral", "qwen", "deepseek",
  "soloship",
];

/**
 * Substrings that reveal the HARNESS CONDITION rather than the model.
 *
 * Path filtering removes the artifacts themselves, but a surviving file can
 * still *reference* one — a code comment citing a plan, a decisions log naming
 * the workflow that produced it. Unlike the identity patterns these are paths
 * and command names, so they are matched as plain substrings rather than whole
 * words.
 */
export const CONDITION_PATTERNS = [
  "docs/plans/",
  "docs/solutions/",
  "docs/drafts/",
  "docs/handoffs/",
  ".claude/",
  ".codex/",
  ".ai/",
];

/** Replacement token left in place of any scrubbed identifier. */
export const REDACTION = "[REDACTED-AGENT]";
/** Replacement token for a scrubbed process-artifact reference. */
export const CONDITION_REDACTION = "[REDACTED-PATH]";

/** Git metadata lines a diff can carry that would identify the author. */
const METADATA_LINE = /^(index |From |Author:|Date:|commit |Signed-off-by:).*$/gm;

/** Deterministic codename for an arm — same run always yields the same
 *  mapping, so a rerun of `review` does not reshuffle the report. */
export function codenameFor(runId: string, armId: string, salt = ""): string {
  const digest = createHash("sha256")
    .update(`${runId}:${armId}:${salt}`)
    .digest();
  const index = digest.readUInt32BE(0) % CODENAME_POOL.length;
  const suffix = digest.toString("hex").slice(0, 4).toUpperCase();
  return `${CODENAME_POOL[index]}-${suffix}`;
}

/** Assign unique codenames to every arm, re-salting on the rare collision. */
export function assignCodenames(
  runId: string,
  armIds: string[]
): Map<string, string> {
  const assigned = new Map<string, string>();
  const used = new Set<string>();
  for (const armId of armIds) {
    let salt = 0;
    let codename = codenameFor(runId, armId);
    while (used.has(codename)) {
      salt += 1;
      codename = codenameFor(runId, armId, String(salt));
    }
    used.add(codename);
    assigned.set(armId, codename);
  }
  return assigned;
}

function escapeRegex(pattern: string): string {
  return pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Remove identifying strings, process-artifact references, and git metadata. */
export function scrubIdentity(text: string, extraPatterns: string[] = []): string {
  let scrubbed = text.replace(METADATA_LINE, (line) =>
    line.startsWith("index ") ? "index [REDACTED]" : `${line.split(":")[0]}: [REDACTED]`
  );
  for (const pattern of [...IDENTITY_PATTERNS, ...extraPatterns]) {
    scrubbed = scrubbed.replace(
      new RegExp(`\\b${escapeRegex(pattern)}\\b`, "gi"),
      REDACTION
    );
  }
  for (const pattern of CONDITION_PATTERNS) {
    scrubbed = scrubbed.replace(
      new RegExp(escapeRegex(pattern), "gi"),
      CONDITION_REDACTION
    );
  }
  return scrubbed;
}

/** Anything the scrub should have caught but did not. Non-empty means the
 *  bundle must not be shown to a reviewer. */
export function residualLeaks(
  text: string,
  extraPatterns: string[] = []
): string[] {
  const leaks = new Set<string>();
  for (const pattern of [...IDENTITY_PATTERNS, ...extraPatterns]) {
    if (new RegExp(`\\b${escapeRegex(pattern)}\\b`, "i").test(text)) {
      leaks.add(pattern);
    }
  }
  for (const pattern of CONDITION_PATTERNS) {
    if (new RegExp(escapeRegex(pattern), "i").test(text)) leaks.add(pattern);
  }
  return [...leaks];
}

/** Build the git pathspec that keeps process artifacts out of a reviewed diff. */
export function buildPathspecs(
  includePaths: string[],
  excludePaths: string[]
): string[] {
  const specs = includePaths.length > 0 ? [...includePaths] : ["."];
  for (const excluded of excludePaths) specs.push(`:(exclude)${excluded}`);
  return specs;
}

export interface Submission {
  codename: string;
  armId: string;
  diff: string;
  /** Lines in the reviewed (post-filter) diff — used to expose judge style bias. */
  diffLines: number;
}

export interface BundleResult {
  submissions: Submission[];
  /** Arm ids skipped because they produced nothing reviewable. */
  empty: string[];
  /** Arm ids whose diff still named a model after scrubbing. */
  leaked: { armId: string; patterns: string[] }[];
}

/**
 * Produce the anonymized review bundle and write it to disk.
 *
 * Order matters: filter paths, then scrub, then re-scan. Scrubbing before
 * filtering would waste work and, worse, could leave a filtered-out artifact's
 * identifier in a cached string.
 */
export function buildSubmissions(
  config: GauntletConfig,
  arms: Arm[],
  heads: Map<string, string>
): BundleResult {
  const codenames = assignCodenames(config.runId, arms.map((arm) => arm.id));
  const pathspecs = buildPathspecs(
    config.review.includePaths,
    config.review.excludePaths
  );

  const submissions: Submission[] = [];
  const empty: string[] = [];
  const leaked: { armId: string; patterns: string[] }[] = [];

  for (const arm of arms) {
    const head = heads.get(arm.id);
    if (!head) {
      empty.push(arm.id);
      continue;
    }
    const raw = diffText(config.repoRoot, config.baseline, head, pathspecs);
    if (raw.trim().length === 0) {
      empty.push(arm.id);
      continue;
    }
    const diff = scrubIdentity(raw, config.review.extraScrubPatterns);
    const residual = residualLeaks(diff, config.review.extraScrubPatterns);
    if (residual.length > 0) {
      leaked.push({ armId: arm.id, patterns: residual });
      continue;
    }
    submissions.push({
      codename: codenames.get(arm.id)!,
      armId: arm.id,
      diff,
      diffLines: diff.split("\n").length,
    });
  }

  writeBundle(config, submissions, codenames);
  return { submissions, empty, leaked };
}

function writeBundle(
  config: GauntletConfig,
  submissions: Submission[],
  codenames: Map<string, string>
): void {
  const dir = join(runDir(config.repoRoot, config.runId), SUBMISSIONS_SUBDIR);
  mkdirSync(dir, { recursive: true });
  for (const submission of submissions) {
    writeFileSync(
      join(dir, `${submission.codename}.diff`),
      submission.diff,
      "utf-8"
    );
  }
  // The key lives beside the run state, NOT inside the submissions directory
  // that reviewers are pointed at.
  writeFileSync(
    join(runDir(config.repoRoot, config.runId), KEYS_FILENAME),
    `${JSON.stringify(Object.fromEntries(codenames), null, 2)}\n`,
    "utf-8"
  );
}

/** Deterministic shuffle so each reviewer sees a different order without the
 *  run becoming irreproducible. */
export function shuffleForReviewer<T>(items: T[], seed: number): T[] {
  const shuffled = [...items];
  let state = (seed >>> 0) || 1;
  const next = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
