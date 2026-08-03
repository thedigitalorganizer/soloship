/**
 * Solution-doc frontmatter schema — the single source of truth.
 *
 * Two consumers describe this schema and must never disagree:
 *
 *   1. `skills/learn/SKILL.md` — the skill that WRITES solution docs. It is the
 *      human/agent-facing source of truth: an agent writing a doc reads the
 *      skill, not this file.
 *   2. `generateSolutionGuide()` in `src/templates.ts` — the reference doc every
 *      `npx soloship init` drops at `docs/SOLUTION_GUIDE.md`, which DOCUMENTS
 *      the schema for the project.
 *
 * They drifted, and the drift shipped. The generated guide never mentioned
 * `problem_type`, `root_cause`, or `resolution_type` — the three fields the
 * learn skill treats as the searchable index — so every bootstrapped project
 * received a reference doc contradicting the docs the skill produced. Projects
 * that then built validators on the guide failed on nearly all of their own
 * docs (MAPS, 2026-08-02: 421 errors across 317 docs, gating nothing); projects
 * that did not simply carried the contradiction silently (Command Center).
 *
 * `__arch__/solution-schema-sync.test.ts` extracts the enums and track
 * membership from `skills/learn/SKILL.md` at test time and asserts they equal
 * the constants below. Changing the skill without changing this module — or the
 * reverse — turns CI red by design.
 */

/**
 * Required on every solution doc, both tracks.
 * Mirrors the completion checklist in `skills/learn/SKILL.md`.
 */
export const ALWAYS_REQUIRED_FIELDS = [
  "title",
  "date",
  "problem_type",
  "category",
  "components",
  "tags",
] as const;

/**
 * Required only on the bug track. A bug doc without the observable symptom and
 * the underlying cause is useless to a future searcher — which is exactly why
 * these are conditional rather than universal: a `pattern` or `convention` doc
 * has no symptom to record, and forcing one produces noise.
 */
export const BUG_TRACK_REQUIRED_FIELDS = [
  "symptoms",
  "root_cause",
  "resolution_type",
] as const;

/** Never required; include when they carry real information. */
export const OPTIONAL_FIELDS = ["files", "error_messages"] as const;

/**
 * Written by the learn skill itself, not by hand. `content_hash` is the first
 * 12 chars of the SHA-256 of the doc body, computed after the body is written.
 */
export const PRODUCER_FIELDS = [
  "producer",
  "version",
  "ttl_days",
  "content_hash",
] as const;

/**
 * `problem_type` selects the track, and the track decides which fields are
 * required. Bug track: something was broken and you fixed it.
 */
export const BUG_TRACK_PROBLEM_TYPES = [
  "build_error",
  "test_failure",
  "runtime_error",
  "performance_issue",
  "database_issue",
  "security_issue",
  "ui_bug",
  "integration_issue",
  "logic_error",
] as const;

/**
 * Knowledge track: durable guidance with no single broken thing.
 * `symptoms`/`root_cause`/`resolution_type` are optional here.
 */
export const KNOWLEDGE_TRACK_PROBLEM_TYPES = [
  "best_practice",
  "pattern",
  "convention",
  "concept",
] as const;

/** The searchable index of *why* it broke. Pick the closest value. */
export const ROOT_CAUSE_ENUM = [
  "missing_association",
  "missing_include",
  "missing_index",
  "wrong_api",
  "scope_issue",
  "thread_violation",
  "async_timing",
  "memory_leak",
  "config_error",
  "logic_error",
  "test_isolation",
  "missing_validation",
  "missing_permission",
  "missing_workflow_step",
  "inadequate_documentation",
  "missing_tooling",
  "incomplete_setup",
] as const;

/** The searchable index of *how* it was fixed. Pick the closest value. */
export const RESOLUTION_TYPE_ENUM = [
  "code_fix",
  "migration",
  "config_change",
  "test_fix",
  "dependency_update",
  "environment_setup",
  "workflow_improvement",
  "documentation_update",
  "tooling_addition",
  "seed_data_update",
] as const;

/**
 * Categories are an OPEN set — these are common starting points, not a
 * whitelist. Categories emerge from the solutions a project actually
 * accumulates; a project's real categories are whatever directories exist
 * under `docs/solutions/`.
 *
 * This openness is load-bearing. A previous closed 9-item list shipped here was
 * copied verbatim into a downstream validator, which then rejected five
 * legitimate categories (`workflow-issues`, `patterns`, `logic-errors`,
 * `runtime-errors`, `performance-issues`) as invalid — 133 of that validator's
 * 421 errors. Anything consuming this list must treat it as examples.
 */
export const EXAMPLE_CATEGORIES = [
  "api-issues",
  "auth-bugs",
  "infrastructure",
  "integration-issues",
  "logic-errors",
  "patterns",
  "performance-issues",
  "refactoring",
  "runtime-errors",
  "security",
  "ui-bugs",
  "workflow-issues",
] as const;
