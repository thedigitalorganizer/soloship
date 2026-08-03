// Solution-doc schema sync fitness test.
//
// The schema ships three times: as prose in skills/learn/SKILL.md (the skill
// that WRITES solution docs, and what an agent actually reads), as constants in
// src/solution-schema.ts, and as the generated docs/SOLUTION_GUIDE.md every
// `npx soloship init` drops into a user's project.
//
// They drifted, and the drift shipped for months: the generated guide never
// mentioned problem_type, root_cause, or resolution_type — the three fields the
// learn skill treats as the searchable index — so bootstrapped projects received
// a reference doc contradicting the docs the skill produced. A downstream
// validator built on that guide reported 421 errors across 317 docs and was
// duly ignored (MAPS, 2026-08-02).
//
// SKILL.md is the source of truth. Every expected value below is EXTRACTED from
// it at test time — no duplicated string literals — so changing the skill
// without changing src/solution-schema.ts (or the reverse) turns this red.
//
// Deliberately observable-to-fail: every extractor throws on a missing section
// rather than returning empty, so a restructured skill cannot silently pass.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALWAYS_REQUIRED_FIELDS,
  BUG_TRACK_PROBLEM_TYPES,
  BUG_TRACK_REQUIRED_FIELDS,
  KNOWLEDGE_TRACK_PROBLEM_TYPES,
  RESOLUTION_TYPE_ENUM,
  ROOT_CAUSE_ENUM,
} from "../src/solution-schema";
import { generateSolutionGuide } from "../src/templates";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_PATH = join(ROOT, "skills", "learn", "SKILL.md");
const SKILL = readFileSync(SKILL_PATH, "utf8");

/** Collapse whitespace so line wrapping in the skill never masks real drift. */
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

/** Every `backticked` token in a slice of skill prose, in document order. */
function backtickedTokens(segment: string): string[] {
  return [...segment.matchAll(/`([a-z_]+)`/g)].map((match) => match[1]);
}

/**
 * The prose between two markers. Throws when either marker is absent — a
 * reworded skill must fail loudly, not silently extract nothing.
 */
function sliceBetween(startMarker: string, endMarker: string): string {
  const normalized = normalize(SKILL);
  const start = normalized.indexOf(startMarker);
  if (start === -1) {
    throw new Error(
      `skills/learn/SKILL.md no longer contains "${startMarker}" — the schema extractor in __arch__/solution-schema-sync.test.ts needs updating alongside the reworded skill`
    );
  }
  const end = normalized.indexOf(endMarker, start);
  if (end === -1) {
    throw new Error(
      `skills/learn/SKILL.md has "${startMarker}" but no following "${endMarker}" — extractor cannot bound the section`
    );
  }
  return normalized.slice(start + startMarker.length, end);
}

/** Bug-track problem_type values, from the track description. */
function bugTrackProblemTypesFromSkill(): string[] {
  return backtickedTokens(
    sliceBetween("bug-ish value:", "The bug track")
  );
}

/** Knowledge-track problem_type values, minus the `problem_type` mention itself. */
function knowledgeTrackProblemTypesFromSkill(): string[] {
  const segment = sliceBetween("**Knowledge track**", "Here `symptoms`");
  return backtickedTokens(segment).filter((token) => token !== "problem_type");
}

/** The three fields the bug track adds on top of the always-required set. */
function bugTrackRequiredFieldsFromSkill(): string[] {
  return backtickedTokens(
    sliceBetween("The bug track **requires**", "— the doc is useless")
  );
}

/** Fields required on every doc, from the skill's completion checklist. */
function alwaysRequiredFieldsFromSkill(): string[] {
  const segment = sliceBetween("Frontmatter includes:", "— and, for");
  return segment
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);
}

/** An enum's values, from its `**\`name\` enum**` heading up to the next blank-ish break. */
function enumFromSkill(name: string): string[] {
  return backtickedTokens(
    sliceBetween(`**\`${name}\` enum** (pick the closest):`, ".")
  );
}

describe("solution-doc schema stays in sync with skills/learn/SKILL.md", () => {
  it("bug-track problem_type values match", () => {
    expect(bugTrackProblemTypesFromSkill()).toEqual([
      ...BUG_TRACK_PROBLEM_TYPES,
    ]);
  });

  it("knowledge-track problem_type values match", () => {
    expect(knowledgeTrackProblemTypesFromSkill()).toEqual([
      ...KNOWLEDGE_TRACK_PROBLEM_TYPES,
    ]);
  });

  it("bug-track conditional fields match", () => {
    expect(bugTrackRequiredFieldsFromSkill()).toEqual([
      ...BUG_TRACK_REQUIRED_FIELDS,
    ]);
  });

  it("always-required fields match", () => {
    expect(alwaysRequiredFieldsFromSkill()).toEqual([
      ...ALWAYS_REQUIRED_FIELDS,
    ]);
  });

  it("root_cause enum matches", () => {
    expect(enumFromSkill("root_cause")).toEqual([...ROOT_CAUSE_ENUM]);
  });

  it("resolution_type enum matches", () => {
    expect(enumFromSkill("resolution_type")).toEqual([
      ...RESOLUTION_TYPE_ENUM,
    ]);
  });
});

describe("the generated SOLUTION_GUIDE documents the schema it ships with", () => {
  const guide = normalize(generateSolutionGuide());

  // The original defect: the guide simply never named these fields, so every
  // bootstrapped project documented a schema the learn skill does not write.
  const everyField = [
    ...ALWAYS_REQUIRED_FIELDS,
    ...BUG_TRACK_REQUIRED_FIELDS,
  ];
  for (const field of everyField) {
    it(`names the "${field}" field`, () => {
      expect(
        guide.includes(field),
        `generateSolutionGuide() never mentions "${field}" — a project bootstrapped with this guide would document a schema /soloship:learn does not produce`
      ).toBe(true);
    });
  }

  const everyEnumValue = [
    ...BUG_TRACK_PROBLEM_TYPES,
    ...KNOWLEDGE_TRACK_PROBLEM_TYPES,
    ...ROOT_CAUSE_ENUM,
    ...RESOLUTION_TYPE_ENUM,
  ];
  it("lists every enum value the skill accepts", () => {
    const missing = everyEnumValue.filter((value) => !guide.includes(value));
    expect(
      missing,
      `generateSolutionGuide() omits enum values ${missing.join(", ")} — a doc using them would look invalid against the shipped guide`
    ).toEqual([]);
  });

  it("presents categories as an open set, not a whitelist", () => {
    expect(
      guide.includes("open set"),
      "the guide must state that categories are an open set — a closed list here was copied verbatim into a downstream validator, which then rejected five legitimate categories"
    ).toBe(true);
  });

  it("does not ship the stale category examples", () => {
    // `performance` (no project uses it — they use performance-issues) and
    // `pdf-issues` (MAPS-specific) were in the hardcoded list this replaced.
    expect(guide).not.toMatch(/`performance`/);
    expect(guide).not.toMatch(/`pdf-issues`/);
  });
});
