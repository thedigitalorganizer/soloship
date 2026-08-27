// .codex/config.toml narrow text surgery — behavioral regression.
//
// installCodexHooks touches two things in config.toml without a TOML library
// dependency: [features] hooks = true (a table key) and the top-level
// project_doc_max_bytes = 131072 (Phase 2 step 3 — Codex's 32 KiB default
// truncates AGENTS.md once it carries the safety gates). Both must be
// idempotent and must never disturb content Soloship didn't write.

import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installCodexHooks, CODEX_PROJECT_DOC_MAX_BYTES } from "../src/hooks";

function makeRepo(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "soloship-codex-toml-")));
  execSync("git init -q -b main", { cwd: dir });
  execSync('git config user.email "test@example.com"', { cwd: dir });
  execSync('git config user.name "Test"', { cwd: dir });
  execSync("git commit -q --allow-empty -m base", { cwd: dir });
  return dir;
}

const project = {} as any;

describe(".codex/config.toml", () => {
  it("creates both keys from nothing", async () => {
    const dir = makeRepo();
    try {
      await installCodexHooks(dir, project);
      const toml = readFileSync(join(dir, ".codex", "config.toml"), "utf8");
      expect(toml).toMatch(/^project_doc_max_bytes = 131072$/m);
      expect(toml).toMatch(/^\[features\]$/m);
      expect(toml).toMatch(/^hooks = true$/m);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is idempotent across repeated runs — no duplicate keys or tables", async () => {
    const dir = makeRepo();
    try {
      await installCodexHooks(dir, project);
      await installCodexHooks(dir, project);
      await installCodexHooks(dir, project);
      const toml = readFileSync(join(dir, ".codex", "config.toml"), "utf8");
      expect(toml.match(/project_doc_max_bytes/g)?.length).toBe(1);
      expect(toml.match(/\[features\]/g)?.length).toBe(1);
      expect(toml.match(/hooks = true/g)?.length).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("preserves unrelated top-level keys, tables, and a foreign [features] key", async () => {
    const dir = makeRepo();
    try {
      mkdirSync(join(dir, ".codex"), { recursive: true });
      writeFileSync(
        join(dir, ".codex", "config.toml"),
        [
          'model = "gpt-5"',
          'approval_policy = "on-request"',
          "",
          "[mcp_servers.stripe]",
          'command = "stripe-mcp"',
          "",
          "[features]",
          "some_other_flag = true",
          "",
        ].join("\n")
      );

      await installCodexHooks(dir, project);
      const toml = readFileSync(join(dir, ".codex", "config.toml"), "utf8");

      expect(toml).toContain('model = "gpt-5"');
      expect(toml).toContain('approval_policy = "on-request"');
      expect(toml).toContain("[mcp_servers.stripe]");
      expect(toml).toContain('command = "stripe-mcp"');
      expect(toml).toContain("some_other_flag = true");
      expect(toml).toMatch(/^\[features\]$/m);
      expect(toml).toMatch(/^hooks = true$/m);
      expect(toml).toMatch(/^project_doc_max_bytes = 131072$/m);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("never lowers a user-set project_doc_max_bytes that is already >= the Soloship floor", async () => {
    const dir = makeRepo();
    try {
      mkdirSync(join(dir, ".codex"), { recursive: true });
      const higher = CODEX_PROJECT_DOC_MAX_BYTES * 2;
      writeFileSync(join(dir, ".codex", "config.toml"), `project_doc_max_bytes = ${higher}\n`);

      await installCodexHooks(dir, project);
      const toml = readFileSync(join(dir, ".codex", "config.toml"), "utf8");

      expect(toml).toMatch(new RegExp(`^project_doc_max_bytes = ${higher}$`, "m"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
