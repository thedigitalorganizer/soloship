// Gauntlet — independent blind review.
//
// Two judgments per run: absolute rubric scores, and an order-balanced pairwise
// tournament. Both exist because LLM judges are materially more reliable at
// "which of these two is better" than at "score this out of five", while
// pairwise alone gives no sense of whether ANY submission was good.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { invokeAgent, extractLastJsonObject } from "./adapters.js";
import { runDir } from "./config.js";
import { shuffleForReviewer, type Submission } from "./anonymize.js";
import type {
  GauntletConfig,
  PairwiseVerdict,
  RubricVerdict,
} from "./types.js";

/** Filenames for persisted review output. */
export const RUBRIC_FILENAME = "rubric-verdicts.json";
export const PAIRWISE_FILENAME = "pairwise-verdicts.json";
/** Subdirectory holding the exact prompt each judge received, for audit. */
export const JUDGE_LOG_SUBDIR = "review-log";

/** Max diff characters shown to a judge. Beyond this the comparison degrades
 *  into a reading-comprehension test, so oversize diffs are truncated with an
 *  explicit notice rather than silently trimmed. */
export const MAX_DIFF_CHARS = 120_000;
/** Wall-clock cap for a single judge call. */
export const JUDGE_TIMEOUT_SEC = 600;
/** Spend cap for a single judge call. */
export const JUDGE_BUDGET_USD = 2;
/** Judge calls issued at once. */
export const JUDGE_CONCURRENCY = 4;
/** Top of the rubric scale. */
export const RUBRIC_MAX = 5;

/**
 * The rubric. Weights sum to 1 and are printed in the report, because a
 * composite whose weights are invisible is an opinion wearing a number's
 * clothes.
 *
 * "process" is included on the strength of Harness-Bench's finding that
 * completion alone hides where agents actually differ — an arm that reached the
 * right answer by thrashing is not equivalent to one that reasoned to it.
 */
export const RUBRIC_CRITERIA = [
  {
    key: "correctness",
    weight: 0.35,
    prompt: "Does the change actually accomplish the task, including edge cases and failure paths?",
  },
  {
    key: "robustness",
    weight: 0.2,
    prompt: "Will this hold up under real input — error handling, boundaries, concurrency, bad data?",
  },
  {
    key: "scope",
    weight: 0.15,
    prompt: "Is the change confined to what the task asked for, with no unrelated rewrites or drive-by refactors?",
  },
  {
    key: "maintainability",
    weight: 0.2,
    prompt: "Naming, structure, and clarity: how easily could a different engineer change this in six months?",
  },
  {
    key: "process",
    weight: 0.1,
    prompt: "Evidence the author verified their own work — tests that assert real behavior, not just that code runs.",
  },
] as const;

/**
 * Prepended to every judge prompt.
 *
 * The style clause is not boilerplate: LLM judges are known to reward length
 * and surface polish over substance ("Style Outweighs Substance",
 * arXiv 2409.15268). The report additionally correlates diff size against
 * rubric score, so the bias is measured rather than merely discouraged.
 */
export const JUDGE_PREAMBLE = `You are an independent code reviewer for a blind evaluation.

Submissions are anonymous and identified only by codename. You do not know who
or what produced any of them. Do not speculate about authorship; if you think
you can tell, ignore the thought and judge the code.

Judge substance, not volume. A shorter diff that solves the problem cleanly is
BETTER than a longer one that solves it with extra scaffolding. Do not reward
verbose comments, defensive boilerplate, or added files that the task did not
require. Do not penalize a submission for being concise.

Return ONLY a single JSON object. No prose before or after it.`;

function truncateDiff(diff: string): string {
  if (diff.length <= MAX_DIFF_CHARS) return diff;
  return `${diff.slice(0, MAX_DIFF_CHARS)}\n\n[diff truncated at ${MAX_DIFF_CHARS} characters]`;
}

