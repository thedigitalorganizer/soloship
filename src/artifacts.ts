import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

/**
 * Artifact Schema Contracts
 *
 * Every generated artifact gets:
 * - Frontmatter with version, producer, timestamp, content hash, freshness TTL
 * - Schema validation on production and consumption
 * - Freshness checking — consumers warn when artifacts exceed TTL
 *
 * These contracts validate STRUCTURE and FRESHNESS, not semantic correctness.
 * A structurally valid, fresh artifact may still be semantically wrong.
 * That's an accepted risk — see the plan's Accepted Risks section.
 */

// --- Artifact Types ---

export type ArtifactType =
  | "audit-report"
  | "audit-findings"
  | "plan"
  | "solution"
  | "agents-md"
  | "brainstorm"
  | "spec";

interface ArtifactSchema {
  /** Required frontmatter fields */
  requiredFields: string[];
  /** Required content sections (markdown headings) */
  requiredSections: string[];
  /** Freshness TTL in days — consumers warn when artifact is older */
  ttlDays: number;
}

const SCHEMAS: Record<ArtifactType, ArtifactSchema> = {
  "audit-report": {
    requiredFields: ["date", "producer", "version"],
    requiredSections: ["Architecture", "Quality"],
    ttlDays: 30,
  },
  "audit-findings": {
    requiredFields: ["date", "producer", "version"],
    requiredSections: [],
    ttlDays: 30,
  },
  plan: {
    requiredFields: ["date", "version", "status"],
    requiredSections: ["Key Decisions"],
    ttlDays: 14,
  },
  solution: {
    requiredFields: ["title", "date", "category", "components"],
    requiredSections: ["Problem", "Root Cause", "Solution", "Prevention"],
    ttlDays: 90,
  },
  "agents-md": {
    requiredFields: [],
    requiredSections: ["Scope", "Owns", "Contracts"],
    ttlDays: 60,
  },
  brainstorm: {
    requiredFields: ["date", "version"],
    requiredSections: [],
    ttlDays: 14,
  },
  spec: {
    requiredFields: ["date", "version", "status"],
    requiredSections: ["Acceptance Criteria"],
    ttlDays: 14,
  },
};

// --- Content Hash ---

export function computeContentHash(content: string): string {
  // Trim to normalize: callers may pass body with or without leading/trailing
  // whitespace, and body extraction from files may include separator newlines.
  return createHash("sha256").update(content.trim()).digest("hex").substring(0, 12);
}

// --- Frontmatter ---

export interface ArtifactFrontmatter {
  [key: string]: string | number | string[] | undefined;
  date?: string;
  producer?: string;
  version?: string | number;
  content_hash?: string;
  ttl_days?: number;
  status?: string;
  title?: string;
  category?: string;
  components?: string[];
}

/**
 * Generate artifact frontmatter block.
 * Embeds provenance (producer, timestamp), integrity (content hash), and freshness (TTL).
 */
