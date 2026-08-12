// Gauntlet blinding and safety — the two controls that cannot be allowed to
// degrade silently.
//
// A leaked model name turns every judged number into a measurement of the
// judge's priors, and a mergeable arm branch turns an evaluation into an
// unsupervised deploy. Both are invisible at runtime, so they are pinned here.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  assignCodenames,
  buildPathspecs,
  codenameFor,
  residualLeaks,
  scrubIdentity,
  shuffleForReviewer,
  CODENAME_POOL,
  REDACTION,
} from "../src/gauntlet/anonymize";
import { assertSafeArmBranch, PROTECTED_BRANCHES } from "../src/gauntlet/workspace";
import {
  buildConfig,
  configWarnings,
  expandArms,
  slugify,
  validateConfig,
} from "../src/gauntlet/config";
import { buildArgs, fillPlaceholders, extractLastJsonObject, parseClaudeTelemetry } from "../src/gauntlet/adapters";
import { BUILTIN_ADAPTERS } from "../src/gauntlet/config";
import { buildPairSchedule, weightRubric } from "../src/gauntlet/review";
import { countTapAssertions, parseAcceptanceOutput } from "../src/gauntlet/score";
import { buildPrompt, AUTONOMY_CLAUSE, HARNESS_PREAMBLE } from "../src/gauntlet/run";

const GAUNTLET_SRC = join(__dirname, "..", "src", "gauntlet");