export function buildRubricPrompt(task: string, submission: Submission): string {
  const criteria = RUBRIC_CRITERIA.map(
    (criterion) => `- "${criterion.key}" (weight ${criterion.weight}): ${criterion.prompt}`
  ).join("\n");

  return `${JUDGE_PREAMBLE}

## The task the author was given

${task}

## Submission ${submission.codename}

\`\`\`diff
${truncateDiff(submission.diff)}
\`\`\`

## Score it

Score each criterion from 1 to ${RUBRIC_MAX} (1 = unacceptable, ${RUBRIC_MAX} = excellent):

${criteria}

Respond with exactly this JSON shape:
{
  "scores": { ${RUBRIC_CRITERIA.map((c) => `"${c.key}": <1-${RUBRIC_MAX}>`).join(", ")} },
  "blockingIssues": ["specific defects that would block a merge, or an empty array"],
  "summary": "two sentences maximum"
}`;
}

export function buildPairwisePrompt(
  task: string,
  left: Submission,
  right: Submission
): string {
  return `${JUDGE_PREAMBLE}

## The task both authors were given

${task}

## Submission A — ${left.codename}

\`\`\`diff
${truncateDiff(left.diff)}
\`\`\`

## Submission B — ${right.codename}

\`\`\`diff
${truncateDiff(right.diff)}
\`\`\`

## Decide

Which submission would you rather inherit and maintain? Weigh correctness first,
then robustness, then scope discipline, then maintainability. Declare a tie only
when you genuinely cannot separate them.

Respond with exactly this JSON shape:
{
  "winner": "A" | "B" | "tie",
  "reason": "one or two sentences naming the deciding difference"
}`;
}

/** Weighted rubric total, normalized to 0..1. */
export function weightRubric(scores: Record<string, number>): number {
  let total = 0;
  for (const criterion of RUBRIC_CRITERIA) {
    const raw = scores[criterion.key];
    const clamped = Math.min(Math.max(Number(raw) || 0, 0), RUBRIC_MAX);
    total += (clamped / RUBRIC_MAX) * criterion.weight;
  }
  return total;
}

/** Every unordered pair, each appearing twice with the sides swapped. This is
 *  the two-game setup Arena-Hard uses to cancel judge position bias. */
export function buildPairSchedule(
  submissions: Submission[]
): { left: Submission; right: Submission }[] {
  const pairs: { left: Submission; right: Submission }[] = [];
  for (let i = 0; i < submissions.length; i += 1) {
    for (let j = i + 1; j < submissions.length; j += 1) {
      pairs.push({ left: submissions[i], right: submissions[j] });
      pairs.push({ left: submissions[j], right: submissions[i] });
    }
  }
  return pairs;
}

async function askJudge(
  config: GauntletConfig,
  prompt: string,
  label: string
): Promise<Record<string, unknown> | null> {
  const adapter = config.adapters[config.review.adapter];
  if (!adapter) throw new Error(`Unknown review adapter "${config.review.adapter}"`);

  const cwd = join(tmpdir(), `gauntlet-judge-${config.runId}`);
  mkdirSync(cwd, { recursive: true });

  const logDir = join(runDir(config.repoRoot, config.runId), JUDGE_LOG_SUBDIR);
  mkdirSync(logDir, { recursive: true });
  writeFileSync(join(logDir, `${label}.prompt.md`), prompt, "utf-8");

  const invocation = await invokeAgent({
    adapter,
    // Judges always run bare. A reviewer loaded with Soloship's own rules would
    // be grading harnessed submissions with the rulebook they were written
    // against — a rigged answer to the exact question being asked.
    condition: "bare",
    timeoutSec: JUDGE_TIMEOUT_SEC,
    values: {
      prompt,
      model: config.review.model,
      cwd,
      pluginRoot: "",
      budgetUsd: String(JUDGE_BUDGET_USD),
    },
  });

  writeFileSync(join(logDir, `${label}.response.json`), invocation.stdout, "utf-8");

  const envelope = extractLastJsonObject(invocation.stdout);
  if (!envelope) return null;
  const result = envelope.result;
  if (typeof result === "string") {
    return extractLastJsonObject(result);
  }
  return typeof result === "object" && result !== null
    ? (result as Record<string, unknown>)
    : null;
}

