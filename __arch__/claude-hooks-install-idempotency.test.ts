// installHooks (Claude) own-and-merge idempotency — behavioral regression.
//
// Per src/AGENTS.md's own-and-merge pitfall: installHooks must replace only
// its own previously-installed entries (marked _soloshipManaged, or
// fingerprinted as a pre-marker legacy Soloship hook) and never touch a
// user's foreign hooks. This matters more than usual for the 2026-08-27
// committed-gate migration specifically: a project upgrading from the
// bash-era gates to the new `node ".../<gate>.cjs"` commands must end up with
// ONLY the new shape — not both, which would run every gate's logic twice
// and mean upgrade never actually retires the old bash strings.

import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installHooks } from "../src/hooks";
import type { ProjectInfo } from "../src/detect";

function makeRepo(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "soloship-claude-idem-")));
  execSync("git init -q -b main", { cwd: dir });
  execSync('git config user.email "test@example.com"', { cwd: dir });
  execSync('git config user.name "Test"', { cwd: dir });
  execSync("git commit -q --allow-empty -m base", { cwd: dir });
  return dir;
}

const project = {} as ProjectInfo;

function preToolUseCommands(settingsPath: string): string[] {
  const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  const entries = settings.hooks?.PreToolUse || [];
  return entries.flatMap((e: any) => e.hooks.map((h: any) => h.command));
}

describe("installHooks own-and-merge idempotency", () => {
  it("replaces old bash-era Soloship gates with the new node-based ones, never duplicating, and preserves a foreign user hook", async () => {
    const dir = makeRepo();
    try {
      const claudeDir = join(dir, ".claude");
      execSync(`mkdir -p ${claudeDir}`);
      const settingsPath = join(claudeDir, "settings.local.json");

      // Seed with an OLD bash-era billing gate (pre-2026-08-27 shape, the
      // exact fingerprint LEGACY_SOLOSHIP_HOOK_RE is built to catch) plus one
      // genuinely foreign user hook that must never be touched.
      const seeded = {
        hooks: {
          PreToolUse: [
            {
              matcher: "Edit|Write|MultiEdit|NotebookEdit",
              hooks: [
                {
                  type: "command",
                  command: `bash -c 'TI="$HOOK_TOOL_INPUT"; echo "BLOCKED by billing-confirmation-gate: this edit touches billing"; exit 2'`,
                  timeout: 5000,
                },
              ],
            },
            {
              matcher: "Bash",
              hooks: [
                {
                  type: "command",
                  command: `bash -c 'echo "my own custom pre-commit lint" && exit 0'`,
                  timeout: 5000,
                },
              ],
            },
          ],
        },
      };
      writeFileSync(settingsPath, JSON.stringify(seeded, null, 2));

      // Run 1: should replace the legacy billing entry, keep the foreign hook.
      await installHooks(dir, project);
      const after1 = preToolUseCommands(settingsPath);
      expect(after1.some((c) => c.includes("my own custom pre-commit lint"))).toBe(true);
      expect(after1.some((c) => c.includes("$HOOK_TOOL_INPUT"))).toBe(false);
      const billingCount1 = after1.filter((c) => c.includes("billing-confirmation.cjs")).length;
      expect(billingCount1).toBe(1);

      // Run 2 and 3: re-running must not duplicate the new entries, and the
      // foreign hook must still survive every pass.
      await installHooks(dir, project);
      await installHooks(dir, project);
      const after3 = preToolUseCommands(settingsPath);
      expect(after3.filter((c) => c.includes("my own custom pre-commit lint")).length).toBe(1);
      expect(after3.filter((c) => c.includes("billing-confirmation.cjs")).length).toBe(1);
      expect(after3.filter((c) => c.includes("command-safety.cjs")).length).toBe(1);
      expect(after3.filter((c) => c.includes("recurrence.cjs")).length).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
