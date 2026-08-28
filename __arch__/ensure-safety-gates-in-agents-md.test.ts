// Fs-level counterpart to ensure-safety-gates-section.test.ts (the pure
// string transform). This exercises the actual disk-touching wrapper wired
// into both `init` and `upgrade` — see src/templates.ts.

import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ensureSafetyGatesInAgentsMd } from "../src/templates";
import { SAFETY_GATES_MARKER_START } from "../src/safety-gates";
import type { ProjectInfo } from "../src/detect";

function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), "soloship-ensure-safety-gates-"));
}

const PROJECT: ProjectInfo = {
  name: "test-project",
  description: "a test project",
  stack: {
    language: "typescript",
    framework: null,
    packageManager: "npm",
    hasTests: false,
    hasCi: false,
    hasLinter: false,
    hasFormatter: false,
  },
  hasGit: true,
  hasClaude: false,
  hasCodex: false,
  hasAntigravity: false,
  hasCursor: false,
  existingDocs: {
    hasClaudeMd: false,
    hasAgentsMd: false,
    hasChangelog: false,
    hasReadme: false,
    hasDocsDir: false,
    hasPlansDir: false,
    hasSolutionsDir: false,
  },
};

describe("ensureSafetyGatesInAgentsMd", () => {
  it("creates a full AGENTS.md when none exists", () => {
    const root = tmpRoot();
    try {
      const result = ensureSafetyGatesInAgentsMd(root, PROJECT);
      expect(result.action).toBe("created");
      const content = readFileSync(join(root, "AGENTS.md"), "utf-8");
      expect(content).toContain(SAFETY_GATES_MARKER_START);
      expect(content).toContain("test-project");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("updates an existing AGENTS.md that predates the section, preserving user content", () => {
    const root = tmpRoot();
    try {
      writeFileSync(join(root, "AGENTS.md"), "# Existing Project\n\nHand-written notes.\n");
      const result = ensureSafetyGatesInAgentsMd(root, PROJECT);
      expect(result.action).toBe("updated");
      const content = readFileSync(join(root, "AGENTS.md"), "utf-8");
      expect(content).toContain("Hand-written notes.");
      expect(content).toContain(SAFETY_GATES_MARKER_START);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports unchanged on a second run against already-current content", () => {
    const root = tmpRoot();
    try {
      ensureSafetyGatesInAgentsMd(root, PROJECT);
      const second = ensureSafetyGatesInAgentsMd(root, PROJECT);
      expect(second.action).toBe("unchanged");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not create AGENTS.md when it exists but is already current (no needless write)", () => {
    const root = tmpRoot();
    try {
      ensureSafetyGatesInAgentsMd(root, PROJECT);
      const before = readFileSync(join(root, "AGENTS.md"), "utf-8");
      ensureSafetyGatesInAgentsMd(root, PROJECT);
      const after = readFileSync(join(root, "AGENTS.md"), "utf-8");
      expect(after).toBe(before);
      expect(existsSync(join(root, "AGENTS.md"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
