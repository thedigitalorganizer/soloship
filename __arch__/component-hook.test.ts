// Duplicate-component warn hook — behavioral regression tests.
//
// Exercises the GENERATED hook script end-to-end via child_process using the
// real input contract ($HOOK_MODIFIED_FILE env var, the same contract the
// lint hook uses). This is what turns the hook's QA from a one-time manual
// check into a permanent CI guard.
//
// Contract under test (see buildComponentDupWarnScript in src/hooks.ts):
// - duplicate exported component name in another file  -> exit 2 + stderr warn
// - unique export / non-component file / non-git dir    -> exit 0, silent
// - re-exports and type-only exports never trigger      (by construction)

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildComponentDupWarnScript } from "../src/hooks";

const HOOK_CMD = buildComponentDupWarnScript();

/** Run the generated hook command exactly as Claude Code would. */
function runHook(modifiedFile: string, cwd: string) {
  const result = spawnSync("sh", ["-c", HOOK_CMD], {
    cwd,
    env: { ...process.env, HOOK_MODIFIED_FILE: modifiedFile },
    encoding: "utf8",
    timeout: 10_000,
  });
  return { status: result.status, stderr: result.stderr ?? "" };
}

let repo: string;

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "soloship-comp-hook-"));
  execSync("git init -q", { cwd: repo });
  mkdirSync(join(repo, "src", "components"), { recursive: true });
  mkdirSync(join(repo, "packages", "ui"), { recursive: true });

  // Pre-existing tracked components the hook should find collisions against.
  writeFileSync(
    join(repo, "src", "components", "EmailComposer.tsx"),
    `export function EmailComposer() { return null; }\n`
  );
  writeFileSync(
    join(repo, "src", "components", "Modal.tsx"),
    `export default class Modal {}\n`
  );
  // Monorepo-style location — the repo-wide pathspec must reach it.
  writeFileSync(
    join(repo, "packages", "ui", "Card.tsx"),
    `import { memo } from "react";\nexport const Card = memo(function Card() { return null; });\n`
  );
  execSync("git add .", { cwd: repo });
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("duplicate-component warn hook", () => {
  it("warns when a new file re-declares an existing component name", () => {
    const dup = join(repo, "src", "EmailComposer2.tsx");
    writeFileSync(dup, `export function EmailComposer() { return null; }\n`);
    const { status, stderr } = runHook(dup, repo);
    expect(status).toBe(2);
    expect(stderr).toContain("component-reuse");
    expect(stderr).toContain("EmailComposer");
    expect(stderr).toContain("src/components/EmailComposer.tsx");
  });

  it("warns on export-default-class collisions", () => {
    const dup = join(repo, "src", "Modal2.tsx");
    writeFileSync(dup, `export default class Modal {}\n`);
    const { status, stderr } = runHook(dup, repo);
    expect(status).toBe(2);
    expect(stderr).toContain("Modal");
  });

  it("warns on memo()-wrapped const collisions across monorepo packages", () => {
    const dup = join(repo, "src", "CardCopy.tsx");
    writeFileSync(
      dup,
      `import { memo } from "react";\nexport const Card = memo(() => null);\n`
    );
    const { status, stderr } = runHook(dup, repo);
    expect(status).toBe(2);
    expect(stderr).toContain("packages/ui/Card.tsx");
  });

  it("stays silent for a unique component name", () => {
    const fresh = join(repo, "src", "TotallyNewWidget.tsx");
    writeFileSync(fresh, `export function TotallyNewWidget() { return null; }\n`);
    const { status, stderr } = runHook(fresh, repo);
    expect(status).toBe(0);
    expect(stderr).toBe("");
  });

  it("does not warn when re-editing the SAME tracked file (no self-collision)", () => {
    const original = join(repo, "src", "components", "EmailComposer.tsx");
    const { status, stderr } = runHook(original, repo);
    expect(status).toBe(0);
    expect(stderr).toBe("");
  });

  it("stays silent for re-export barrel lines", () => {
    const barrel = join(repo, "src", "index.tsx");
    writeFileSync(
      barrel,
      `export { EmailComposer } from "./components/EmailComposer";\nexport * from "./components/Modal";\n`
    );
    const { status, stderr } = runHook(barrel, repo);
    expect(status).toBe(0);
    expect(stderr).toBe("");
  });

  it("stays silent for type-only exports", () => {
    const types = join(repo, "src", "EmailTypes.tsx");
    writeFileSync(types, `export type EmailComposer = { to: string };\n`);
    const { status, stderr } = runHook(types, repo);
    expect(status).toBe(0);
    expect(stderr).toBe("");
  });

  it("stays silent for non-component file extensions", () => {
    const ts = join(repo, "src", "EmailComposer.ts");
    writeFileSync(ts, `export function EmailComposer() { return null; }\n`);
    const { status, stderr } = runHook(ts, repo);
    expect(status).toBe(0);
    expect(stderr).toBe("");
  });

  it("fails safe (silent exit 0) outside a git repository", () => {
    const bare = mkdtempSync(join(tmpdir(), "soloship-no-git-"));
    try {
      const orphan = join(bare, "Widget.tsx");
      writeFileSync(orphan, `export function EmailComposer() { return null; }\n`);
      const { status, stderr } = runHook(orphan, bare);
      expect(status).toBe(0);
      expect(stderr).toBe("");
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it("fails safe with an empty HOOK_MODIFIED_FILE", () => {
    const { status, stderr } = runHook("", repo);
    expect(status).toBe(0);
    expect(stderr).toBe("");
  });
});