/** Run an async mapper over items with bounded concurrency. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, () =>
      worker()
    )
  );
  return results;
}

export interface ReviewOptions {
  config: GauntletConfig;
  task: string;
  submissions: Submission[];
  onEvent?: (message: string) => void;
}

export async function runRubricReview(
  options: ReviewOptions
): Promise<RubricVerdict[]> {
  const { config, submissions, onEvent } = options;
  const jobs: { submission: Submission; reviewer: number }[] = [];

  for (let reviewer = 1; reviewer <= config.review.reviewersPerSubmission; reviewer += 1) {
    // Each reviewer sees a different submission order so any drift over the
    // course of a reviewer's session does not always fall on the same arm.
    for (const submission of shuffleForReviewer(submissions, reviewer)) {
      jobs.push({ submission, reviewer });
    }
  }

  onEvent?.(`dispatching ${jobs.length} rubric review(s) on ${config.review.model}`);

  const verdicts = await mapLimit(jobs, JUDGE_CONCURRENCY, async (job) => {
    const label = `rubric-${job.submission.codename}-r${job.reviewer}`;
    const parsed = await askJudge(
      config,
      buildRubricPrompt(options.task, job.submission),
      label
    );
    const scores = (parsed?.scores ?? {}) as Record<string, number>;
    const verdict: RubricVerdict = {
      codename: job.submission.codename,
      reviewer: job.reviewer,
      scores,
      weightedTotal: weightRubric(scores),
      blockingIssues: Array.isArray(parsed?.blockingIssues)
        ? (parsed!.blockingIssues as string[])
        : [],
      summary: typeof parsed?.summary === "string" ? parsed.summary : "",
    };
    onEvent?.(`  ${label}: ${(verdict.weightedTotal * 100).toFixed(0)}%`);
    return verdict;
  });

  return verdicts;
}

export async function runPairwiseReview(
  options: ReviewOptions
): Promise<PairwiseVerdict[]> {
  const { config, submissions, onEvent } = options;
  if (config.review.pairwise === "off" || submissions.length < 2) return [];

  const schedule = buildPairSchedule(submissions);
  onEvent?.(
    `dispatching ${schedule.length} pairwise comparison(s) ` +
      `(${schedule.length / 2} pairs, each judged in both orders)`
  );

  return mapLimit(schedule, JUDGE_CONCURRENCY, async (pair, index) => {
    const label = `pair-${index}-${pair.left.codename}-vs-${pair.right.codename}`;
    const parsed = await askJudge(
      config,
      buildPairwisePrompt(options.task, pair.left, pair.right),
      label
    );
    const raw = String(parsed?.winner ?? "tie").trim().toUpperCase();
    const winner =
      raw === "A" ? pair.left.codename : raw === "B" ? pair.right.codename : null;
    return {
      left: pair.left.codename,
      right: pair.right.codename,
      winner,
      reason: typeof parsed?.reason === "string" ? parsed.reason : "",
    };
  });
}

export function writeVerdicts(
  config: GauntletConfig,
  rubric: RubricVerdict[],
  pairwise: PairwiseVerdict[]
): void {
  const dir = runDir(config.repoRoot, config.runId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, RUBRIC_FILENAME),
    `${JSON.stringify(rubric, null, 2)}\n`,
    "utf-8"
  );
  writeFileSync(
    join(dir, PAIRWISE_FILENAME),
    `${JSON.stringify(pairwise, null, 2)}\n`,
    "utf-8"
  );
}
