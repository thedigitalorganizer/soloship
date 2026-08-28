// Phase 3 of docs/plans/2026-08-27-one-source-of-truth-across-agent-hosts.md:
// upgrade detects an old fat CLAUDE.md and nudges toward /soloship:bootstrap
// rather than migrating it itself (that's judgment work). Behavioral check
// on the detector `runUpgrade` uses to decide whether to print the nudge.

import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { hasOldShapeClaudeMd } from "../src/upgrade";

function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), "soloship-old-claude-md-"));
}

describe("hasOldShapeClaudeMd", () => {
  it("false when CLAUDE.md doesn't exist", () => {
    const root = tmpRoot();
    try {
      expect(hasOldShapeClaudeMd(root)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("false for the new @AGENTS.md import shape, regardless of appendix length", () => {
    const root = tmpRoot();
    try {
      const longAppendix = "@AGENTS.md\n\n## Claude Code\n\n" + "x".repeat(2000);
      writeFileSync(join(root, "CLAUDE.md"), longAppendix);
      expect(hasOldShapeClaudeMd(root)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("false for a small pre-migration file (below the size threshold)", () => {
    const root = tmpRoot();
    try {
      writeFileSync(join(root, "CLAUDE.md"), "# CLAUDE.md\n\nShort.\n");
      expect(hasOldShapeClaudeMd(root)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("true for a large CLAUDE.md that does not start with @AGENTS.md", () => {
    const root = tmpRoot();
    try {
      const fat = "# CLAUDE.md — AI Assistant Guide\n\n" + "Old fat content. ".repeat(100);
      writeFileSync(join(root, "CLAUDE.md"), fat);
      expect(hasOldShapeClaudeMd(root)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("false when @AGENTS.md is preceded by leading whitespace but still the effective first content", () => {
    const root = tmpRoot();
    try {
      const content = "\n\n@AGENTS.md\n\n## Claude Code\n\n" + "x".repeat(2000);
      writeFileSync(join(root, "CLAUDE.md"), content);
      expect(hasOldShapeClaudeMd(root)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
