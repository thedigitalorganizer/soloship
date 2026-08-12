// Gauntlet — adapter invocation and telemetry parsing.
//
// Everything vendor-specific lives here. Adding Grok (or whatever ships next)
// should never require touching run.ts.

import { spawn } from "node:child_process";
import type { AgentAdapter, ArmTelemetry, Condition } from "./types.js";

/** Milliseconds per second, so the wall-clock conversions read as intent. */
const MS_PER_SEC = 1000;

export interface PlaceholderValues {
  prompt: string;
  model: string;
  cwd: string;
  pluginRoot: string;
  budgetUsd: string;
}

/** Substitute {{placeholders}} in one argv entry. */
export function fillPlaceholders(
  template: string,
  values: PlaceholderValues
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = (values as unknown as Record<string, string>)[key];
    return value === undefined ? match : value;
  });
}

/**
 * Build the full argv for one arm invocation.
 *
 * Condition-specific argv comes from the adapter, not from the caller, so the
 * harnessed/bare distinction cannot drift between call sites.
 */
export function buildArgs(
  adapter: AgentAdapter,
  condition: Condition,
  values: PlaceholderValues
): string[] {
  const conditionArgs =
    condition === "harnessed" ? adapter.harnessedArgs : adapter.bareArgs;
  const templates = [...adapter.baseArgs, ...conditionArgs];
  const filled = templates.map((entry) => fillPlaceholders(entry, values));
  return adapter.promptOnStdin
    ? filled.filter((entry) => entry !== values.prompt)
    : filled;
}

/** Empty telemetry with only wall-clock known. Unavailable stays null, never 0,
 *  so a report can say "unavailable" instead of implying "free". */
export function emptyTelemetry(wallClockSec: number): ArmTelemetry {
  return {
    wallClockSec,
    costUsd: null,
    turns: null,
    inputTokens: null,
    outputTokens: null,
  };
}

/** Parse Claude Code's `--output-format json` result envelope. */
export function parseClaudeTelemetry(
  stdout: string,
  wallClockSec: number
): ArmTelemetry {
  const telemetry = emptyTelemetry(wallClockSec);
  const envelope = extractLastJsonObject(stdout);
  if (!envelope) return telemetry;
  const usage = (envelope.usage ?? {}) as Record<string, unknown>;
  telemetry.costUsd = numberOrNull(envelope.total_cost_usd);
  telemetry.turns = numberOrNull(envelope.num_turns);
  telemetry.inputTokens = sumNumbers([
    usage.input_tokens,
    usage.cache_creation_input_tokens,
    usage.cache_read_input_tokens,
  ]);
  telemetry.outputTokens = numberOrNull(usage.output_tokens);
  return telemetry;
}

/**
 * Parse Codex's `--json` event stream. Codex emits newline-delimited events
 * rather than one envelope, so the last event carrying token usage wins.
 */
export function parseCodexTelemetry(
  stdout: string,
  wallClockSec: number
): ArmTelemetry {
  const telemetry = emptyTelemetry(wallClockSec);
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }
    const usage = (event.usage ?? event.token_usage) as
      | Record<string, unknown>
      | undefined;
    if (!usage) continue;
    telemetry.inputTokens =
      numberOrNull(usage.input_tokens) ?? telemetry.inputTokens;
    telemetry.outputTokens =
      numberOrNull(usage.output_tokens) ?? telemetry.outputTokens;
    telemetry.costUsd = numberOrNull(usage.cost_usd) ?? telemetry.costUsd;
  }
  return telemetry;
}

export function parseTelemetry(
  adapter: AgentAdapter,
  stdout: string,
  wallClockSec: number
): ArmTelemetry {
  switch (adapter.telemetry) {
    case "claude-json":
      return parseClaudeTelemetry(stdout, wallClockSec);
    case "codex-json":
      return parseCodexTelemetry(stdout, wallClockSec);
    default:
      return emptyTelemetry(wallClockSec);
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sumNumbers(values: unknown[]): number | null {
  const numbers = values.map(numberOrNull).filter((n): n is number => n !== null);
  return numbers.length === 0
    ? null
    : numbers.reduce((total, n) => total + n, 0);
}

/**
 * Pull the last top-level JSON object out of mixed output. Agent CLIs interleave
 * logs with their result envelope, so "parse the whole thing" is not an option.
 */
export function extractLastJsonObject(
  text: string
): Record<string, unknown> | null {
  let depth = 0;
  let start = -1;
  let last: Record<string, unknown> | null = null;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        try {
          last = JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          // Not valid JSON — keep scanning; agent logs contain braces too.
        }
        start = -1;
      }
      if (depth < 0) depth = 0;
    }
  }
  return last;
}

/**
 * Agent CLIs refuse to bypass permission prompts while running as root, which
 * is the normal state inside a container or CI runner — exactly where an
 * unattended batch run lives. The documented escape is IS_SANDBOX.
 *
 * This is applied only when already running as root (a privilege the operator
 * chose before the gauntlet started) and is announced by the runner rather than
 * set silently, because quietly relaxing a security control is how a
 * convenience becomes a surprise.
 */
export function needsSandboxEscape(): boolean {
  const getuid = (process as unknown as { getuid?: () => number }).getuid;
  return typeof getuid === "function" && getuid() === 0;
}

export const SANDBOX_ESCAPE_ENV = { IS_SANDBOX: "1" } as const;

export interface InvocationResult {
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  wallClockSec: number;
}

export interface InvokeOptions {
  adapter: AgentAdapter;
  condition: Condition;
  values: PlaceholderValues;
  timeoutSec: number;
  logStream?: (chunk: string) => void;
}

/** Run one agent invocation to completion (or to its wall-clock cap). */
export async function invokeAgent(
  options: InvokeOptions
): Promise<InvocationResult> {
  const { adapter, condition, values, timeoutSec } = options;
  const args = buildArgs(adapter, condition, values);
  const started = Date.now();

  return new Promise<InvocationResult>((resolvePromise) => {
    const child = spawn(adapter.command, args, {
      cwd: values.cwd,
      env: {
        ...process.env,
        ...(needsSandboxEscape() ? SANDBOX_ESCAPE_ENV : {}),
        ...(adapter.env ?? {}),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutSec * MS_PER_SEC);

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      options.logStream?.(text);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    if (adapter.promptOnStdin) {
      child.stdin.write(values.prompt);
    }
    child.stdin.end();

    const finish = (exitCode: number | null) => {
      clearTimeout(timer);
      resolvePromise({
        exitCode,
        timedOut,
        stdout,
        stderr,
        wallClockSec: (Date.now() - started) / MS_PER_SEC,
      });
    };

    child.on("error", (error: Error) => {
      stderr += `\n${error.message}`;
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
}
