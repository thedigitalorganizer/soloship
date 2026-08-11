// Deploy-lock release pair (SessionEnd + Stop) — behavioral regression tests.
//
// Exercises the GENERATED hook scripts end-to-end via child_process with the
// real input contract (session JSON on STDIN, the same contract the browser
// release script uses). Both hooks are fail-safe (exit 0 on any internal
// error), so must-fire positives carry the weight.
//
// The load-bearing difference from the browser-claim scripts: a browser claim
// is one FILE PER SESSION, so `rm $SID.json` is inherently owner-scoped.
// deploy.lock is ONE SHARED FILE — both scripts must parse session_id out of
// the lock and act only when it matches this session. Removing (or nagging
// about) another session's lock would break an in-flight deploy, which is the
// exact failure the lock exists to prevent. The "other session's lock
// survives" fixtures below are what hold that invariant.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildDeployLockReleaseScript,
  buildDeployLockReminderScript,
  DEPLOY_LOCK_REMIND_MIN,
} from "../src/hooks";

const RELEASE_CMD = buildDeployLockReleaseScript();
const REMINDER_CMD = buildDeployLockReminderScript();

const OWN_SID = "session-owner-abc";
const OTHER_SID = "session-other-xyz";

let repo: string;
let lockPath: string;

/** Run a generated hook exactly as Claude Code would: session JSON on stdin. */
function runHook(cmd: string, sid: string) {
  const result = spawnSync("sh", ["-c", cmd], {
    cwd: repo,
    input: JSON.stringify({ session_id: sid }),
    encoding: "utf8",
    timeout: 10_000,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/** Write a deploy.lock owned by `sid`; `ageMin` backdates its mtime. */
function writeLock(sid: string, ageMin = 0) {
  writeFileSync(
    lockPath,
    JSON.stringify({
      session_id: sid,
      target: "production",
      acquired_at: "2026-08-11T00:00:00Z",
    }) + "\n"
  );
  if (ageMin > 0) {
    // touch -d/-t rather than sleeping: the reminder reads mtime age.
    const when = new Date(Date.now() - ageMin * 60_000);
    const stamp =
      `${when.getFullYear()}` +
      `${String(when.getMonth() + 1).padStart(2, "0")}` +
      `${String(when.getDate()).padStart(2, "0")}` +
      `${String(when.getHours()).padStart(2, "0")}` +
      `${String(when.getMinutes()).padStart(2, "0")}`;
    execSync(`touch -t ${stamp} "${lockPath}"`);
  }
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "soloship-deploylock-"));
  execSync("git init -q", { cwd: repo });
  mkdirSync(join(repo, ".git", "soloship"), { recursive: true });
  lockPath = join(repo, ".git", "soloship", "deploy.lock");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("deploy lock release (SessionEnd)", () => {
  it("MUST FIRE: releases a lock this session owns", () => {
    writeLock(OWN_SID);
    const { status } = runHook(RELEASE_CMD, OWN_SID);
    expect(status).toBe(0);
    expect(existsSync(lockPath)).toBe(false);
  });

  it("NEVER breaks another session's lock (the in-flight-deploy invariant)", () => {
    writeLock(OTHER_SID);
    const { status } = runHook(RELEASE_CMD, OWN_SID);
    expect(status).toBe(0);
    expect(existsSync(lockPath)).toBe(true);
  });

  it("is a no-op when no lock exists", () => {
    const { status, stdout } = runHook(RELEASE_CMD, OWN_SID);
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("fails safe (silent exit 0) outside a git repository", () => {
    const bare = mkdtempSync(join(tmpdir(), "soloship-deploylock-nogit-"));
    try {
      const result = spawnSync("sh", ["-c", RELEASE_CMD], {
        cwd: bare,
        input: JSON.stringify({ session_id: OWN_SID }),
        encoding: "utf8",
        timeout: 10_000,
      });
      expect(result.status).toBe(0);
      expect(result.stdout ?? "").toBe("");
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});

describe("deploy lock reminder (Stop)", () => {
  it("MUST FIRE: nags when this session's own lock has gone quiet", () => {
    writeLock(OWN_SID, DEPLOY_LOCK_REMIND_MIN + 5);
    const { status, stdout } = runHook(REMINDER_CMD, OWN_SID);
    expect(status).toBe(0); // reminder only, never blocks
    expect(stdout).toContain("systemMessage");
    expect(stdout).toContain("deploy lock");
    expect(stdout).toContain("deploy.lock"); // the exact release path
  });

  it("stays silent for a FRESH lock (an in-flight deploy is never nagged)", () => {
    writeLock(OWN_SID, 0);
    const { status, stdout } = runHook(REMINDER_CMD, OWN_SID);
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("stays silent about another session's quiet lock (not ours to report)", () => {
    writeLock(OTHER_SID, DEPLOY_LOCK_REMIND_MIN + 5);
    const { status, stdout } = runHook(REMINDER_CMD, OWN_SID);
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("stays silent when no lock exists", () => {
    const { status, stdout } = runHook(REMINDER_CMD, OWN_SID);
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("reports the lock age in the reminder", () => {
    writeLock(OWN_SID, DEPLOY_LOCK_REMIND_MIN + 20);
    const { stdout } = runHook(REMINDER_CMD, OWN_SID);
    // Age must be a real computed number, not an empty expansion (the
    // multibyte-adjacent-to-$VAR class renders these blank).
    expect(stdout).toMatch(/untouched for \d+ min/);
  });
});
