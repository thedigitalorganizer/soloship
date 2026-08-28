// Phase 4 of docs/plans/2026-08-27-one-source-of-truth-across-agent-hosts.md:
// .agents/skills/ is canonical, .claude/skills/ is symlinked to it.

import { describe, it, expect } from "vitest";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { syncSkillsCanonical } from "../src/skills-sync";

function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), "soloship-skills-sync-"));
}

describe("syncSkillsCanonical", () => {
  it("no-ops when neither directory exists", () => {
    const root = tmpRoot();
    try {
      expect(syncSkillsCanonical(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("moves a real .claude/skills/<name>/ with SKILL.md to .agents/skills/<name>/ and symlinks it back", () => {
    const root = tmpRoot();
    try {
      const claudeSkill = join(root, ".claude", "skills", "foo");
      mkdirSync(claudeSkill, { recursive: true });
      writeFileSync(join(claudeSkill, "SKILL.md"), "# Foo\n");
      writeFileSync(join(claudeSkill, "helper.sh"), "echo hi\n");

      const results = syncSkillsCanonical(root);

      const agentsSkill = join(root, ".agents", "skills", "foo");
      expect(existsSync(join(agentsSkill, "SKILL.md"))).toBe(true);
      expect(existsSync(join(agentsSkill, "helper.sh"))).toBe(true);
      expect(lstatSync(claudeSkill).isSymbolicLink()).toBe(true);
      expect(existsSync(join(claudeSkill, "SKILL.md"))).toBe(true); // resolves through the symlink
      expect(results.join("\n")).toContain("foo: moved to .agents/skills/foo, symlinked from .claude/skills/foo");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("adds a missing .claude/skills/<name> symlink for a skill already canonical under .agents/skills/", () => {
    const root = tmpRoot();
    try {
      const agentsSkill = join(root, ".agents", "skills", "baz");
      mkdirSync(agentsSkill, { recursive: true });
      writeFileSync(join(agentsSkill, "SKILL.md"), "# Baz\n");

      const results = syncSkillsCanonical(root);

      const claudeSkill = join(root, ".claude", "skills", "baz");
      expect(lstatSync(claudeSkill).isSymbolicLink()).toBe(true);
      expect(existsSync(join(claudeSkill, "SKILL.md"))).toBe(true);
      expect(results.join("\n")).toContain("baz: added missing .claude/skills/baz symlink");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reverses a symlink pointing the old direction (.agents/skills/x -> .claude/skills/x)", () => {
    const root = tmpRoot();
    try {
      const claudeSkill = join(root, ".claude", "skills", "bar");
      mkdirSync(claudeSkill, { recursive: true });
      writeFileSync(join(claudeSkill, "SKILL.md"), "# Bar\n");
      mkdirSync(join(root, ".agents", "skills"), { recursive: true });
      symlinkSync(join("..", "..", ".claude", "skills", "bar"), join(root, ".agents", "skills", "bar"), "dir");

      const results = syncSkillsCanonical(root);

      const agentsSkill = join(root, ".agents", "skills", "bar");
      expect(lstatSync(agentsSkill).isDirectory()).toBe(true);
      expect(lstatSync(agentsSkill).isSymbolicLink()).toBe(false);
      expect(existsSync(join(agentsSkill, "SKILL.md"))).toBe(true);
      expect(lstatSync(claudeSkill).isSymbolicLink()).toBe(true);
      expect(results.join("\n")).toContain("bar: reversed symlink direction");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("CONFLICT: real directories on both sides — reports, touches neither", () => {
    const root = tmpRoot();
    try {
      const claudeSkill = join(root, ".claude", "skills", "conflict");
      mkdirSync(claudeSkill, { recursive: true });
      writeFileSync(join(claudeSkill, "SKILL.md"), "# claude version\n");
      const agentsSkill = join(root, ".agents", "skills", "conflict");
      mkdirSync(agentsSkill, { recursive: true });
      writeFileSync(join(agentsSkill, "SKILL.md"), "# agents version\n");

      const results = syncSkillsCanonical(root);

      expect(lstatSync(claudeSkill).isSymbolicLink()).toBe(false);
      expect(lstatSync(agentsSkill).isSymbolicLink()).toBe(false);
      expect(results.join("\n")).toContain("CONFLICT");
      expect(results.join("\n")).toContain("conflict");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports loose .md files in .claude/skills/ without moving them", () => {
    const root = tmpRoot();
    try {
      mkdirSync(join(root, ".claude", "skills"), { recursive: true });
      writeFileSync(join(root, ".claude", "skills", "notes.md"), "# just a note\n");

      const results = syncSkillsCanonical(root);

      expect(existsSync(join(root, ".claude", "skills", "notes.md"))).toBe(true);
      expect(results.join("\n")).toContain("loose .md file");
      expect(results.join("\n")).toContain("notes.md");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("ignores a directory without SKILL.md (not a skill folder)", () => {
    const root = tmpRoot();
    try {
      const notASkill = join(root, ".claude", "skills", "scratch");
      mkdirSync(notASkill, { recursive: true });
      writeFileSync(join(notASkill, "README.md"), "not a skill\n");

      const results = syncSkillsCanonical(root);

      expect(existsSync(join(root, ".agents", "skills", "scratch"))).toBe(false);
      expect(lstatSync(notASkill).isDirectory()).toBe(true);
      expect(lstatSync(notASkill).isSymbolicLink()).toBe(false);
      expect(results.join("\n")).not.toContain("scratch");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("is idempotent — a second run over already-canonical state changes nothing", () => {
    const root = tmpRoot();
    try {
      const claudeSkill = join(root, ".claude", "skills", "foo");
      mkdirSync(claudeSkill, { recursive: true });
      writeFileSync(join(claudeSkill, "SKILL.md"), "# Foo\n");

      syncSkillsCanonical(root);
      const secondRun = syncSkillsCanonical(root);

      expect(secondRun).toEqual([]);
      expect(lstatSync(join(root, ".claude", "skills", "foo")).isSymbolicLink()).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
