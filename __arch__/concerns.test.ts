// Cross-cutting concern registry fitness test.
//
// Soloship wires "concerns" (e.g. component-reuse) into many skills as marker
// comments + a canonical pointer. This test is what keeps that wiring alive:
// a vendored-skill refresh that wipes a touchpoint, or a touchpoint added
// without registering it, turns this red. See
// skills/references/component-inventory.md ("Touchpoint update protocol").
//
// Checks, per concern in skills/references/concerns.json:
//   1. The concern's reference file exists (no dead pointers).
//   2. Every listed skill's SKILL.md contains the marker.
//   3. Every SKILL.md containing the marker is listed (no unregistered wiring).
//   4. Near each marker, the canonical key phrase appears (wording-drift guard).
//
// Deliberately observable-to-fail: no try/catch swallowing, no conditional
// skips. If the manifest is missing or malformed, the test throws.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_DIR = join(ROOT, "skills");
const MANIFEST_PATH = join(SKILLS_DIR, "references", "concerns.json");

// How many lines after a marker the canonical key phrase must appear within.
// The canonical pointer template puts it on the very next line; 3 leaves room
// for a blank line or list bullet without letting the wording drift far.
const KEY_PHRASE_WINDOW_LINES = 3;

interface Concern {
  reference: string;
  marker: string;
  keyPhrase: string;
  skills: string[];
}

function loadConcerns(): Record<string, Concern> {
  const raw = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const concerns: Record<string, Concern> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (name.startsWith("_")) continue; // _comment and friends
    concerns[name] = value as Concern;
  }
  return concerns;
}

/** Every skills/<name>/SKILL.md, excluding the references/ and vendored/ dirs. */
function allSkillFiles(): { skill: string; path: string }[] {
  return readdirSync(SKILLS_DIR)
    .filter((entry) => {
      const full = join(SKILLS_DIR, entry);
      return (
        statSync(full).isDirectory() &&
        entry !== "references" &&
        entry !== "vendored" &&
        existsSync(join(full, "SKILL.md"))
      );
    })
    .map((skill) => ({ skill, path: join(SKILLS_DIR, skill, "SKILL.md") }));
}

function markerLineNumbers(content: string, marker: string): number[] {
  const lines = content.split("\n");
  const hits: number[] = [];
  lines.forEach((line, i) => {
    if (line.includes(marker)) hits.push(i);
  });
  return hits;
}

describe("cross-cutting concern registry", () => {
  const concerns = loadConcerns();

  it("manifest defines at least one concern with required fields", () => {
    expect(Object.keys(concerns).length).toBeGreaterThan(0);
    for (const [name, c] of Object.entries(concerns)) {
      expect(c.reference, `${name}: reference missing`).toBeTruthy();
      expect(c.marker, `${name}: marker missing`).toBeTruthy();
      expect(c.keyPhrase, `${name}: keyPhrase missing`).toBeTruthy();
      expect(Array.isArray(c.skills), `${name}: skills must be an array`).toBe(
        true
      );
    }
  });

  for (const [name, concern] of Object.entries(loadConcerns())) {
    describe(`concern: ${name}`, () => {
      it("reference file exists", () => {
        expect(
          existsSync(join(SKILLS_DIR, concern.reference)),
          `dead reference: skills/${concern.reference}`
        ).toBe(true);
      });

      it("every listed skill carries the marker", () => {
        for (const skill of concern.skills) {
          const path = join(SKILLS_DIR, skill, "SKILL.md");
          expect(existsSync(path), `listed skill missing: ${skill}`).toBe(true);
          const content = readFileSync(path, "utf8");
          expect(
            content.includes(concern.marker),
            `skills/${skill}/SKILL.md is listed for "${name}" but carries no <!-- ${concern.marker} --> marker — a refresh or edit dropped the touchpoint; re-apply the canonical template from skills/${concern.reference}`
          ).toBe(true);
        }
      });

      it("every skill carrying the marker is listed (no unregistered wiring)", () => {
        const listed = new Set(concern.skills);
        for (const { skill, path } of allSkillFiles()) {
          const content = readFileSync(path, "utf8");
          if (content.includes(concern.marker)) {
            expect(
              listed.has(skill),
              `skills/${skill}/SKILL.md carries the "${name}" marker but is not listed in concerns.json — register the touchpoint in the same commit that added it`
            ).toBe(true);
          }
        }
      });

      it("canonical key phrase appears near each marker (wording-drift guard)", () => {
        for (const skill of concern.skills) {
          const path = join(SKILLS_DIR, skill, "SKILL.md");
          const content = readFileSync(path, "utf8");
          const lines = content.split("\n");
          for (const lineNo of markerLineNumbers(content, concern.marker)) {
            const window = lines
              .slice(lineNo + 1, lineNo + 1 + KEY_PHRASE_WINDOW_LINES)
              .join("\n");
            expect(
              window.includes(concern.keyPhrase),
              `skills/${skill}/SKILL.md line ${lineNo + 1}: marker present but the canonical key phrase "${concern.keyPhrase}" is not within ${KEY_PHRASE_WINDOW_LINES} lines — wording drifted; re-paste the template from skills/${concern.reference}`
            ).toBe(true);
          }
        }
      });
    });
  }
});
