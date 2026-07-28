// Installer-rule ↔ concern-reference sync fitness test.
//
// Two cross-cutting concerns (delegation-discipline, verification-sufficiency)
// ship twice: as skill-wired references (skills/references/<name>.md, enforced
// by concerns.test.ts) and as installer rules (src/rules.ts → a user project's
// .claude/rules/<name>.md). The reference is the single source of truth; this
// test keeps the installed rule from drifting away from it.
//
// The asserted phrases are EXTRACTED from the reference file (and concerns.json)
// at test time — no duplicated string literals — so a wording change in the
// reference that is not mirrored into the rule turns this red.
//
// Per concern, the rule must contain (whitespace-normalized):
//   1. The concern's canonical key phrase from concerns.json.
//   2. The bolded contract sentence from the reference's "## The contract".
//   3. The counter-pressure section's heading phrase — the load-bearing
//      "capping is never skipping" guard the rules must carry.
//
// Deliberately observable-to-fail: extraction throws on a missing section
// instead of skipping, so a restructured reference can't silently pass.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getWorkflowRules } from "../src/rules";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REFERENCES_DIR = join(ROOT, "skills", "references");
const MANIFEST_PATH = join(REFERENCES_DIR, "concerns.json");

/** The concerns that ship both as a skill reference and an installer rule. */
const SYNCED_CONCERNS = ["delegation-discipline", "verification-sufficiency"];

/** Collapse all whitespace so line-wrap differences never mask real drift. */
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

function referenceFor(concern: string): string {
  return readFileSync(join(REFERENCES_DIR, `${concern}.md`), "utf8");
}

/** The first bolded sentence of the reference's "## The contract" section. */
function contractSentence(concern: string, reference: string): string {
  const section = reference.split(/^## The contract$/m)[1];
  if (!section) {
    throw new Error(
      `skills/references/${concern}.md has no "## The contract" section`
    );
  }
  const bold = section.match(/\*\*([\s\S]+?)\*\*/);
  if (!bold) {
    throw new Error(
      `skills/references/${concern}.md "## The contract" has no bolded sentence`
    );
  }
  return bold[1];
}

/** The heading phrase of the reference's "(counter-pressure)" section. */
function counterPressureHeading(concern: string, reference: string): string {
  const match = reference.match(/^## (.+?) \(counter-pressure\)$/m);
  if (!match) {
    throw new Error(
      `skills/references/${concern}.md has no counter-pressure section`
    );
  }
  return match[1];
}

/** The concern's canonical key phrase, read from concerns.json. */
function keyPhraseFromManifest(concern: string): string {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const phrase = manifest[concern]?.keyPhrase;
  if (!phrase) {
    throw new Error(`concerns.json has no keyPhrase for ${concern}`);
  }
  return phrase;
}

describe("installer rules stay in sync with concern references", () => {
  const rules = getWorkflowRules();

  for (const concern of SYNCED_CONCERNS) {
    describe(`concern: ${concern}`, () => {
      it("ships as an installer rule", () => {
        expect(
          rules[`${concern}.md`],
          `src/rules.ts registers no "${concern}.md" — the concern reference exists but user projects never receive the rule`
        ).toBeTruthy();
      });

      it("rule carries the reference's key phrases (wording-drift guard)", () => {
        const reference = referenceFor(concern);
        const rule = normalize(rules[`${concern}.md`]);
        const phrases = [
          keyPhraseFromManifest(concern),
          contractSentence(concern, reference),
          counterPressureHeading(concern, reference),
        ];
        for (const phrase of phrases) {
          expect(
            rule.includes(normalize(phrase)),
            `rules.ts "${concern}.md" is missing the reference phrase "${normalize(
              phrase
            )}" — skills/references/${concern}.md changed (or the rule drifted); mirror the wording in src/rules.ts in the same commit`
          ).toBe(true);
        }
      });
    });
  }
});