export function generateFrontmatter(
  type: ArtifactType,
  fields: Record<string, string | number | string[]>,
  content: string
): string {
  const schema = SCHEMAS[type];
  const hash = computeContentHash(content);
  const now = new Date().toISOString().split("T")[0];

  const frontmatter: Record<string, string | number | string[]> = {
    date: now,
    producer: "soloship",
    version: 1,
    content_hash: hash,
    ttl_days: schema.ttlDays,
    ...fields,
  };

  const lines = ["---"];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(", ")}]`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push("---");

  return lines.join("\n");
}

// --- Validation ---

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Parse frontmatter from a markdown artifact.
 * Returns null if no frontmatter block is found.
 *
 * Limitation: handles simple key: value pairs only. Multi-line YAML values
 * (| or > operators) and quoted strings with newlines are not supported.
 * This is sufficient for Soloship's generated frontmatter, which is always
 * single-line key-value pairs.
 */
export function parseFrontmatter(
  content: string
): ArtifactFrontmatter | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const fields: ArtifactFrontmatter = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.substring(0, colonIdx).trim();
    let value: string | string[] = line.substring(colonIdx + 1).trim();

    // Parse arrays: [a, b, c]
    if (value.startsWith("[") && value.endsWith("]")) {
      fields[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim());
    } else {
      fields[key] = value;
    }
  }
  return fields;
}

/**
 * Validate an artifact against its schema contract.
 * Checks: frontmatter presence, required fields, required sections, content hash integrity.
 */
export function validateArtifact(
  content: string,
  type: ArtifactType
): ValidationResult {
  const schema = SCHEMAS[type];
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check frontmatter exists
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) {
    errors.push("Missing frontmatter block (--- ... ---)");
    return { valid: false, errors, warnings };
  }

  // Check required fields
  for (const field of schema.requiredFields) {
    if (!frontmatter[field]) {
      errors.push(`Missing required frontmatter field: ${field}`);
    }
  }

  // Check content hash integrity
  if (frontmatter.content_hash) {
    const bodyContent = content.replace(/^---\n[\s\S]*?\n---\n*/, "");
    const currentHash = computeContentHash(bodyContent);
    if (currentHash !== frontmatter.content_hash) {
      warnings.push(
        `Content hash mismatch: artifact may have been modified without updating the hash`
      );
    }
  }

  // Check required sections (markdown headings)
  for (const section of schema.requiredSections) {
    const sectionPattern = new RegExp(
      `^#{1,3}\\s+.*${escapeRegex(section)}`,
      "mi"
    );
    if (!sectionPattern.test(content)) {
      errors.push(`Missing required section: ${section}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// --- Freshness ---

export interface FreshnessResult {
  fresh: boolean;
  ageDays: number;
  ttlDays: number;
  message: string;
}

/**
 * Check if an artifact is within its freshness TTL.
 * Returns a plain-language result the non-coder can understand.
 */
export function checkFreshness(
  content: string,
  type: ArtifactType
): FreshnessResult {
  const schema = SCHEMAS[type];
  const frontmatter = parseFrontmatter(content);

  if (!frontmatter?.date) {
    return {
      fresh: false,
      ageDays: -1,
      ttlDays: schema.ttlDays,
      message: `Cannot check age: no date found. This type of document expires after ${schema.ttlDays} days.`,
    };
  }

  // Use ttl_days from frontmatter if present, otherwise schema default
  const ttlDays =
    typeof frontmatter.ttl_days === "string"
      ? parseInt(frontmatter.ttl_days, 10)
      : typeof frontmatter.ttl_days === "number"
        ? frontmatter.ttl_days
        : schema.ttlDays;

  const dateStr = String(frontmatter.date);
  const artifactDate = new Date(dateStr);
  const now = new Date();
  const ageDays = Math.floor(
    (now.getTime() - artifactDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (ageDays > ttlDays) {
    return {
      fresh: false,
      ageDays,
      ttlDays,
      message: `Out of date: ${ageDays} days old (expires after ${ttlDays} days). Re-run the command that created this to get a fresh version.`,
    };
  }

  return {
    fresh: true,
    ageDays,
    ttlDays,
    message: `Up to date: ${ageDays} days old (expires after ${ttlDays} days).`,
  };
}

// --- File-Level Helpers ---

/**
 * Validate an artifact file from disk.
 * Combines schema validation and freshness checking.
 */
export function validateArtifactFile(
  filePath: string,
  type: ArtifactType
): { validation: ValidationResult; freshness: FreshnessResult } | null {
  if (!existsSync(filePath)) return null;

  const content = readFileSync(filePath, "utf-8");
  return {
    validation: validateArtifact(content, type),
    freshness: checkFreshness(content, type),
  };
}

/**
 * Detect artifact type from file path.
 * Returns null if the path doesn't match a known artifact pattern.
 */
export function detectArtifactType(filePath: string): ArtifactType | null {
  if (/docs\/audit\/AUDIT-.*\.md$/i.test(filePath)) return "audit-report";
  if (/audit-findings\.json$/i.test(filePath)) return "audit-findings";
  if (/docs\/plans\/.*\.md$/i.test(filePath)) return "plan";
  if (/docs\/solutions\/.*\.md$/i.test(filePath)) return "solution";
  if (/AGENTS\.md$/i.test(filePath)) return "agents-md";
  if (/spec\.md$/i.test(filePath)) return "spec";
  return null;
}

/**
 * Generate a freshness warning message suitable for systemMessage output.
 * Used by consuming skills to warn when artifacts exceed TTL.
 */
export function formatFreshnessWarnings(
  artifacts: Array<{ path: string; type: ArtifactType }>
): string | null {
  const staleWarnings: string[] = [];

  for (const { path, type } of artifacts) {
    if (!existsSync(path)) continue;
    const content = readFileSync(path, "utf-8");
    const freshness = checkFreshness(content, type);
    if (!freshness.fresh) {
      staleWarnings.push(`  - ${path}: ${freshness.message}`);
    }
  }

  if (staleWarnings.length === 0) return null;

  return (
    "OUT OF DATE — These documents are older than their expiration:\n\n" +
    staleWarnings.join("\n") +
    "\n\nRe-run the commands that created them to get fresh versions before relying on their content."
  );
}

// --- Utility ---

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