/** Comments and prose explain what the code must NOT do, so they would
 *  otherwise trip the very guards they document. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("identity scrubbing", () => {
  it("removes every vendor and model name from a diff", () => {
    const diff = [
      "+// Generated with Claude Opus 5 by Anthropic",
      "+// fallback path uses GPT-4 via the OpenAI codex CLI",
      "+// cross-checked against Grok from xAI and Gemini",
    ].join("\n");
    const scrubbed = scrubIdentity(diff);
    expect(residualLeaks(scrubbed)).toEqual([]);
    expect(scrubbed).toContain(REDACTION);
  });

  it("scrubs the harness's own name so the condition is not announced", () => {
    const scrubbed = scrubIdentity("+import { thing } from 'soloship';");
    expect(residualLeaks(scrubbed)).toEqual([]);
  });

  it("redacts git authorship and index metadata", () => {
    const diff = [
      "commit abc123",
      "Author: Someone <someone@example.com>",
      "Date: Tue Aug 12 2026",
      "index 1234567..89abcde 100644",
      "+const x = 1;",
    ].join("\n");
    const scrubbed = scrubIdentity(diff);
    expect(scrubbed).not.toContain("someone@example.com");
    expect(scrubbed).not.toContain("1234567..89abcde");
    expect(scrubbed).toContain("+const x = 1;");
  });

  it("leaves ordinary code untouched", () => {
    const diff = "+export function slugify(title) { return title.trim(); }";
    expect(scrubIdentity(diff)).toBe(diff);
  });

  it("honours extra scrub patterns supplied by the run config", () => {
    const scrubbed = scrubIdentity("+// built by AcmeAgent", ["AcmeAgent"]);
    expect(scrubbed).not.toContain("AcmeAgent");
    expect(residualLeaks(scrubbed, ["AcmeAgent"])).toEqual([]);
  });

  it("detects a leak that scrubbing did not catch", () => {
    // residualLeaks is the gate; it must report on unscrubbed input.
    expect(residualLeaks("this was written by Opus")).toContain("opus");
  });

  it("scrubs a reference to a process artifact that reveals the condition", () => {
    // Regression from the first live run: the plan FILE was excluded from the
    // reviewed diff, but a surviving DECISIONS.md cited it by path, telling
    // the judge which arm had run a planning workflow.
    const diff = "+Ambiguities while executing `docs/plans/2026-08-12-fix.md`.";
    const scrubbed = scrubIdentity(diff);
    expect(scrubbed).not.toContain("docs/plans/");
    expect(residualLeaks(scrubbed)).toEqual([]);
  });

  it("flags a process-artifact reference as a leak before scrubbing", () => {
    expect(residualLeaks("see .claude/rules/foo.md")).toContain(".claude/");
  });
});

describe("codenames", () => {
  it("is deterministic for the same run and arm", () => {
    expect(codenameFor("run-1", "opus5-bare-r1")).toBe(
      codenameFor("run-1", "opus5-bare-r1")
    );
  });

  it("differs across runs so results are not cross-identifiable", () => {
    expect(codenameFor("run-1", "opus5-bare-r1")).not.toBe(
      codenameFor("run-2", "opus5-bare-r1")
    );
  });

  it("assigns a unique codename to every arm", () => {
    const armIds = expandArms(
      buildConfig({ repoRoot: "/tmp/x", runId: "r", baseline: "abc" })
    ).map((arm) => arm.id);
    const assigned = assignCodenames("r", armIds);
    expect(assigned.size).toBe(armIds.length);
    expect(new Set(assigned.values()).size).toBe(armIds.length);
  });

  it("never encodes the model or condition in the codename", () => {
    const codename = codenameFor("r", "opus5-harnessed-r1");
    expect(codename.toLowerCase()).not.toContain("opus");
    expect(codename.toLowerCase()).not.toContain("harness");
  });

  it("draws only from the neutral pool", () => {
    const stem = codenameFor("r", "any-arm").split("-")[0];
    expect(CODENAME_POOL).toContain(stem);
  });
});

describe("review path filtering", () => {
  it("excludes process artifacts that would reveal the harness condition", () => {
    const specs = buildPathspecs([], ["docs/", ".claude/"]);
    expect(specs).toContain(":(exclude)docs/");
    expect(specs).toContain(":(exclude).claude/");
  });

  it("excludes the decisions log every arm is asked to write", () => {
    // The autonomy clause makes every arm write DECISIONS.md, and a harnessed
    // arm's copy names the plan it executed.
    const config = buildConfig({ repoRoot: "/tmp/x", runId: "r", baseline: "abc" });
    expect(config.review.excludePaths).toContain("DECISIONS.md");
  });

  it("scopes to include paths when given", () => {
    const specs = buildPathspecs(["src/"], ["docs/"]);
    expect(specs[0]).toBe("src/");
  });
});

describe("reviewer ordering", () => {
  it("gives different reviewers different orders", () => {
    const items = ["a", "b", "c", "d", "e", "f"];
    expect(shuffleForReviewer(items, 1)).not.toEqual(shuffleForReviewer(items, 2));
  });

  it("is reproducible for the same reviewer", () => {
    const items = ["a", "b", "c", "d"];
    expect(shuffleForReviewer(items, 3)).toEqual(shuffleForReviewer(items, 3));
  });

  it("preserves every item", () => {
    const items = ["a", "b", "c", "d"];
    expect([...shuffleForReviewer(items, 5)].sort()).toEqual(items);
  });
});

describe("pairwise schedule", () => {
  it("judges every pair in both orders to cancel position bias", () => {
    const submissions = ["A", "B", "C"].map((codename) => ({
      codename,
      armId: codename,
      diff: "",
      diffLines: 0,
    }));
    const schedule = buildPairSchedule(submissions);
    // 3 unordered pairs, each appearing twice.
    expect(schedule).toHaveLength(6);
    const forward = schedule.filter((p) => p.left.codename === "A" && p.right.codename === "B");
    const reverse = schedule.filter((p) => p.left.codename === "B" && p.right.codename === "A");
    expect(forward).toHaveLength(1);
    expect(reverse).toHaveLength(1);
  });

  it("produces nothing for a single submission", () => {
    expect(
      buildPairSchedule([{ codename: "A", armId: "A", diff: "", diffLines: 0 }])
    ).toHaveLength(0);
  });
});

describe("rubric weighting", () => {
  it("returns 1 for a perfect score sheet", () => {
    expect(
      weightRubric({
        correctness: 5,
        robustness: 5,
        scope: 5,
        maintainability: 5,
        process: 5,
      })
    ).toBeCloseTo(1, 6);
  });

  it("treats a missing criterion as zero rather than throwing", () => {
    expect(weightRubric({ correctness: 5 })).toBeCloseTo(0.35, 6);
  });

  it("clamps out-of-range judge output", () => {
    expect(
      weightRubric({
        correctness: 99,
        robustness: -5,
        scope: 5,
        maintainability: 5,
        process: 5,
      })
    ).toBeCloseTo(0.35 + 0.15 + 0.2 + 0.1, 6);
  });
});

describe("no-merge guarantee", () => {
  it.each(PROTECTED_BRANCHES)("refuses to name an arm branch %s", (branch) => {
    expect(() => assertSafeArmBranch(branch)).toThrow();
  });

  it("refuses a gauntlet-namespaced branch whose leaf is protected", () => {
    expect(() => assertSafeArmBranch("gauntlet/run-1/main")).toThrow();
  });

  it("refuses any branch outside the gauntlet namespace", () => {
    expect(() => assertSafeArmBranch("feature/my-work")).toThrow();
  });

  it("accepts a well-formed arm branch", () => {
    expect(() => assertSafeArmBranch("gauntlet/run-1/opus5-bare-r1")).not.toThrow();
  });

  it("never passes a merging git subcommand to a process", () => {
    // The guarantee the user was given is structural, not a runtime check:
    // there is no merge capability to misfire. Every git invocation in this
    // package builds an argv array, so a forbidden subcommand would have to
    // appear as a quoted argv entry.
    const forbiddenArgv = [/"merge"/, /"push"/, /"reset"/, /"rebase"/, /"cherry-pick"/];
    for (const file of readdirSync(GAUNTLET_SRC)) {
      if (!file.endsWith(".ts")) continue;
      const code = stripComments(readFileSync(join(GAUNTLET_SRC, file), "utf-8"));
      for (const pattern of forbiddenArgv) {
        expect(
          pattern.test(code),
          `${file} passes a forbidden git subcommand matching ${pattern}`
        ).toBe(false);
      }
    }
  });

  it("only mentions `git merge` in a module that cannot execute anything", () => {
    // The scorecard PRINTS a merge command for the user to run themselves.
    // That is the handoff, and it is only safe while the module printing it
    // has no way to spawn a process.
    const spawners = /from "node:child_process"|execSync|execFileSync|\bspawn\(/;
    for (const file of readdirSync(GAUNTLET_SRC)) {
      if (!file.endsWith(".ts")) continue;
      const code = stripComments(readFileSync(join(GAUNTLET_SRC, file), "utf-8"));
      if (!/\bgit\s+(merge|push|reset|rebase|cherry-pick)\b/.test(code)) continue;
      expect(
        spawners.test(code),
        `${file} contains a merge command AND can spawn processes`
      ).toBe(false);
    }
  });

  it("rejects a config whose arms would collide with a protected branch", () => {
    const config = buildConfig({
      repoRoot: "/tmp/x",
      runId: "r",
      baseline: "abc",
    });
    config.branchPrefix = "release";
    expect(validateConfig(config).some((i) => i.field === "branchPrefix")).toBe(true);
  });
});

describe("OpenRouter validity warnings", () => {
  const withAdapter = (
    adapter: Record<string, unknown>,
    modelAdapter = "openrouter"
  ) => {
    const config = buildConfig({ repoRoot: "/tmp/x", runId: "r", baseline: "abc" });
    config.adapters = { ...config.adapters, [modelAdapter]: adapter as never };
    config.models = [
      { id: "m", adapter: modelAdapter, model: "x-ai/grok", label: "Grok", conditions: ["bare"] },
    ];
    return config;
  };

  const openrouterAdapter = (env: Record<string, string>) => ({
    id: "openrouter",
    command: "opencode",
    baseArgs: ["run", "--model", "{{model}}", "{{prompt}}"],
    harnessedArgs: [],
    bareArgs: [],
    env,
    telemetry: "none",
  });

  it("warns when an OpenRouter adapter has no provider pinning", () => {
    // Unpinned, one slug can be served by different providers at different
    // quantizations between requests — the run measures routing, not models.
    const warnings = configWarnings(
      withAdapter(openrouterAdapter({ OPENROUTER_API_KEY: "" }))
    );
    expect(warnings.some((w) => w.includes("provider pinning"))).toBe(true);
  });

  it("stays quiet once fallbacks are pinned off", () => {
    const warnings = configWarnings(
      withAdapter(
        openrouterAdapter({
          OPENROUTER_API_KEY: "",
          OPENROUTER_ALLOW_FALLBACKS: "false",
          OPENROUTER_PROVIDER_ORDER: "anthropic",
        })
      )
    );
    expect(warnings.some((w) => w.includes("provider pinning"))).toBe(false);
  });

  it("says nothing about pinning for adapters that never touch a gateway", () => {
    const config = buildConfig({ repoRoot: "/tmp/x", runId: "r", baseline: "abc" });
    expect(configWarnings(config)).toEqual([]);
  });

  it("warns when gateway-routed and direct arms share one run", () => {
    // The gateway adds a network hop, so mixed arms make the speed column lie.
    const config = withAdapter(openrouterAdapter({ OPENROUTER_ALLOW_FALLBACKS: "false" }));
    config.models.push({
      id: "direct", adapter: "claude", model: "claude-opus-5", label: "Opus 5",
    });
    expect(configWarnings(config).some((w) => w.includes("two gauntlets"))).toBe(true);
  });

  it("does not warn about mixing when every arm routes through the gateway", () => {
    const config = withAdapter(openrouterAdapter({ OPENROUTER_ALLOW_FALLBACKS: "false" }));
    config.models.push({
      id: "m2", adapter: "openrouter", model: "openai/gpt-5.4", label: "GPT", conditions: ["bare"],
    });
    expect(configWarnings(config).some((w) => w.includes("two gauntlets"))).toBe(false);
  });

  it("ignores an unused adapter", () => {
    const config = buildConfig({ repoRoot: "/tmp/x", runId: "r", baseline: "abc" });
    config.adapters.openrouter = openrouterAdapter({}) as never;
    expect(configWarnings(config)).toEqual([]);
  });
});

describe("arm expansion", () => {
  it("produces model x condition x rep arms", () => {
    const config = buildConfig({
      repoRoot: "/tmp/x",
      runId: "r",
      baseline: "abc",
      reps: 2,
    });
    const arms = expandArms(config);
    expect(arms).toHaveLength(config.models.length * 2 * 2);
    expect(new Set(arms.map((a) => a.id)).size).toBe(arms.length);
  });

  it("honours a per-model condition override", () => {
    const config = buildConfig({
      repoRoot: "/tmp/x",
      runId: "r",
      baseline: "abc",
      reps: 1,
    });
    config.models = [
      { id: "grok", adapter: "generic", model: "grok-code", label: "Grok", conditions: ["bare"] },
    ];
    const arms = expandArms(config);
    expect(arms).toHaveLength(1);
    expect(arms[0].condition).toBe("bare");
  });

  it("puts every arm under the gauntlet branch namespace", () => {
    const config = buildConfig({ repoRoot: "/tmp/x", runId: "r", baseline: "abc" });
    for (const arm of expandArms(config)) {
      expect(arm.branch.startsWith("gauntlet/r/")).toBe(true);
    }
  });

  it("flags an unknown adapter before anything runs", () => {
    const config = buildConfig({ repoRoot: "/tmp/x", runId: "r", baseline: "abc" });
    config.models = [{ id: "x", adapter: "nope", model: "m", label: "X" }];
    expect(validateConfig(config).some((i) => i.message.includes("nope"))).toBe(true);
  });

  it("slugifies labels into branch-safe ids", () => {
    expect(slugify("Claude Opus 5!")).toBe("claude-opus-5");
  });
});

describe("condition wiring", () => {
  it("gives the bare arm the all-customizations-off switch", () => {
    const args = buildArgs(BUILTIN_ADAPTERS.claude, "bare", {
      prompt: "p", model: "m", cwd: "/tmp", pluginRoot: "/plugin", budgetUsd: "5",
    });
    expect(args).toContain("--safe-mode");
    expect(args).not.toContain("--plugin-dir");
  });

  it("gives the harnessed arm the plugin and not the off switch", () => {
    const args = buildArgs(BUILTIN_ADAPTERS.claude, "harnessed", {
      prompt: "p", model: "m", cwd: "/tmp", pluginRoot: "/plugin", budgetUsd: "5",
    });
    expect(args).toContain("--plugin-dir");
    expect(args).toContain("/plugin");
    expect(args).not.toContain("--safe-mode");
  });

  it("passes the per-arm budget cap through", () => {
    const args = buildArgs(BUILTIN_ADAPTERS.claude, "bare", {
      prompt: "p", model: "m", cwd: "/tmp", pluginRoot: "", budgetUsd: "7",
    });
    expect(args[args.indexOf("--max-budget-usd") + 1]).toBe("7");
  });

  it("leaves unknown placeholders alone instead of blanking them", () => {
    expect(
      fillPlaceholders("{{unknown}}", {
        prompt: "p", model: "m", cwd: "/tmp", pluginRoot: "", budgetUsd: "1",
      })
    ).toBe("{{unknown}}");
  });
});

describe("prompt construction", () => {
  const arm = (condition: "harnessed" | "bare") => ({
    id: "x", modelId: "m", modelLabel: "M", adapter: "claude",
    model: "m", condition, rep: 1, branch: "gauntlet/r/x",
  });

  it("gives both conditions the identical autonomy contract", () => {
    expect(buildPrompt("Task.", arm("bare"))).toContain(AUTONOMY_CLAUSE.trim());
    expect(buildPrompt("Task.", arm("harnessed"))).toContain(AUTONOMY_CLAUSE.trim());
  });

  it("routes only the harnessed arm through the methodology", () => {
    expect(buildPrompt("Task.", arm("harnessed"))).toContain(HARNESS_PREAMBLE.trim());
    expect(buildPrompt("Task.", arm("bare"))).not.toContain("/soloship:plan");
  });

  it("gives both conditions the identical task facts", () => {
    const brief = "Run tests with npm test. The code is in src/.";
    expect(buildPrompt(brief, arm("bare"))).toContain(brief);
    expect(buildPrompt(brief, arm("harnessed"))).toContain(brief);
  });
});

describe("acceptance parsing", () => {
  it("prefers an explicit marker", () => {
    expect(parseAcceptanceOutput("GAUNTLET_ACCEPT 3/5", 1)).toEqual({
      passed: 3, total: 5, ratio: 0.6,
    });
  });

  it("counts individual TAP assertions rather than a per-file rollup", () => {
    const output = [
      "ok 1 - strips punctuation",
      "not ok 2 - folds accents to ascii",
      "ok 3 - collapses separators",
      "# pass 1",
      "# fail 0",
    ].join("\n");
    expect(parseAcceptanceOutput(output, 1)).toEqual({
      passed: 2, total: 3, ratio: 2 / 3,
    });
  });

  it("ignores rollup lines named after a file or directory", () => {
    const output = [
      "not ok 1 - gauntlet-acceptance/slugify.accept.test.js",
      "ok 2 - a real assertion",
    ].join("\n");
    expect(countTapAssertions(output)).toEqual({ passed: 1, total: 1, ratio: 1 });
  });

  it("falls back to a runner summary when no assertions are listed", () => {
    expect(parseAcceptanceOutput("# pass 4\n# fail 1", 1)).toEqual({
      passed: 4, total: 5, ratio: 0.8,
    });
  });

  it("parses a vitest summary", () => {
    expect(parseAcceptanceOutput("Tests  2 failed | 6 passed (8)", 1).ratio).toBeCloseTo(
      6 / 8, 6
    );
  });

  it("falls back to the exit code when nothing is parseable", () => {
    expect(parseAcceptanceOutput("total gibberish", 0).ratio).toBe(1);
    expect(parseAcceptanceOutput("total gibberish", 1).ratio).toBe(0);
  });
});

describe("telemetry parsing", () => {
  it("reads cost and turns from a result envelope", () => {
    const stdout = `some log noise\n${JSON.stringify({
      total_cost_usd: 0.42,
      num_turns: 7,
      usage: { input_tokens: 10, cache_read_input_tokens: 90, output_tokens: 55 },
    })}`;
    const telemetry = parseClaudeTelemetry(stdout, 12.5);
    expect(telemetry.costUsd).toBe(0.42);
    expect(telemetry.turns).toBe(7);
    expect(telemetry.inputTokens).toBe(100);
    expect(telemetry.outputTokens).toBe(55);
    expect(telemetry.wallClockSec).toBe(12.5);
  });

  it("reports unavailable metrics as null, never zero", () => {
    const telemetry = parseClaudeTelemetry("no json here", 3);
    expect(telemetry.costUsd).toBeNull();
    expect(telemetry.turns).toBeNull();
    expect(telemetry.wallClockSec).toBe(3);
  });

  it("finds the envelope among braces in log output", () => {
    const found = extractLastJsonObject('log { not json } more\n{"a":1}\ntrailing');
    expect(found).toEqual({ a: 1 });
  });

  it("is not confused by braces inside strings", () => {
    const found = extractLastJsonObject('{"msg":"a { unbalanced","b":2}');
    expect(found).toEqual({ msg: "a { unbalanced", b: 2 });
  });
});
