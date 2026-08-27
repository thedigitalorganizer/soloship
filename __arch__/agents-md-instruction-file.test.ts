// Phase 3 of docs/plans/2026-08-27-one-source-of-truth-across-agent-hosts.md:
// AGENTS.md is the instruction file; CLAUDE.md is an `@AGENTS.md` import.
// Behavioral checks on the generated template output (string-level — the
// import itself is expanded by Claude Code at session start, not by this
// generator; that mechanism is Anthropic's, verified live against
// code.claude.com/docs/en/memory).

import { describe, it, expect } from "vitest";
import { generateAgentsMd, generateClaudeMd } from "../src/templates";
import { SAFETY_GATE_FILENAMES, getSafetyGateRules } from "../src/safety-gates";
import type { ProjectInfo } from "../src/detect";

const stub: ProjectInfo = {
  name: "stub-project",
  description: "A test project",
  stack: {
    language: "typescript",
    framework: "express",
    packageManager: "npm",
    hasTests: true,
    hasCi: true,
    hasLinter: false,
    hasFormatter: false,
  },
  hasGit: true,
  hasClaude: true,
  hasCodex: true,
  hasAntigravity: true,
  hasCursor: true,
  existingDocs: {
    hasClaudeMd: false,
    hasAgentsMd: false,
    hasChangelog: false,
    hasReadme: true,
    hasDocsDir: true,
    hasPlansDir: true,
    hasSolutionsDir: true,
  },
};

describe("generateClaudeMd", () => {
  const claude = generateClaudeMd(stub);

  it("starts with the @AGENTS.md import — the exact shape Claude Code's docs show", () => {
    expect(claude.startsWith("@AGENTS.md\n")).toBe(true);
  });

  it("carries a short Claude-only appendix, not a full duplicate instruction set", () => {
    // Genuinely Claude-specific mechanics only.
    expect(claude).toContain(".claude/settings.local.json");
    // Must NOT re-embed the imported content — that would defeat the point
    // of importing (two copies to keep in sync again).
    expect(claude).not.toContain("## Related Documentation");
    expect(claude).not.toContain("## Safety gates");
    expect(claude.length).toBeLessThan(1000);
  });
});

describe("generateAgentsMd", () => {
  const agents = generateAgentsMd(stub);

  it("is the fat instruction file — carries what CLAUDE.md used to", () => {
    expect(agents).toContain("## Related Documentation");
    expect(agents).toContain("## Project Structure");
    expect(agents).toContain("## Quick Commands");
    expect(agents).toContain("## Cross-Cutting Contracts");
    expect(agents).toContain("## Global Invariants");
    expect(agents).toContain("Audience note");
  });

  it("drops the root-level Scope/Owns/Key-Files schema (nested AGENTS.md keeps it)", () => {
    expect(agents).not.toMatch(/^## Scope$/m);
    expect(agents).not.toMatch(/^## Owns$/m);
    expect(agents).not.toMatch(/^## Key Files$/m);
  });

  it("contains every safety-gate rule's title, verbatim rule text, and section header", () => {
    expect(agents).toContain("## Safety gates");
    const rules = getSafetyGateRules();
    for (const filename of SAFETY_GATE_FILENAMES) {
      const body = rules[filename];
      const title = body.match(/^#\s+(.+?)(\s*\(Auto-Loaded[^)]*\))?\s*$/m)?.[1];
      expect(title, `no title parsed from ${filename}`).toBeTruthy();
      expect(agents).toContain(`### ${title}`);
    }
    // Spot-check actual rule content survived the transform, not just titles.
    expect(agents).toContain(".ai/.billing-ack");
    expect(agents).toContain(".ai/learnings.jsonl");
  });

  it("names what each host reads, and is explicit that Claude Code does not read this file directly", () => {
    expect(agents).toContain("## Agent Surfaces");
    expect(agents).toMatch(/Claude Code[^\n]*does not read this file directly/i);
    expect(agents).toContain("Cursor");
    expect(agents).toContain("Codex");
    expect(agents).toContain("Antigravity");
  });

  it("does not falsely claim Codex reads .codex/rules/ (the Phase 6 bug this plan documents)", () => {
    expect(agents).not.toMatch(/Codex[^\n]*\.codex\/rules/);
  });
});
