// Delegation-discipline and verification-sufficiency ship as skill-wired
// references (skills/references/<name>.md, enforced by concerns.test.ts).
// They used to also install as always-on project rules; that duplicated
// ~2k tokens on every task. This test keeps them skill-owned: the reference
// must exist, and getWorkflowRules() must not re-install them.

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getWorkflowRules } from "../src/rules";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REFERENCES_DIR = join(ROOT, "skills", "references");

const SKILL_OWNED_CONCERNS = [
  "delegation-discipline",
  "verification-sufficiency",
];

describe("skill-owned concerns stay out of the always-on installer", () => {
  const rules = getWorkflowRules();

  for (const concern of SKILL_OWNED_CONCERNS) {
    describe(`concern: ${concern}`, () => {
      it("has a skill reference", () => {
        expect(
          existsSync(join(REFERENCES_DIR, `${concern}.md`)),
          `skills/references/${concern}.md is missing`
        ).toBe(true);
      });

      it("is not an always-on installer rule", () => {
        expect(
          rules[`${concern}.md`],
          `src/rules.ts still ships "${concern}.md" — this concern is skill-owned, not always-on`
        ).toBeUndefined();
      });
    });
  }
});
