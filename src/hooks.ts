import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProjectInfo } from "./detect.js";

// Session-coordination thresholds. Single definition site: these values are
// interpolated into the generated hook scripts below AND rewritten to
// <git-common-dir>/soloship/config.json on every SessionStart, which the
// skills (status dashboard, deploy sequence) read instead of hardcoding
// copies. Regenerating the file each session means upgraded thresholds
// propagate; a write-once file would freeze stale values.
export const SESSION_PRUNE_HOURS = 24; // session files older than this are deleted
export const SESSION_ACTIVE_MIN = 15; // heartbeat younger than this = active
export const SESSION_IDLE_MIN = 60; // heartbeat younger than this = idle; older = presumed dead
export const DEPLOY_LOCK_STALE_MIN = 45; // deploy lock older than this = presumed stale (never auto-broken)

// Browser-claim liveness. A claim file's mtime is refreshed on every browser
// MCP tool call; a claim older than this is a dead session's leftovers, not a
// browser actually in use. Deliberately the same number as SESSION_IDLE_MIN —
// one "presumed dead" threshold to reason about.
export const BROWSER_CLAIM_STALE_MIN = SESSION_IDLE_MIN;

// Teardown reminder. When a session's own browser claim has gone quiet for
// this many minutes but the session is still running, the Stop hook reminds
// the agent to tear down (close tabs, release grants, release the claim).
// Long enough that active QA (which refreshes the claim constantly) is never
// nagged; short enough that "finished QA, moved on, still holding the
// browser" gets surfaced within the same session.
export const BROWSER_TEARDOWN_REMIND_MIN = 10;

// Where browser claims live under <git-common-dir>/soloship/. Kept OUT of
// claims/ — that glob is consumed by the plan-truth gate as plan claims.
export const BROWSER_CLAIMS_DIRNAME = "browser";

// Tool-name matcher for every browser MCP surface Soloship knows about:
// chrome-devtools (Google's Chrome MCP — launches its own managed Chrome),
// claude-in-chrome (the Claude extension in the user's own Chrome + 1Password
// autofill), and Claude Desktop's built-in browser.
// The /browse daemon runs via Bash and is shared by design — it is not
// claimed or cleaned per session, so it is deliberately absent here.
export const BROWSER_MCP_TOOL_MATCHER =
  "mcp__claude-in-chrome__.*|mcp__chrome-devtools__.*|mcp__Claude_Browser__.*";

// strftime format for the reply-timestamp Stop hook. Uses the machine's local
// timezone (no TZ pin) since installed projects belong to users anywhere.
export const REPLY_TIMESTAMP_FORMAT = "%-m/%-d/%Y %-I:%M:%S %p %Z";

// --- Plan truth + artifact lifecycle -------------------------------------
//
// Plan status was the only Soloship invariant with no mechanical floor. /plan
// writes `status: planned`; /implement is told to flip it to `in-progress` and
// then `done`; /finish also writes `done`. Nothing verified any of it — so a
// plan whose work shipped could sit at "planned" forever. That is not a
// cosmetic defect: agents READ plans and act on them, and a plan that claims
// "not started" for live work invites an agent to build it a second time.
//
// The fix is to check the plan's claim against GIT EVIDENCE at the two moments
// evidence exists — the first code commit, and the merge — instead of trusting
// the agent's self-report at the tail of a long skill (the collapse zone, where
// context runs out and the write silently never happens).
export const PLANS_DIR = "docs/plans";
export const DRAFTS_DIR = "docs/drafts";
export const HANDOFFS_DIR = "docs/handoffs";
export const REPORTS_DIR = "docs/reports";
export const DECISIONS_DIR = "docs/architecture/decisions";

// Canonical plan status vocabulary (see the plan skill's Artifact Contract).
// Legacy values still in the wild: "Not started" → planned, "active" →
// in-progress, "completed" → done.
// Must stay in sync with the Unified Status Vocabulary in skills/plan/SKILL.md.
// `backlog` is easy to forget and its omission is a live bug: the namespace gate
// would reject a legitimate backlog stub for having an "invalid" status.
export const PLAN_STATUSES = [
  "backlog",
  "planned",
  "in-progress",
  "blocked",
  "done",
  "abandoned",
  "superseded",
] as const;

// Statuses that mean "this work has not landed yet". A plan in one of these
// states that has merged code behind it is, by definition, lying.
export const PLAN_STATUSES_OPEN = ["planned", "in-progress"] as const;

// Escape hatch, mirroring .ai/.billing-ack and .ai/.recurrence-ack. A gate with
// no hatch gets disabled wholesale the first time it is wrong; a gate with a
// loud, logged hatch survives. The anti-gaming clause of the recurrence-gate
// rule applies — creating this without a real reason defeats the instrument.
export const PLAN_STATUS_ACK = ".ai/.plan-status-ack";

const PLAN_STATUS_RE = PLAN_STATUSES.join("|");
const PLAN_STATUS_OPEN_RE = PLAN_STATUSES_OPEN.join("|");

interface HooksConfig {
  hooks: {
    PreToolUse?: HookEntry[];
    PostToolUse?: HookEntry[];
    Stop?: HookEntry[];
    SessionStart?: HookEntry[];
    SessionEnd?: HookEntry[];
  };
}

interface HookEntry {
  matcher: string;
  hooks: HookCommand[];
  // Stamped on every hook Soloship installs so a re-init can replace exactly
  // its own hooks (idempotent) while leaving user-added hooks untouched.
  _soloshipManaged?: boolean;
}

const HOOK_EVENTS = [
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "SessionStart",
  "SessionEnd",
] as const;

// Best-effort fingerprints for Soloship hooks installed BEFORE the _soloshipManaged
// marker existed (one-time migration). Kept specific to avoid dropping a user's
// genuinely custom hook that merely mentions a common word.
const LEGACY_SOLOSHIP_HOOK_RE =
  /billing-confirmation-gate|live-data-evidence-gate|\.ai\/learnings\.jsonl|deploy-from-main|plan-truth|plan-namespace|plan-merge|Key Decisions|"systemMessage": "%-m|soloship\/(sessions|claims)|Soloship update|BLOCKED: (Dangerous|Direct|Force)|phone-a-friend|recurrence|main-checkout-authoring/i;

function isLegacySoloshipHook(entry: HookEntry): boolean {
  const cmd = (entry.hooks || []).map((h) => h.command || "").join("\n");
  return LEGACY_SOLOSHIP_HOOK_RE.test(cmd);
}

// Merge Soloship's freshly-built hooks into whatever is already configured,
// preserving user-custom hooks and dropping only Soloship's own (marked, or
// legacy-fingerprinted). Idempotent: re-running never duplicates a Soloship hook.
function mergeSoloshipHooks(
  existing: HooksConfig["hooks"],
  fresh: HooksConfig["hooks"]
): HooksConfig["hooks"] {
  const result: HooksConfig["hooks"] = { ...existing };
  for (const ev of HOOK_EVENTS) {
    const prior = existing[ev] || [];
    const custom = prior.filter(
      (e) => !e._soloshipManaged && !isLegacySoloshipHook(e)
    );
    const mine = (fresh[ev] || []).map((e) => ({ ...e, _soloshipManaged: true }));
    const merged = [...custom, ...mine];
    if (merged.length > 0) result[ev] = merged;
    else delete result[ev];
  }
  return result;
}

interface HookCommand {
  type: "command";
  command: string;
  timeout?: number;
}

export async function installHooks(
  root: string,
  project: ProjectInfo
): Promise<string[]> {
  const results: string[] = [];
  const claudeDir = join(root, ".claude");

  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
  }

  const settingsPath = join(claudeDir, "settings.local.json");

  // Read existing settings or start fresh
  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    } catch {
      // Invalid JSON, start fresh
    }
  }

  // Build hooks config
  const hooks: HooksConfig["hooks"] = {};

  // PreToolUse: Block dangerous commands + phone-a-friend warnings
  hooks.PreToolUse = [
    {
      matcher: "Bash",
      hooks: [
        {
          type: "command",
          command: buildPreToolUseScript(),
          timeout: 5000,
        },
      ],
    },
    {
      matcher: "Bash",
      hooks: [
        {
          type: "command",
          command: buildPhoneAFriendScript(),
          timeout: 10000,
        },
      ],
    },
    {
      matcher: "Bash",
      hooks: [
        {
          type: "command",
          command: buildSecurityScanScript(),
          timeout: 30000,
        },
      ],
    },
    {
      matcher: "Bash",
      hooks: [
        {
          type: "command",
          command: buildDeployFreshnessScript(),
          timeout: 10000,
        },
      ],
    },
    {
      matcher: "Bash",
      hooks: [
        {
          type: "command",
          command: buildDeployDisciplineScript(),
          timeout: 10000,
        },
      ],
    },
    {
      matcher: "Edit|Write|MultiEdit|NotebookEdit",
      hooks: [
        {
          type: "command",
          command: buildBillingGateScript(),
          timeout: 5000,
        },
      ],
    },
    {
      matcher: "Bash",
      hooks: [
        {
          type: "command",
          command: buildRecurrenceGateScript(),
          timeout: 10000,
        },
      ],
    },
    // Plan-truth gate: block a CODE commit whose plan still says "planned".
    {
      matcher: "Bash",
      hooks: [
        {
          type: "command",
          command: buildPlanTruthGateScript(),
          timeout: 5000,
        },
      ],
    },
    // Plan-merge gate: block merging a branch whose plan is still open.
    {
      matcher: "Bash",
      hooks: [
        {
          type: "command",
          command: buildPlanMergeGateScript(),
          timeout: 5000,
        },
      ],
    },
    // Main-checkout authoring warn: committing in the main checkout while
    // other worktrees are active (warn-only, never blocks).
    {
      matcher: "Bash",
      hooks: [
        {
          type: "command",
          command: buildMainCheckoutAuthorWarnScript(),
          timeout: 5000,
        },
      ],
    },
    // Plan-namespace gate: docs/plans/ holds plans only.
    {
      matcher: "Edit|Write|MultiEdit",
      hooks: [
        {
          type: "command",
          command: buildPlanNamespaceGateScript(),
          timeout: 5000,
        },
      ],
    },
    // Plan-completeness gate: a plan must declare ## Goal + ## Done-When.
    {
      matcher: "Edit|Write|MultiEdit",
      hooks: [
        {
          type: "command",
          command: buildPlanGoalGateScript(),
          timeout: 5000,
        },
      ],
    },
  ];

  results.push("PreToolUse: block dangerous commands (rm -rf ~, .env edits, force push to main)");
  results.push("PreToolUse: plan-truth gate (blocks code commits whose plan still says 'planned')");
  results.push("PreToolUse: plan-merge gate (blocks merging a branch whose plan is still open)");
  results.push("PreToolUse: main-checkout authoring warn (commit in main checkout while worktrees active; warn-only)");
  results.push("PreToolUse: plan-namespace gate (docs/plans/ holds plans only; routes drafts/handoffs/reports)");
  results.push("PreToolUse: plan-completeness gate (a plan must declare ## Goal + ## Done-When)");
  results.push("PreToolUse: phone-a-friend warnings on commits (6 heuristic patterns)");
  results.push("PreToolUse: security scan on commits (Semgrep, blocks critical findings)");
  results.push("PreToolUse: deploy-freshness gate (blocks stale build artifact, warns on unapplied D1 migrations)");
  results.push("PreToolUse: deploy-discipline gate (blocks production deploys from worktrees, non-default branches, dirty trees, or past another session's fresh deploy lock)");
  results.push("PreToolUse: billing/credit/rerun-window confirmation gate (blocks edits until data-model semantics confirmed)");
  results.push("PreToolUse: recurrence gate (blocks a 2nd patch of a failure class already in .ai/learnings.jsonl)");

  // PostToolUse: Auto-lint after file edits + CHANGELOG check after commits
  const postToolUseHooks: HookEntry[] = [];

  if (project.stack.hasLinter) {
    postToolUseHooks.push({
      matcher: "Edit|Write",
      hooks: [
        {
          type: "command",
          command: buildPostToolUseLintScript(project),
          timeout: 10000,
        },
      ],
    });
    results.push("PostToolUse: auto-lint after file edits");
  }

  // CHANGELOG check: warn if feat/fix/refactor commit lacks CHANGELOG entry
  postToolUseHooks.push({
    matcher: "Bash",
    hooks: [
      {
        type: "command",
        command: buildChangelogCheckScript(),
        timeout: 5000,
      },
    ],
  });
  results.push("PostToolUse: CHANGELOG check for feat/fix/refactor commits");

  // Recurrence audit: catch script-issued commits the PreToolUse gate can't
  // block; record the recurrence + surface it so the next commit escalates.
  postToolUseHooks.push({
    matcher: "Bash",
    hooks: [
      {
        type: "command",
        command: buildRecurrenceAuditScript(),
        timeout: 8000,
      },
    ],
  });
  results.push("PostToolUse: recurrence audit (records + surfaces script-issued commits that bypass the gate)");

  // Live-data evidence gate (warn-only): when a durable artifact that records
  // data conclusions asserts a prod-data claim without a Claims Table, warn.
  postToolUseHooks.push({
    matcher: "Edit|Write",
    hooks: [
      {
        type: "command",
        command: buildLiveDataEvidenceScript(),
        timeout: 5000,
      },
    ],
  });
  results.push("PostToolUse: live-data evidence gate (warns when a solution/report/plan asserts a data claim with no Claims Table)");

  // Duplicate-component warn (warn-only): a new .tsx/.jsx export colliding
  // with a component name already exported elsewhere gets flagged to the
  // agent at the moment the duplicate is born. Mechanical floor for the
  // component-reuse rule.
  postToolUseHooks.push({
    matcher: "Edit|Write|MultiEdit",
    hooks: [
      {
        type: "command",
        command: buildComponentDupWarnScript(),
        timeout: 5000,
      },
    ],
  });
  results.push("PostToolUse: duplicate-component warn (flags a new component export whose name already exists elsewhere)");

  // Session heartbeat: touch this session's presence file after every tool
  // call so other sessions can tell live sessions from dead ones.
  postToolUseHooks.push({
    matcher: "",
    hooks: [
      {
        type: "command",
        command: buildSessionHeartbeatScript(),
        timeout: 5000,
      },
    ],
  });
  results.push("PostToolUse: session heartbeat (keeps this session's presence file fresh for other sessions)");

  // Browser claim: every browser MCP tool call stamps a per-session claim file
  // (mtime = heartbeat). Other sessions hitting "browser is busy" read these to
  // tell a live QA session from yesterday's dead one. Mechanical floor for the
  // browser-tooling-priority rule.
  postToolUseHooks.push({
    matcher: BROWSER_MCP_TOOL_MATCHER,
    hooks: [
      {
        type: "command",
        command: buildBrowserClaimScript(),
        timeout: 5000,
      },
    ],
  });
  results.push("PostToolUse: browser claim (records which session is driving a browser MCP surface, heartbeat via file mtime)");

  if (postToolUseHooks.length > 0) {
    hooks.PostToolUse = postToolUseHooks;
  }

  // Stop: Plan validation + dependency graph + workflow navigator + handoff reminder
  hooks.Stop = [
    {
      matcher: "",
      hooks: [
        {
          type: "command",
          command: buildStopScript(project),
          timeout: 15000,
        },
      ],
    },
    {
      matcher: "",
      hooks: [
        {
          type: "command",
          command: buildReplyTimestampScript(),
          timeout: 5000,
        },
      ],
    },
  ];
  hooks.Stop.push({
    matcher: "",
    hooks: [
      {
        type: "command",
        command: buildBrowserTeardownReminderScript(),
        timeout: 5000,
      },
    ],
  });
  results.push("Stop: plan validation + workflow navigator + handoff reminder");
  results.push("Stop: reply timestamp (stamps each reply with local date/time so session logs can reconstruct when work actually happened)");
  results.push("Stop: browser teardown reminder (nags when this session still holds a quiet browser claim — close tabs, release grants, release the claim)");

  // SessionStart: Checkpoint commit + Soloship update check
  hooks.SessionStart = [
    {
      matcher: "",
      hooks: [
        {
          type: "command",
          command: buildCheckpointScript(),
          timeout: 15000,
        },
      ],
    },
    {
      matcher: "",
      hooks: [
        {
          type: "command",
          command: buildUpgradeCheckScript(),
          timeout: 5000,
        },
      ],
    },
    {
      matcher: "",
      hooks: [
        {
          type: "command",
          command: buildSessionRegisterScript(),
          timeout: 10000,
        },
      ],
    },
  ];
  results.push("SessionStart: checkpoint commit before agent session");
  results.push("SessionStart: daily check for Soloship updates on npm");
  results.push("SessionStart: session presence (register this session, announce other live sessions in this repo)");

  // SessionEnd: release this session's browser claim so the next QA session
  // sees a free browser instead of a phantom "another session is using it".
  hooks.SessionEnd = [
    {
      matcher: "",
      hooks: [
        {
          type: "command",
          command: buildBrowserReleaseScript(),
          timeout: 5000,
        },
      ],
    },
  ];
  results.push("SessionEnd: browser claim release (frees this session's browser MCP claim when the session ends)");

  // Merge Soloship's hooks into settings, preserving user-custom hooks (and
  // other settings keys). Soloship stamps its own entries so a re-init replaces
  // exactly its own hooks — never duplicating them, never wiping the user's.
  settings.hooks = mergeSoloshipHooks(
    (settings.hooks as HooksConfig["hooks"]) || {},
    hooks
  );

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  results.push(`Written to .claude/settings.local.json`);

  return results;
}

function buildPreToolUseScript(): string {
  // Exit code 2 blocks the action
  return `bash -c '
COMMAND="$HOOK_TOOL_INPUT"

# Block rm -rf with home directory
if echo "$COMMAND" | grep -qE "rm\\s+-rf\\s+(~|/Users|/home|\\$HOME)"; then
  echo "BLOCKED: Dangerous rm -rf targeting home directory" >&2
  exit 2
fi

# Block .env edits
if echo "$COMMAND" | grep -qE "(cat|echo|printf|>).*\\.env($|\\s)"; then
  echo "BLOCKED: Direct .env file modification" >&2
  exit 2
fi

# Block force push to main/master
if echo "$COMMAND" | grep -qE "git\\s+push.*--force.*(main|master)"; then
  echo "BLOCKED: Force push to main/master" >&2
  exit 2
fi

# Block hardcoded API keys
if echo "$COMMAND" | grep -qE "(ANTHROPIC|OPENAI|STRIPE|FIREBASE)_.*_KEY.*=.*[a-zA-Z0-9]{20}"; then
  echo "BLOCKED: Possible hardcoded API key" >&2
  exit 2
fi

exit 0
'`;
}

function buildPostToolUseLintScript(project: ProjectInfo): string {
  const lintCmd =
    project.stack.hasLinter
      ? project.stack.packageManager === "bun"
        ? "bunx eslint --fix"
        : "npx eslint --fix"
      : "true";

  return `bash -c '
# Only lint if a source file was modified
FILE="$HOOK_MODIFIED_FILE"
if [ -n "$FILE" ] && echo "$FILE" | grep -qE "\\.(ts|tsx|js|jsx)$"; then
  ${lintCmd} "$FILE" 2>/dev/null || true
fi
'`;
}

function buildChangelogCheckScript(): string {
  return `bash -c '
# Only check if the last command was a git commit
COMMAND="$HOOK_TOOL_INPUT"
if echo "$COMMAND" | grep -qE "git\\s+commit"; then
  # Get the most recent commit message
  MSG=$(git log -1 --pretty=%s 2>/dev/null)
  # Only warn for feat/fix/refactor commits
  if echo "$MSG" | grep -qE "^(feat|fix|refactor):"; then
    # Check if CHANGELOG.md was modified in this commit
    if ! git diff-tree --no-commit-id --name-only -r HEAD 2>/dev/null | grep -q "CHANGELOG.md"; then
      echo "{\\"systemMessage\\": \\"Warning: commit \\\\\"$MSG\\\\\" has no CHANGELOG.md entry. Consider adding one to the [Unreleased] section.\\"}"
    fi
  fi
fi
exit 0
'`;
}

// Emit {"systemMessage": "<contents of $shellVar>"} as valid JSON.
//
// This replaces a hand-rolled `sed "s/\"/\\\\\"/g"` that appeared at two sites
// and was BROKEN at both: after template-literal and shell-quote expansion it
// rendered as `s//\\/g` — an empty regex — so sed exited with "first RE may not
// be empty" and the hook emitted nothing at all. Both hooks (Stop, phone-a-
// friend) have therefore been silently swallowing every message they ever had
// to say, and it only surfaced now because the plan-truth backstop is the first
// message reliably non-empty enough to notice. Found 2026-07-14.
//
// Hand-escaping JSON in shell is the bug. Delegate to a real JSON encoder:
// node is definitionally present (Soloship installs via npx). The tr fallback
// only strips what would break the JSON, so a degraded message still lands.
function emitSystemMessage(shellVar: string, expandEscapes = false): string {
  const producer = expandEscapes
    ? `printf "%b" "$${shellVar}"`
    : `printf "%s" "$${shellVar}"`;
  return `MSG_JSON=$(${producer})
  if command -v node >/dev/null 2>&1; then
    node -e "process.stdout.write(JSON.stringify({systemMessage: process.argv[1]}))" "$MSG_JSON"
  else
    SAFE=$(printf "%s" "$MSG_JSON" | tr -d "\\\\\\\\\\"" | tr "\\n" " ")
    echo "{\\"systemMessage\\": \\"$SAFE\\"}"
  fi`;
}

function buildPlanTruthGateScript(): string {
  // Gate A — plan-truth gate (PreToolUse/Bash). BLOCK a code commit on a branch
  // whose plan still says `planned`. That combination is a lie in progress: the
  // work has started, the plan says it hasn't.
  //
  // Discriminator that avoids the obvious false positive: a commit that stages
  // ONLY docs/ is the commit that WRITES the plan — at that moment `planned` is
  // true and correct. We block only when the commit stages code, i.e. when the
  // plan's claim and the repo's reality have actually diverged.
  //
  // Plan resolution is deliberately conservative: claim file first (exact), then
  // branch-slug match. No plan resolved => exit 0. This gate's job is to stop
  // plans from lying, not to force every commit to have a plan.
  return `bash -c '
TI="$HOOK_TOOL_INPUT"
[ -z "$TI" ] && exit 0
echo "$TI" | grep -qE "git[[:space:]]+commit" || exit 0
[ -f ${PLAN_STATUS_ACK} ] && exit 0
[ -d ${PLANS_DIR} ] || exit 0

# Only code commits can contradict a plan. A docs-only commit IS the plan being
# written or updated — "planned" is honest there.
STAGED=$(git diff --cached --name-only 2>/dev/null)
[ -z "$STAGED" ] && exit 0
echo "$STAGED" | grep -qv "^docs/" || exit 0

BRANCH=$(git branch --show-current 2>/dev/null)
[ -z "$BRANCH" ] && exit 0

# Resolve the plan: claim file for this branch first (exact), else branch-slug
# appearing in a plan filename.
PLAN=""
COORD="$(cd "$(git rev-parse --git-common-dir 2>/dev/null)" 2>/dev/null && pwd -P)/soloship"
if [ -d "$COORD/claims" ]; then
  for c in "$COORD/claims/"*.json; do
    [ -f "$c" ] || continue
    if grep -q "\\"branch\\":\\"$BRANCH\\"" "$c" 2>/dev/null; then
      CAND="${PLANS_DIR}/$(basename "$c" .json)"
      [ -f "$CAND" ] && PLAN="$CAND" && break
    fi
  done
fi
if [ -z "$PLAN" ]; then
  SLUG=$(echo "$BRANCH" | sed -E "s#^(feat|fix|chore|refactor)/##")
  for p in ${PLANS_DIR}/*.md; do
    [ -f "$p" ] || continue
    case "$(basename "$p")" in README.md) continue;; esac
    case "$(basename "$p")" in *"$SLUG"*) PLAN="$p"; break;; esac
  done
fi
[ -z "$PLAN" ] && exit 0

STATUS=$(grep -m1 -E "^status:" "$PLAN" 2>/dev/null | sed -E "s/^status:[[:space:]]*//" | tr -d "\\"" | tr "A-Z" "a-z")

# Legacy vocabulary maps onto the canonical one.
case "$STATUS" in
  "not started"|"not-started") STATUS="planned" ;;
esac

if [ "$STATUS" = "planned" ]; then
  echo "BLOCKED by plan-truth-gate: you are committing CODE on branch \\"$BRANCH\\", but its plan ($PLAN) still says \\"status: planned\\" — i.e. the plan claims this work has not started. That is exactly how plans come to lie about themselves: the work ships, the status never moves, and the next agent reads \\"not started\\" and builds it a second time.

FIX (5 seconds): set the plan frontmatter to
  status: in-progress
  claimed_by: <this session>
  branch: $BRANCH
  updated: $(date +%Y-%m-%d)
then re-run the commit. Flip it to \\"done\\" when the work merges.

Escape hatch (requires a real reason): mkdir -p .ai && echo \\"why a lying plan is correct here\\" > ${PLAN_STATUS_ACK}" >&2
  exit 2
fi
exit 0
'`;
}

function buildPlanNamespaceGateScript(): string {
  // Gate B — namespace gate (PreToolUse/Edit|Write). ${PLANS_DIR}/ holds plans
  // and nothing else. Before this gate it was an open directory: in one real
  // project, 9 of 17 files in it were drafts, grill outputs, handoffs, decision
  // logs, and a morning report — none carrying status frontmatter, all
  // indistinguishable from live plans at a glance.
  //
  // Blocking without routing would be hostile, so the block message names the
  // folder the file actually belongs in.
  return `bash -c '
TI="$HOOK_TOOL_INPUT"
[ -z "$TI" ] && exit 0
[ -f ${PLAN_STATUS_ACK} ] && exit 0

FP=$(echo "$TI" | grep -oE "\\"file_path\\"[[:space:]]*:[[:space:]]*\\"[^\\"]*\\"" | head -1 | sed -E "s/.*:[[:space:]]*\\"//; s/\\"$//")
[ -z "$FP" ] && exit 0

# Only .md directly under the plans dir. Archive and the folder README are exempt.
case "$FP" in
  *${PLANS_DIR}/*.md) ;;
  *) exit 0 ;;
esac
case "$FP" in
  *${PLANS_DIR}/archive/*) exit 0 ;;
  */README.md) exit 0 ;;
esac

# A canonical status anywhere in the payload counts as the file declaring one.
TI_HAS_STATUS=0
echo "$TI" | grep -qE "status:[[:space:]]*\\"?(${PLAN_STATUS_RE})" && TI_HAS_STATUS=1

DISK_HAS_STATUS=0
[ -f "$FP" ] && grep -qE "^status:[[:space:]]*\\"?(${PLAN_STATUS_RE})" "$FP" 2>/dev/null && DISK_HAS_STATUS=1

# Editing a plan that already declares a valid status: fine.
[ "$DISK_HAS_STATUS" = "1" ] && exit 0
# Writing/adding a valid status (including the edit that FIXES a statusless plan): fine.
[ "$TI_HAS_STATUS" = "1" ] && exit 0

echo "BLOCKED by plan-namespace-gate: \\"$FP\\" has no plan status frontmatter, and ${PLANS_DIR}/ holds live plans ONLY.

If this IS a plan, give it frontmatter:
  ---
  status: planned          # or: ${PLAN_STATUS_RE}
  date: $(date +%Y-%m-%d)
  ---

If it is NOT a plan, it belongs somewhere else:
  draft / design note / grill / brainstorm  ->  ${DRAFTS_DIR}/     (deleted when promoted to a plan)
  session handoff                           ->  ${HANDOFFS_DIR}/   (deleted when consumed)
  point-in-time report or snapshot          ->  ${REPORTS_DIR}/    (historical, never actionable)
  decision log / ADR                        ->  ${DECISIONS_DIR}/

Why: agents read ${PLANS_DIR}/ to decide what work is outstanding. Anything in there without a status is invisible to the plan-truth gate and indistinguishable from a live plan.

Escape hatch (requires a real reason): mkdir -p .ai && echo \\"reason\\" > ${PLAN_STATUS_ACK}" >&2
exit 2
'`;
}

function buildPlanGoalGateScript(): string {
  // Gate B2 — plan-completeness gate (PreToolUse/Edit|Write). A plan's success
  // criterion is the loop's termination condition: without an observable
  // "Done-When", an agent executing the plan has no mechanical way to know it is
  // finished, and "review rejects a plan missing them" is advisory markdown that
  // only fires if a human remembers to look. This makes it a real check.
  //
  // Same trigger and exemptions as the namespace gate. A plan must carry a
  // \`## Goal\` section (why the work exists) AND a \`## Done-When\` section (the
  // observable stop condition). Either present in the write payload OR already on
  // disk counts, so incremental edits to a complete plan are never blocked.
  return `bash -c '
TI="$HOOK_TOOL_INPUT"
[ -z "$TI" ] && exit 0
[ -f ${PLAN_STATUS_ACK} ] && exit 0

FP=$(echo "$TI" | grep -oE "\\"file_path\\"[[:space:]]*:[[:space:]]*\\"[^\\"]*\\"" | head -1 | sed -E "s/.*:[[:space:]]*\\"//; s/\\"$//")
[ -z "$FP" ] && exit 0

# Only .md directly under the plans dir. Archive and the folder README are exempt.
case "$FP" in
  *${PLANS_DIR}/*.md) ;;
  *) exit 0 ;;
esac
case "$FP" in
  *${PLANS_DIR}/archive/*) exit 0 ;;
  */README.md) exit 0 ;;
esac

# A section counts if it appears in the write payload OR already on disk.
has_section() {
  echo "$TI" | grep -qE "##[[:space:]]+$1" && return 0
  [ -f "$FP" ] && grep -qE "^##[[:space:]]+$1" "$FP" 2>/dev/null && return 0
  return 1
}

MISSING=""
has_section "Goal" || MISSING="$MISSING ## Goal"
has_section "Done-When" || MISSING="$MISSING ## Done-When"
[ -z "$MISSING" ] && exit 0

echo "BLOCKED by plan-completeness-gate: \\"$FP\\" is missing:$MISSING

Every plan needs a success criterion the work terminates against:
  ## Goal        — what this work is for, in one short paragraph.
  ## Done-When   — a numbered list of OBSERVABLE conditions that mean done
                   (a behavior you can watch, a file that exists, a test that
                   passes) — not \\"the code is written\\".

Without a Done-When, an agent executing this plan has no mechanical way to know
when to stop — which is the exact open-ended-loop failure this enforces against.

Escape hatch (requires a real reason): mkdir -p .ai && echo \\"why this plan has no Done-When\\" > ${PLAN_STATUS_ACK}" >&2
exit 2
'`;
}

function buildPlanMergeGateScript(): string {
  // Gate C — merge gate (PreToolUse/Bash). The merge is the moment the work
  // becomes real. A plan still marked in-progress (or planned) whose branch is
  // being merged is about to become a permanently lying plan — after the merge
  // there is no natural moment left that would prompt the flip to `done`.
  //
  // Rather than parse the merge command's branch argument (fragile: flags, -m
  // messages, heredocs), match in the other direction: for each open plan that
  // records a `branch:`, check whether the command mentions that branch.
  return `bash -c '
TI="$HOOK_TOOL_INPUT"
[ -z "$TI" ] && exit 0
echo "$TI" | grep -qE "git[[:space:]]+merge" || exit 0
[ -f ${PLAN_STATUS_ACK} ] && exit 0
[ -d ${PLANS_DIR} ] || exit 0

for p in ${PLANS_DIR}/*.md; do
  [ -f "$p" ] || continue
  case "$(basename "$p")" in README.md) continue;; esac

  STATUS=$(grep -m1 -E "^status:" "$p" 2>/dev/null | sed -E "s/^status:[[:space:]]*//" | tr -d "\\"" | tr "A-Z" "a-z")
  case "$STATUS" in
    "not started"|"not-started") STATUS="planned" ;;
    active) STATUS="in-progress" ;;
  esac
  echo "$STATUS" | grep -qE "^(${PLAN_STATUS_OPEN_RE})$" || continue

  PBRANCH=$(grep -m1 -E "^branch:" "$p" 2>/dev/null | sed -E "s/^branch:[[:space:]]*//" | tr -d "\\"" | tr -d "[:space:]")
  [ -z "$PBRANCH" ] && continue
  echo "$TI" | grep -qF "$PBRANCH" || continue

  echo "BLOCKED by plan-merge-gate: you are merging branch \\"$PBRANCH\\", but its plan ($p) still says \\"status: $STATUS\\". After this merge the work is live — and if the status never moves, the plan will claim forever that this work was never finished. That is the exact defect this gate exists to prevent.

FIX: set the plan frontmatter to
  status: done
  progress: \\"<total>/<total>\\"
  updated: $(date +%Y-%m-%d)
remove the claimed_by line, then re-run the merge.

If the work is genuinely NOT complete and you are merging partial work on purpose, set an honest status instead (blocked / superseded) and say so in the plan.

Escape hatch (requires a real reason): mkdir -p .ai && echo \\"reason\\" > ${PLAN_STATUS_ACK}" >&2
  exit 2
done
exit 0
'`;
}

export function buildMainCheckoutAuthorWarnScript(): string {
  // Main-checkout authoring warn (PreToolUse/Bash). WARN-ONLY, never blocks:
  // measured on Soloship main (14 days to 2026-08-02), 17 of 22 landings were
  // direct commits authored in the main checkout — a hard block would fire
  // constantly against current habit and risks locking the operator out
  // mid-task. The main checkout is the one contested directory in a
  // multi-session repo (see references/merge-sequence.md); authoring there is
  // the root behavior every documented git incident traces back to.
  //
  // Fires only when ALL hold: the command is a git commit (authoring — NOT
  // git merge, which merge-sequence handles without entering the main
  // checkout, and not tag ops, which are the deploy sequence's job), the
  // session is in the main checkout (GIT_DIR == GIT_COMMON), and other
  // worktrees exist (alone in the repo there is nobody to collide with).
  // Fail-safe: any internal error exits 0 silently.
  return `bash -c '
TI="$HOOK_TOOL_INPUT"
[ -z "$TI" ] && exit 0
echo "$TI" | grep -qE "git[[:space:]]+commit" || exit 0
GIT_DIR=$(cd "$(git rev-parse --git-dir 2>/dev/null)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir 2>/dev/null)" 2>/dev/null && pwd -P)
[ -n "$GIT_DIR" ] && [ -n "$GIT_COMMON" ] || exit 0
[ "$GIT_DIR" = "$GIT_COMMON" ] || exit 0
WT_COUNT=$(git worktree list --porcelain 2>/dev/null | grep -c "^worktree ")
[ "$WT_COUNT" -gt 1 ] 2>/dev/null || exit 0
WT_LIST=$(git worktree list 2>/dev/null | sed "s/^/  /")
MSG="WARN (main-checkout-authoring): you are committing in the MAIN CHECKOUT while \${WT_COUNT} worktrees are active - this directory is shared with every session that touches the default branch, and concurrent operations here scramble commits (index, working tree, and HEAD are all contested). Active worktrees:\\n\${WT_LIST}\\nRemedy: do this work in a worktree (soloship:using-git-worktrees) and land it via the shared merge sequence (references/merge-sequence.md), which never enters the main checkout. This is a warning only - the commit proceeds."
${emitSystemMessage("MSG", true)}
exit 0
'`;
}

function buildReplyTimestampScript(): string {
  // Emits {"systemMessage": "<local date/time>"} after every assistant reply.
  // Session-log tooling reads these stamps to reconstruct when work actually
  // happened — a session resumed days later would otherwise be dated by when
  // it was logged, not when it was done.
  return `date "+{\\"systemMessage\\": \\"${REPLY_TIMESTAMP_FORMAT}\\"}"`;
}

function buildStopScript(project: ProjectInfo): string {
  return `bash -c '
MESSAGES=""

# Plan validation: check for Key Decisions and Why lines
for plan in ${PLANS_DIR}/$(date +%Y)*.md; do
  if [ -f "$plan" ]; then
    if ! grep -q "Key Decisions" "$plan" 2>/dev/null; then
      MESSAGES="$MESSAGES Plan file $plan is missing a Key Decisions section."
      break
    fi
  fi
done

# Gate D — plan-truth backstop. Gates A and C catch commits and merges; this
# catches everything that never went through either (work done conversationally,
# on the default branch, or outside any skill). It is the evidence-based check
# /soloship:cleanup already performs — promoted from manual-and-weeks-late to
# automatic-and-now: a plan claiming open status whose branch is already merged
# into the default branch is, provably, lying.
DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed "s@^refs/remotes/origin/@@")
[ -z "$DEFAULT_BRANCH" ] && DEFAULT_BRANCH=main
if [ -d ${PLANS_DIR} ] && [ ! -f ${PLAN_STATUS_ACK} ]; then
  LIARS=""
  ORPHANS=""
  for plan in ${PLANS_DIR}/*.md; do
    [ -f "$plan" ] || continue
    case "$(basename "$plan")" in README.md) continue;; esac

    PSTATUS=$(grep -m1 -E "^status:" "$plan" 2>/dev/null | sed -E "s/^status:[[:space:]]*//" | tr -d "\\"" | tr "A-Z" "a-z")
    if [ -z "$PSTATUS" ]; then
      ORPHANS="$ORPHANS $plan"
      continue
    fi
    case "$PSTATUS" in
      "not started"|"not-started") PSTATUS="planned" ;;
      active) PSTATUS="in-progress" ;;
    esac
    echo "$PSTATUS" | grep -qE "^(${PLAN_STATUS_OPEN_RE})$" || continue

    PBRANCH=$(grep -m1 -E "^branch:" "$plan" 2>/dev/null | sed -E "s/^branch:[[:space:]]*//" | tr -d "\\"" | tr -d "[:space:]")
    [ -z "$PBRANCH" ] && continue
    git rev-parse --verify "$PBRANCH" >/dev/null 2>&1 || continue
    if git merge-base --is-ancestor "$PBRANCH" "$DEFAULT_BRANCH" 2>/dev/null; then
      LIARS="$LIARS $plan(says:$PSTATUS)"
    fi
  done
  if [ -n "$LIARS" ]; then
    MESSAGES="$MESSAGES PLAN STATUS CONTRADICTION —$LIARS: the branch is already merged into $DEFAULT_BRANCH, so this work is LIVE, but the plan still claims it is not done. Fix the status now (status: done) — a lying plan can send the next agent to rebuild shipped work."
  fi
  if [ -n "$ORPHANS" ]; then
    MESSAGES="$MESSAGES NOT A PLAN? —$ORPHANS: no status frontmatter. ${PLANS_DIR}/ holds live plans only. Give it a status, or move it (draft -> ${DRAFTS_DIR}/, handoff -> ${HANDOFFS_DIR}/, report -> ${REPORTS_DIR}/, decision log -> ${DECISIONS_DIR}/)."
  fi
fi

# Dependency graph generation removed.

# Workflow navigator: detect what just happened and suggest next step
LAST_COMMIT=$(git log -1 --pretty=%s 2>/dev/null || true)
RECENT_PLANS=$(find docs/plans -maxdepth 1 -name "*.md" -newer docs/plans/archive -type f 2>/dev/null | head -1)
HAS_STAGED=$(git diff --cached --name-only 2>/dev/null | head -1)
HAS_UNSTAGED=$(git diff --name-only 2>/dev/null | head -1)

# If a plan was just written, suggest next step
if [ -n "$RECENT_PLANS" ] && [ -f "$RECENT_PLANS" ]; then
  PLAN_AGE=$(( $(date +%s) - $(stat -f %m "$RECENT_PLANS" 2>/dev/null || stat -c %Y "$RECENT_PLANS" 2>/dev/null || echo 0) ))
  if [ "$PLAN_AGE" -lt 120 ]; then
    MESSAGES="$MESSAGES Plan written. Design what it looks like, then run /soloship-implement to execute."
  fi
fi

# If code was just committed, suggest ship or learn
if echo "$LAST_COMMIT" | grep -qE "^(feat|fix|refactor):" 2>/dev/null; then
  COMMIT_AGE=$(( $(date +%s) - $(git log -1 --format=%ct 2>/dev/null || echo 0) ))
  if [ "$COMMIT_AGE" -lt 120 ]; then
    MESSAGES="$MESSAGES Code committed. Run /soloship-shipfast to deploy or /soloship-shipthorough for full review."
  fi
fi

# Handoff reminder: if session has been active 30+ min, nudge for state capture
SESSION_FILE=".ai/.session-start"
if [ ! -f "$SESSION_FILE" ]; then
  mkdir -p .ai
  date +%s > "$SESSION_FILE"
fi
SESSION_START=$(cat "$SESSION_FILE" 2>/dev/null || echo 0)
NOW=$(date +%s)
ELAPSED=$(( NOW - SESSION_START ))
HANDOFF_FILE=".ai/.last-handoff"
LAST_HANDOFF=$(cat "$HANDOFF_FILE" 2>/dev/null || echo 0)
SINCE_HANDOFF=$(( NOW - LAST_HANDOFF ))

# Remind every 30 minutes
if [ "$ELAPSED" -gt 1800 ] && [ "$SINCE_HANDOFF" -gt 1800 ]; then
  if [ -n "$HAS_STAGED" ] || [ -n "$HAS_UNSTAGED" ]; then
    MESSAGES="$MESSAGES Session active 30+ min with uncommitted work. Consider writing a handoff note: state of work + next tiny action."
    echo "$NOW" > "$HANDOFF_FILE"
  fi
fi

# Output combined message if any
if [ -n "$MESSAGES" ]; then
  ${emitSystemMessage("MESSAGES")}
fi
'`;
}

function buildCheckpointScript(): string {
  // Creates a checkpoint at session start so the user can rollback.
  // Saves HEAD commit SHA and, if uncommitted changes exist, a stash snapshot SHA.
  // Uses git stash create — creates a snapshot commit object WITHOUT modifying
  // the working directory or the stash list. Zero side effects.
  return `bash -c '
# Only run in a git repo
if ! git rev-parse --is-inside-work-tree &>/dev/null; then
  exit 0
fi

# Check if there are any commits yet
if ! git rev-parse HEAD &>/dev/null; then
  exit 0
fi

CHECKPOINT_DIR=".ai"
mkdir -p "$CHECKPOINT_DIR"

# Save current HEAD as the checkpoint
git rev-parse HEAD > "$CHECKPOINT_DIR/.last-checkpoint" 2>/dev/null

# If there are uncommitted changes, snapshot them without modifying working tree.
# git stash create returns a SHA but does NOT push to stash list or touch files.
STASH_SHA=$(git stash create 2>/dev/null)
if [ -n "$STASH_SHA" ]; then
  echo "$STASH_SHA" > "$CHECKPOINT_DIR/.last-checkpoint-stash"
  echo "{\\"systemMessage\\": \\"Safety snapshot saved. Your current work is preserved. If anything goes wrong, run: npx soloship rollback\\"}"
else
  rm -f "$CHECKPOINT_DIR/.last-checkpoint-stash"
  echo "{\\"systemMessage\\": \\"Safety snapshot saved. If anything goes wrong, run: npx soloship rollback\\"}"
fi
'`;
}

function buildUpgradeCheckScript(): string {
  // Once-per-day check for newer Soloship releases. Detects whether the user
  // installed via npm (.soloship/version present) or via Claude Code plugin
  // marketplace only (plugin.json present, no .soloship/version) and shows
  // the appropriate upgrade command for each. Silent if up-to-date, network
  // unavailable, or installed version cannot be determined.
  return `bash -c '
SOLOSHIP_DIR=".soloship"
VERSION_FILE="$SOLOSHIP_DIR/version"
CACHE_FILE="$SOLOSHIP_DIR/.last-update-check"
PLUGIN_MANIFEST="$HOME/.claude/plugins/marketplaces/soloship/.claude-plugin/plugin.json"

# Determine installed version + install path
INSTALLED=""
INSTALL_PATH=""
if [ -f "$VERSION_FILE" ]; then
  INSTALLED=$(cat "$VERSION_FILE" 2>/dev/null | head -n1 | tr -d "[:space:]")
  INSTALL_PATH="npm"
elif [ -f "$PLUGIN_MANIFEST" ]; then
  INSTALLED=$(grep -E "\\"version\\"" "$PLUGIN_MANIFEST" 2>/dev/null | head -n1 | sed -E "s/.*\\"version\\"[[:space:]]*:[[:space:]]*\\"([^\\"]+)\\".*/\\\\1/" | tr -d "[:space:]")
  INSTALL_PATH="plugin"
fi

[ -z "$INSTALLED" ] && exit 0

# Cache (npm-path projects keep cache in .soloship/; plugin-path falls back to /tmp)
if [ "$INSTALL_PATH" = "plugin" ]; then
  CACHE_FILE="/tmp/.soloship-update-check-$(id -u)"
fi

NOW=$(date +%s)
LATEST=""
if [ -f "$CACHE_FILE" ]; then
  CACHED_TS=$(sed -n 1p "$CACHE_FILE" 2>/dev/null)
  CACHED_VER=$(sed -n 2p "$CACHE_FILE" 2>/dev/null)
  if [ -n "$CACHED_TS" ] && [ $((NOW - CACHED_TS)) -lt 86400 ]; then
    LATEST="$CACHED_VER"
  fi
fi

if [ -z "$LATEST" ]; then
  # Prefer npm for the source-of-truth version (npm + plugin ship from same repo).
  # If npm isn't available, fall back to the GitHub raw plugin.json on main.
  if command -v npm >/dev/null 2>&1; then
    LATEST=$(timeout 3 npm view soloship version 2>/dev/null | tr -d "[:space:]")
  fi
  if [ -z "$LATEST" ] && command -v curl >/dev/null 2>&1; then
    LATEST=$(timeout 3 curl -sf "https://raw.githubusercontent.com/thedigitalorganizer/soloship/main/.claude-plugin/plugin.json" 2>/dev/null | grep -E "\\"version\\"" | head -n1 | sed -E "s/.*\\"version\\"[[:space:]]*:[[:space:]]*\\"([^\\"]+)\\".*/\\\\1/" | tr -d "[:space:]")
  fi
  [ -z "$LATEST" ] && exit 0
  mkdir -p "$(dirname "$CACHE_FILE")" 2>/dev/null
  printf "%s\\n%s\\n" "$NOW" "$LATEST" > "$CACHE_FILE" 2>/dev/null
fi

if [ "$INSTALLED" != "$LATEST" ]; then
  NEWEST=$(printf "%s\\n%s\\n" "$INSTALLED" "$LATEST" | sort -V | tail -n1)
  if [ "$NEWEST" = "$LATEST" ]; then
    if [ "$INSTALL_PATH" = "plugin" ]; then
      echo "{\\"systemMessage\\": \\"Soloship update available: $INSTALLED → $LATEST. Update via Claude Code: type /plugins, find Soloship, click Update.\\"}"
    else
      echo "{\\"systemMessage\\": \\"Soloship update available: $INSTALLED → $LATEST. Run: npx soloship upgrade\\"}"
    fi
  fi
fi

exit 0
'`;
}

function buildPhoneAFriendScript(): string {
  // Phone-a-friend: warn on git commit/push when staged changes match risk heuristics.
  // All 6 checks use git diff and the filesystem only — no conversation parsing, no AI judgment.
  // Exit 0 always (warn, never block). Warnings via systemMessage JSON.
  return `bash -c '
COMMAND="$HOOK_TOOL_INPUT"

# Only check git commit commands (push has no staged changes to check)
if ! echo "$COMMAND" | grep -qE "git\\s+commit"; then
  exit 0
fi

WARNINGS=""

STAGED=$(git diff --cached --name-only 2>/dev/null)
if [ -z "$STAGED" ]; then
  exit 0
fi

# --- Heuristic 1: Files outside declared source directories ---
# Detect source dirs from filesystem at runtime
SRC_PATTERN=""
for d in src lib app pages components routes services models views controllers public static assets; do
  if [ -d "$d" ]; then
    SRC_PATTERN="$SRC_PATTERN|$d"
  fi
done
SRC_PATTERN="\${SRC_PATTERN#|}"

if [ -n "$SRC_PATTERN" ]; then
  KNOWN_DIRS="$SRC_PATTERN|tests?|__tests__|spec|__arch__|docs|doc|bin|scripts|dist|build|node_modules|\\.github|\\.claude"
  KNOWN_ROOT="^(package\\.json|tsconfig.*\\.json|README.*|CLAUDE\\.md|AGENTS\\.md|CHANGELOG\\.md|\\.gitignore|\\.eslintrc.*|eslint\\.config.*|prettier.*|vite\\.config.*|next\\.config.*|jest\\.config.*|vitest\\.config.*)$"

  while IFS= read -r file; do
    [ -z "$file" ] && continue
    DIR_PART=$(echo "$file" | cut -d/ -f1)
    # Skip files in known directories
    if echo "$DIR_PART" | grep -qE "^($KNOWN_DIRS)$"; then
      continue
    fi
    # Skip known root-level files
    BASENAME=$(basename "$file")
    if echo "$BASENAME" | grep -qE "$KNOWN_ROOT"; then
      continue
    fi
    WARNINGS="$WARNINGS  - File outside source directories: $file\\n"
  done <<< "$STAGED"
fi

# --- Heuristic 2: Configuration file changes ---
while IFS= read -r file; do
  [ -z "$file" ] && continue
  if echo "$file" | grep -qiE "\\.(env|env\\..+)$|\\.env$"; then
    WARNINGS="$WARNINGS  - Environment file changed: $file\\n"
  elif echo "$file" | grep -qiE "(^|/)(\\.github/|Dockerfile|docker-compose|wrangler\\.toml|vercel\\.json|firebase\\.json|netlify\\.toml|fly\\.toml|\\.circleci/)"; then
    WARNINGS="$WARNINGS  - CI/deploy config changed: $file\\n"
  elif echo "$file" | grep -qiE "(package-lock\\.json|yarn\\.lock|pnpm-lock\\.yaml|bun\\.lockb|bun\\.lock|Gemfile\\.lock|Pipfile\\.lock|poetry\\.lock)$"; then
    WARNINGS="$WARNINGS  - Lock file changed: $file\\n"
  fi
done <<< "$STAGED"

# --- Heuristic 3: New dependencies added ---
while IFS= read -r file; do
  [ -z "$file" ] && continue
  if echo "$file" | grep -qE "(package\\.json|requirements\\.txt|Gemfile|Pipfile|pyproject\\.toml|go\\.mod|Cargo\\.toml|pom\\.xml|build\\.gradle)$"; then
    # Check if dependency sections have additions (+ lines in the diff)
    ADDITIONS=$(git diff --cached -- "$file" 2>/dev/null | grep -cE "^\\+.*(dependencies|require|gem |install_requires)" || true)
    if [ "$ADDITIONS" -gt 0 ]; then
      WARNINGS="$WARNINGS  - New dependency added (check $file)\\n"
    fi
  fi
done <<< "$STAGED"

# --- Heuristic 4: Auth/migration/env/secret file patterns ---
while IFS= read -r file; do
  [ -z "$file" ] && continue
  if echo "$file" | grep -qiE "(auth|migration|migrate|secret|credential|security|permission|token|password|session|oauth|jwt|api.?key)"; then
    WARNINGS="$WARNINGS  - Security-sensitive file changed: $file\\n"
  fi
done <<< "$STAGED"

# --- Heuristic 5: Large diffs (>300 lines added+removed) ---
DIFF_STAT=$(git diff --cached --numstat 2>/dev/null | awk "{ added += \\$1; removed += \\$2 } END { print added + removed }")
if [ -n "$DIFF_STAT" ] && [ "$DIFF_STAT" -gt 300 ] 2>/dev/null; then
  WARNINGS="$WARNINGS  - Large change: $DIFF_STAT lines added+removed (threshold: 300)\\n"
fi

# --- Heuristic 6: Removal of validation/sanitization patterns ---
REMOVED_VALIDATION=$(git diff --cached 2>/dev/null | grep -cE "^-.*(sanitize|validate|escape|parameteriz|prepared.?statement|htmlspecialchars|encodeURI|DOMPurify|csrf|xss|sql.?inject|input.?valid)" || true)
if [ "$REMOVED_VALIDATION" -gt 0 ]; then
  WARNINGS="$WARNINGS  - Validation/sanitization code removed ($REMOVED_VALIDATION lines)\\n"
fi

# --- Output warnings ---
if [ -n "$WARNINGS" ]; then
  MSG="PHONE A FRIEND — Get a second opinion on these changes before shipping:\\n\\n$WARNINGS\\nAsk a developer you trust, post in a coding community (Reddit, Discord, forum), or use a code review service. Non-obvious changes are where bugs hide."
  ${emitSystemMessage("MSG", true)}
fi

exit 0
'`;
}

function buildSecurityScanScript(): string {
  // Automated security scanning: runs Semgrep on staged files before git commit.
  // Deterministic tool-based scanning, not AI-based — the fox doesn't guard the henhouse.
  // Blocks on critical findings (exit 2), warns on medium (exit 0 + systemMessage).
  // Gracefully skips if semgrep is not installed (with install instructions).
  return `bash -c '
COMMAND="$HOOK_TOOL_INPUT"

# Only check git commit commands
if ! echo "$COMMAND" | grep -qE "git\\s+commit"; then
  exit 0
fi

STAGED=$(git diff --cached --name-only 2>/dev/null)
if [ -z "$STAGED" ]; then
  exit 0
fi

# Check if semgrep is available
if ! command -v semgrep &>/dev/null; then
  if [ -f ".semgrep.yml" ] || [ -d ".semgrep" ]; then
    echo "{\\"systemMessage\\": \\"Security scan skipped: semgrep not installed. Install with: pip install semgrep (or pipx install semgrep)\\"}"
  fi
  exit 0
fi

# Only scan source files that are staged
SCAN_FILES=""
while IFS= read -r file; do
  [ -z "$file" ] && continue
  if echo "$file" | grep -qE "\\.(ts|tsx|js|jsx|py|rb|go|java|php|rs)$"; then
    if [ -f "$file" ]; then
      SCAN_FILES="$SCAN_FILES $file"
    fi
  fi
done <<< "$STAGED"

if [ -z "$SCAN_FILES" ]; then
  exit 0
fi

# Use project config if available, otherwise OWASP rules
SEMGREP_CONFIG=".semgrep.yml"
if [ ! -f "$SEMGREP_CONFIG" ] && [ ! -d ".semgrep" ]; then
  SEMGREP_CONFIG="p/owasp-top-ten"
fi

# Run scan, capture output
RESULTS=$(semgrep --config "$SEMGREP_CONFIG" --json $SCAN_FILES 2>/dev/null || true)

if [ -z "$RESULTS" ]; then
  exit 0
fi

# Count findings by severity using grep (no python3 dependency)
CRITICAL=$(echo "$RESULTS" | grep -cE "\\"severity\\"[[:space:]]*:[[:space:]]*\\"ERROR\\"" 2>/dev/null || echo "0")
MEDIUM=$(echo "$RESULTS" | grep -cE "\\"severity\\"[[:space:]]*:[[:space:]]*\\"WARNING\\"" 2>/dev/null || echo "0")

# Block on critical findings
if [ "$CRITICAL" -gt 0 ]; then
  echo "BLOCKED: Semgrep found $CRITICAL critical security finding(s). Run: semgrep --config $SEMGREP_CONFIG to see details." >&2
  exit 2
fi

# Warn on medium findings
if [ "$MEDIUM" -gt 0 ]; then
  echo "{\\"systemMessage\\": \\"Security scan: $MEDIUM medium-severity finding(s). Run semgrep for details. Consider fixing before shipping.\\"}"
fi

exit 0
'`;
}

function buildDeployFreshnessScript(): string {
  // Deploy-freshness gate. The single most expensive recurring friction (per
  // /insights across 185 sessions) is correct code that never reaches prod
  // because a build or migration step was skipped before deploy. This hook is
  // the mechanical floor for that:
  //
  //   1. BLOCK (exit 2) a deploy that ships a LOCAL build artifact when the
  //      newest source file is newer than the newest artifact file AND the
  //      deploy command (or the npm "deploy" script it calls) does not itself
  //      run a build. This is the exact stale-frontend-bundle bug.
  //   2. WARN (exit 0 + systemMessage) on D1-backed wrangler deploys that are
  //      not "migrations apply" — unapplied migrations don't auto-deploy.
  //
  // Auto-passes remote-build platforms (Vercel) where local artifact mtime is
  // irrelevant, and any command that visibly builds. Pure filesystem + git +
  // package.json inspection — no AI judgment, no conversation parsing.
  return `bash -c '
COMMAND="$HOOK_TOOL_INPUT"

# Only engage on deploy commands
if ! echo "$COMMAND" | grep -qE "(firebase[[:space:]]+deploy|wrangler[[:space:]]+(pages[[:space:]]+deploy|deploy)|netlify[[:space:]]+deploy|fly[[:space:]]+deploy|vercel([[:space:]]|$)|(npm|pnpm|yarn|bun)([[:space:]]+run)?[[:space:]]+deploy)"; then
  exit 0
fi

# --- D1 unapplied-migration warning (warn only; cannot know remote state) ---
if echo "$COMMAND" | grep -qE "wrangler[[:space:]]+(pages[[:space:]]+deploy|deploy)" \\
   && ! echo "$COMMAND" | grep -qE "d1[[:space:]]+migrations[[:space:]]+apply" \\
   && [ -f wrangler.toml ] && grep -qE "\\[\\[d1_databases\\]\\]" wrangler.toml 2>/dev/null \\
   && [ -d migrations ] && ls migrations/*.sql >/dev/null 2>&1; then
  echo "{\\"systemMessage\\": \\"Deploy targets a D1-backed Worker. Schema migrations do NOT ship with a wrangler deploy — confirm wrangler d1 migrations apply has been run for any new files in migrations/, or the deployed code will hit a stale schema.\\"}"
fi

# --- Stale-artifact block ---

# Remote-build platforms build server-side; local artifact mtime is irrelevant.
if echo "$COMMAND" | grep -qE "vercel([[:space:]]|$)|netlify[[:space:]]+deploy|fly[[:space:]]+deploy"; then
  exit 0
fi

# Locate a build-output directory
ARTIFACT_DIR=""
for d in dist build .next out .output/public public/build; do
  if [ -d "$d" ]; then ARTIFACT_DIR="$d"; break; fi
done
[ -z "$ARTIFACT_DIR" ] && exit 0

# No build script => the artifact dir is not a build product (e.g. hand-authored
# static public/). Nothing to be stale against.
if [ ! -f package.json ] || ! grep -qE "\\"build\\"[[:space:]]*:" package.json; then
  exit 0
fi

# Does the deploy command itself run a build?
RUNS_BUILD=0
if echo "$COMMAND" | grep -qE "(npm|pnpm|yarn|bun)([[:space:]]+run)?[[:space:]]+build|vite[[:space:]]+build|next[[:space:]]+build|(^|[[:space:];&|])tsc([[:space:]]|$)"; then
  RUNS_BUILD=1
fi
# If it invokes the npm "deploy" script, inspect that script for a build step
if [ "$RUNS_BUILD" -eq 0 ] && echo "$COMMAND" | grep -qE "(npm|pnpm|yarn|bun)([[:space:]]+run)?[[:space:]]+deploy"; then
  DEPLOY_SCRIPT=$(node -p "(require(\\"./package.json\\").scripts||{}).deploy||\\"\\"" 2>/dev/null)
  if echo "$DEPLOY_SCRIPT" | grep -qE "build|vite|next build|tsc"; then
    RUNS_BUILD=1
  fi
fi
[ "$RUNS_BUILD" -eq 1 ] && exit 0

# Newest file currently in the artifact dir
NEWEST_ARTIFACT=$(find "$ARTIFACT_DIR" -type f 2>/dev/null -print0 | xargs -0 ls -t 2>/dev/null | head -1)
[ -z "$NEWEST_ARTIFACT" ] && exit 0

# Any source file newer than the freshest artifact => artifact is stale.
# Single pruned find from repo root so it catches both root-level entrypoints
# (simple projects keep their main file at root, not under src/) and nested
# source dirs, while skipping build output, deps, and VCS noise.
STALE=$(find . \\
  \\( -path "./$ARTIFACT_DIR" -o -name node_modules -o -name .git -o -name dist -o -name build -o -name .next -o -name out -o -name .output -o -name .worktrees -o -name .ai \\) -prune \\
  -o -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.mjs" -o -name "*.cjs" -o -name "*.css" -o -name "*.scss" -o -name "*.html" -o -name "*.vue" -o -name "*.svelte" -o -name "*.astro" \\) -newer "$NEWEST_ARTIFACT" -print 2>/dev/null \\
  | grep -vE "\\.(config|test|spec)\\.(js|ts|mjs|cjs|jsx|tsx)$" | head -3)

if [ -n "$STALE" ]; then
  EXAMPLE=$(echo "$STALE" | head -1)
  echo "BLOCKED: build artifact ($ARTIFACT_DIR/) is older than your source (e.g. $EXAMPLE). This deploy command does not run a build, so it would ship a STALE bundle and your fix would not reach production. Run your build (npm run build) first, then deploy." >&2
  exit 2
fi

exit 0
'`;
}

function buildBillingGateScript(): string {
  // Billing / credit / rerun-window confirmation gate. The single most
  // expensive recurring friction was money/credit code written on an assumed
  // data model, shipped, then discovered wrong — two backfill rounds + reverts.
  // This is the mechanical floor for the billing-confirmation-gate rule:
  // BLOCK (exit 2) any Edit/Write to billing-state code until the agent has
  // confirmed the data-model semantics with the user and recorded it in
  // .ai/.billing-ack. The ack file is the escape hatch — the rule forbids
  // creating it without an actual confirmation.
  return `bash -c '
TI="$HOOK_TOOL_INPUT"
[ -z "$TI" ] && exit 0

# Already confirmed for this working area => stand down.
if [ -f .ai/.billing-ack ]; then
  exit 0
fi

# Strong trigger: the target file path itself is billing/credit/window code.
PATH_HIT=$(echo "$TI" | grep -oiE "\\"(file_)?path\\"[[:space:]]*:[[:space:]]*\\"[^\\"]*(billing|credit|invoice|subscription|proration|payout|ledger|stripe|rerun[-_]?window|grace[-_]?period|trial[-_]?(length|end|days))[^\\"]*\\"" | head -1)

# Content trigger: the change introduces/edits billing-state identifiers.
CONTENT_HIT=$(echo "$TI" | grep -oiE "(credit[_-]?balance|creditBalance|credits?[[:space:]]*[-+]?=|rerun[_-]?window|rerunWindow|grace[_-]?period|trial[_-]?(ends?|end_at|length|days)|amount[_-]?due|amountDue|invoice|subscription|proration|refund|stripe\\.[a-z]|charge[A-Z_])" | head -1)

if [ -z "$PATH_HIT" ] && [ -z "$CONTENT_HIT" ]; then
  exit 0
fi

WHY="$PATH_HIT"
[ -z "$WHY" ] && WHY="$CONTENT_HIT"

echo "BLOCKED by billing-confirmation-gate: this edit touches billing / credit / rerun-window state (matched: $WHY). Per the billing-confirmation-gate rule, you must FIRST confirm the data-model semantics with the user — unit & sign (cents vs dollars, balance vs delta), idempotency (what a double-run does), the window boundary (inclusive/exclusive, timezone), and backfill scope (which rows, before/after counts). Do NOT write this code until the user confirms. After they confirm, record it: mkdir -p .ai && echo \\"confirmed: <what> ($(date +%Y-%m-%d))\\" > .ai/.billing-ack — then this gate stands down. Creating that file without an actual confirmation removes the protection this gate provides — if the gate seems wrong, surface that to the user instead." >&2
exit 2
'`;
}

// File extensions the duplicate-component warn hook inspects. v1 is React-only
// (.tsx/.jsx); the LLM-driven component-inventory skill covers .vue/.svelte.
// Extending the hook to other frameworks is a one-line change here.
const COMPONENT_HOOK_EXTENSIONS_RE = "\\.(tsx|jsx)$";
// git grep pathspecs matching the same extensions — repo-wide (tracked files
// only, so node_modules is skipped by construction; no hardcoded source-dir
// list, so monorepos / packages/ui / route-local components are covered).
const COMPONENT_HOOK_PATHSPECS = `-- "*.tsx" "*.jsx"`;
// Component declaration pattern: an exported PascalCase function/const/class.
// By construction this EXCLUDES re-exports (`export { X } from`,
// `export * from`) and type-only exports (`export type X`) — none of those
// have function|const|class after `export`. `export const X = memo(...)` and
// `forwardRef(...)` assignments match via the const form.
const COMPONENT_DECL_RE =
  "export[[:space:]]+(default[[:space:]]+)?(async[[:space:]]+)?(function|const|class)[[:space:]]+[A-Z][A-Za-z0-9_]*";

export function buildComponentDupWarnScript(): string {
  // Duplicate-component warn hook (PostToolUse/Edit|Write). Mechanical floor
  // for the component-reuse rule at the moment a duplicate is born: when a
  // just-written .tsx/.jsx file exports a component whose name is already
  // exported by another file, surface a warning to the agent (stderr + exit 2
  // on PostToolUse = shown to Claude, never blocks — the write already
  // happened; same warn pattern as the live-data evidence gate).
  //
  // Detection ceiling is deliberate: name collisions only — the cheap
  // real-time layer. Same-purpose components with DIFFERENT names are caught
  // upstream (component-inventory dup-flagging, review lenses). Fail-safe:
  // any internal error (not a git repo, grep failure) exits 0 silently — a
  // warn hook must never break an edit.
  return `bash -c '
FILE="$HOOK_MODIFIED_FILE"
[ -n "$FILE" ] || exit 0
echo "$FILE" | grep -qE "${COMPONENT_HOOK_EXTENSIONS_RE}" || exit 0
[ -f "$FILE" ] || exit 0
DIR=$(dirname "$FILE")
git -C "$DIR" rev-parse --show-toplevel >/dev/null 2>&1 || exit 0
TOP=$(git -C "$DIR" rev-parse --show-toplevel 2>/dev/null) || exit 0
REL=$(git -C "$DIR" ls-files --full-name --error-unmatch "$FILE" 2>/dev/null)
NAMES=$(grep -hoE "${COMPONENT_DECL_RE}" "$FILE" 2>/dev/null | grep -oE "[A-Z][A-Za-z0-9_]*$" | sort -u)
[ -n "$NAMES" ] || exit 0
WARN=""
for NAME in $NAMES; do
  # Boundary class instead of \\b — macOS git grep ERE has no \\b support
  # (found by the fixture tests: \\b matched nothing and the fail-safe
  # silently swallowed the miss).
  HITS=$(git -C "$TOP" grep -lE "export[[:space:]]+(default[[:space:]]+)?(async[[:space:]]+)?(function|const|class)[[:space:]]+$NAME([^A-Za-z0-9_]|$)" ${COMPONENT_HOOK_PATHSPECS} 2>/dev/null | grep -v "^$REL\$" || true)
  if [ -n "$HITS" ]; then
    WARN="$WARN component $NAME already exported by: $(echo "$HITS" | tr "\\n" " ");"
  fi
done
[ -z "$WARN" ] && exit 0
echo "WARN (component-reuse): $FILE exports$WARN Reuse or extend the existing component if it serves the same purpose, or rename if genuinely different. Check docs/architecture/COMPONENTS.md (regenerate with /soloship:component-inventory) and apply the rule of three — see the component-reuse rule." >&2
exit 2
'`;
}

function buildLiveDataEvidenceScript(): string {
  // Live-data evidence gate (PostToolUse/Edit|Write). Mechanical floor for the
  // live-data-evidence-gate rule at the durable-write boundary. WARN-ONLY (the
  // write already happened; this is PostToolUse): if a doc that records data
  // conclusions (docs/solutions, docs/reports, a plan file) asserts a
  // production-data claim but carries no Claims Table, surface a warning so the
  // agent adds provenance or labels it inferred. Narrow scope + high-precision
  // phrase list keeps false-positives low — a noisy hook gets disabled, and a
  // hard block on a heuristic trains ignore-the-warning behavior. It cannot
  // judge truth; it only checks a Claims Table is present when a data claim is.
  return `bash -c '
TI="$HOOK_TOOL_INPUT"
[ -z "$TI" ] && exit 0

# Only artifacts that record data conclusions. Not every docs/ write.
echo "$TI" | grep -qiE "\\"(file_)?path\\"[[:space:]]*:[[:space:]]*\\"[^\\"]*(docs/solutions/|docs/reports/|docs/plans/)[^\\"]*\\.md\\"" || exit 0

# High-precision data-claim phrases (precision-first to keep noise low).
CLAIM=$(echo "$TI" | grep -oiE "(matched exactly|reconciles? to|reconciled to|already linked|no[nt]?[- ]?existent|does not exist|doesn.t exist|is free|free to link|numbers? match)" | head -1)
[ -z "$CLAIM" ] && exit 0

# Provenance present? A Claims Table shows a verdict column / confirmed|inferred.
if echo "$TI" | grep -qiE "(claims? table|\\| *verdict|confirmed|inferred|provenance)"; then
  exit 0
fi

echo "WARN (live-data-evidence-gate): this artifact asserts a live-data claim (matched: \\"$CLAIM\\") but carries no Claims Table. Per the live-data-evidence-gate rule, back the claim with a provenance-complete row (claim | exact query | environment | timestamp | result+rowcount | verdict) or label it inferred. Run the evidence loop (references/evidence-loop.md)." >&2
exit 2
'`;
}

function buildRecurrenceGateScript(): string {
  // Recurrence gate (PreToolUse/Bash). Externalizes the one cross-session
  // function only the user does today: noticing the SAME non-fix has been
  // applied before. /clear wipes the agent's memory; .ai/learnings.jsonl does
  // not. On git commit this reads that existing ledger (never a new file),
  // counts mechanical matches (staged-file ∩ components AND message-token ∩
  // key/insight), and escalates: 0=silent, 1=block, 2+=hard stop with history.
  // Structurally a clone of the billing gate: PreToolUse block + .ai/-ack
  // escape hatch. No LLM judgment — match is deterministic on existing schema.
  // Spec: docs/plans/2026-05-16-recurrence-gate.md.
  return `bash -c '
TI="$HOOK_TOOL_INPUT"
[ -z "$TI" ] && exit 0
echo "$TI" | grep -qE "git[[:space:]]+commit" || exit 0

L=.ai/learnings.jsonl
[ -f "$L" ] || exit 0

STAGED=$(git diff --cached --name-only 2>/dev/null | tr "A-Z" "a-z")
[ -z "$STAGED" ] && exit 0

# Commit message + degraded detection. Heredoc bodies (CE/soloship use them
# heavily) cannot be token-parsed from the command string — fall back to
# file-overlap-only and WARN instead of block at the 1-match tier.
DEGRADED=0
if echo "$TI" | grep -qE "<<.{0,6}EOF|<<-?[A-Za-z_]+"; then
  DEGRADED=1
  MSG=""
else
  MSG=$(echo "$TI" | grep -oE -- "-m[[:space:]]+\\"[^\\"]*\\"" | head -1 | sed -E "s/^-m[[:space:]]+\\"//; s/\\"$//")
  [ -z "$MSG" ] && DEGRADED=1
fi
MSG_TOK=$(printf "%s" "$MSG" | tr "A-Z" "a-z" | tr -c "a-z0-9" " ")

ACK=0
[ -f .ai/.recurrence-ack ] && ACK=1
RL=.ai/.recurrence-log

MATCHED=0
HIST=""
MKEYS=""
while IFS= read -r line; do
  case "$line" in *key*components*) ;; *) continue;; esac
  KEY=$(printf "%s" "$line" | grep -oE "\\"key\\":\\"[^\\"]*\\"" | head -1 | sed -E "s/\\"key\\":\\"//; s/\\"$//")
  SOL=$(printf "%s" "$line" | grep -oE "\\"solution\\":\\"[^\\"]*\\"" | head -1 | sed -E "s/\\"solution\\":\\"//; s/\\"$//")
  DT=$(printf "%s" "$line" | grep -oE "\\"date\\":\\"[^\\"]*\\"" | head -1 | sed -E "s/\\"date\\":\\"//; s/\\"$//")
  INS=$(printf "%s" "$line" | grep -oE "\\"insight\\":\\"[^\\"]*\\"" | head -1 | sed -E "s/\\"insight\\":\\"//; s/\\"$//")
  COMPS=$(printf "%s" "$line" | grep -oE "\\"components\\":\\[[^]]*\\]" | grep -oE "\\"[^\\"]+\\"" | tr -d "\\"" | tr "A-Z" "a-z")
  [ -z "$COMPS" ] && continue

  FILE_HIT=0
  for c in $COMPS; do
    case "$c" in ?|??) continue;; esac
    if printf "%s" "$STAGED" | grep -qF "$c"; then FILE_HIT=1; break; fi
    for ct in $(printf "%s" "$c" | tr -c "a-z0-9" " "); do
      case "$ct" in ?|??|???) continue;; esac
      if printf "%s" "$STAGED" | grep -qF "$ct"; then FILE_HIT=1; break; fi
    done
    [ $FILE_HIT -eq 1 ] && break
  done
  [ $FILE_HIT -eq 0 ] && continue

  TOK_HIT=0
  if [ $DEGRADED -eq 1 ]; then
    TOK_HIT=1
  else
    KI=$(printf "%s %s" "$KEY" "$INS" | tr "A-Z" "a-z" | tr -c "a-z0-9" " ")
    for t in $MSG_TOK; do
      case "$t" in ?|??|???) continue;; esac
      case " the and for with that this from into has have not are was were feat fix docs chore refactor " in *" $t "*) continue;; esac
      for k in $KI; do
        if [ "$t" = "$k" ]; then TOK_HIT=1; break; fi
      done
      [ $TOK_HIT -eq 1 ] && break
    done
  fi
  [ $TOK_HIT -eq 0 ] && continue

  MATCHED=$((MATCHED + 1))
  HIST="$HIST | $DT  $KEY  ->  $SOL"
  MKEYS="$MKEYS $KEY"
done < "$L"

[ $MATCHED -eq 0 ] && exit 0

PRIOR=0
if [ -f "$RL" ]; then
  for k in $MKEYS; do
    n=$(grep -cF "|$k|" "$RL" 2>/dev/null)
    [ -z "$n" ] && n=0
    PRIOR=$((PRIOR + n))
  done
fi
TIER=$((MATCHED + PRIOR))

if [ $ACK -eq 1 ]; then
  echo "{\\"systemMessage\\": \\"recurrence-gate: .ai/.recurrence-ack present — allowing a commit that matches a recorded failure class ($HIST ). The ack records that a patch is justified THIS time; writing it without a real reason defeats the gate.\\"}"
  exit 0
fi

if [ $TIER -ge 2 ]; then
  echo "BLOCKED by recurrence-gate — Hard stop (this failure class has recurred $TIER times):$HIST" >&2
  echo "A repeat patch is not the fix. Escalate to a MECHANICAL fix (hook, test, or structural change) so it cannot recur. If a patch is genuinely correct this time, record why: mkdir -p .ai && echo \\"<reason> ($(date +%F))\\" >> .ai/.recurrence-ack then re-commit." >&2
  exit 2
fi

if [ $DEGRADED -eq 1 ]; then
  echo "{\\"systemMessage\\": \\"recurrence-gate WARNING (degraded match — heredoc/unparseable commit message, file-overlap only, not blocking on the weaker signal): this commit touches a recorded failure class:$HIST . If it is the same failure, escalate to a mechanical fix instead of re-patching.\\"}"
  exit 0
fi

echo "BLOCKED by recurrence-gate — first recurrence:$HIST" >&2
echo "This failure class was already addressed (see the solution path above). A second patch is not allowed. Either escalate to a mechanical fix (hook/test/structural change) so it cannot recur, or, if a patch is genuinely correct this time, record why: mkdir -p .ai && echo \\"<reason> ($(date +%F))\\" >> .ai/.recurrence-ack then re-commit. Writing that file without a real reason removes the protection this gate provides — if the gate seems wrong, surface that to the user instead." >&2
exit 2
'`;
}

function buildRecurrenceAuditScript(): string {
  // PostToolUse/Bash complement. A git commit made from inside a node/python
  // script is not a Bash *commit* the PreToolUse gate can block — but the
  // script invocation is itself a Bash tool call, so this fires after it.
  // It cannot undo the commit; it records the recurrence to .ai/.recurrence-log
  // and surfaces it, so the next commit-s PreToolUse gate escalates and the
  // bypass is loud, not silent. Spec: docs/plans/2026-05-16-recurrence-gate.md.
  return `bash -c '
L=.ai/learnings.jsonl
[ -f "$L" ] || exit 0
SHA=$(git log -1 --format=%H 2>/dev/null)
[ -z "$SHA" ] && exit 0
CT=$(git log -1 --format=%ct 2>/dev/null)
[ -z "$CT" ] && exit 0
AGE=$(( $(date +%s) - CT ))
[ $AGE -gt 120 ] && exit 0
RL=.ai/.recurrence-log
if [ -f "$RL" ] && grep -qF "$SHA" "$RL"; then exit 0; fi

STAGED=$(git show --name-only --format= "$SHA" 2>/dev/null | tr "A-Z" "a-z")
[ -z "$STAGED" ] && exit 0
MSG_TOK=$(git log -1 --format=%B 2>/dev/null | tr "A-Z" "a-z" | tr -c "a-z0-9" " ")

HITS=""
while IFS= read -r line; do
  case "$line" in *key*components*) ;; *) continue;; esac
  KEY=$(printf "%s" "$line" | grep -oE "\\"key\\":\\"[^\\"]*\\"" | head -1 | sed -E "s/\\"key\\":\\"//; s/\\"$//")
  SOL=$(printf "%s" "$line" | grep -oE "\\"solution\\":\\"[^\\"]*\\"" | head -1 | sed -E "s/\\"solution\\":\\"//; s/\\"$//")
  DT=$(printf "%s" "$line" | grep -oE "\\"date\\":\\"[^\\"]*\\"" | head -1 | sed -E "s/\\"date\\":\\"//; s/\\"$//")
  INS=$(printf "%s" "$line" | grep -oE "\\"insight\\":\\"[^\\"]*\\"" | head -1 | sed -E "s/\\"insight\\":\\"//; s/\\"$//")
  COMPS=$(printf "%s" "$line" | grep -oE "\\"components\\":\\[[^]]*\\]" | grep -oE "\\"[^\\"]+\\"" | tr -d "\\"" | tr "A-Z" "a-z")
  [ -z "$COMPS" ] && continue
  FILE_HIT=0
  for c in $COMPS; do
    case "$c" in ?|??) continue;; esac
    if printf "%s" "$STAGED" | grep -qF "$c"; then FILE_HIT=1; break; fi
  done
  [ $FILE_HIT -eq 0 ] && continue
  KI=$(printf "%s %s" "$KEY" "$INS" | tr "A-Z" "a-z" | tr -c "a-z0-9" " ")
  TOK_HIT=0
  for t in $MSG_TOK; do
    case "$t" in ?|??|???) continue;; esac
    case " the and for with that this from into has have not are was were feat fix docs chore refactor " in *" $t "*) continue;; esac
    for k in $KI; do
      if [ "$t" = "$k" ]; then TOK_HIT=1; break; fi
    done
    [ $TOK_HIT -eq 1 ] && break
  done
  [ $TOK_HIT -eq 0 ] && continue
  mkdir -p .ai
  printf "%s|%s|%s|%s\\n" "$SHA" "$DT" "$KEY" "$SOL" >> "$RL"
  HITS="$HITS | $DT $KEY -> $SOL"
done < "$L"

[ -z "$HITS" ] && exit 0
echo "{\\"systemMessage\\": \\"recurrence-gate: a commit that just landed ($SHA) matches a recorded failure class and was recorded to .ai/.recurrence-log:$HITS . It could not be blocked (not a Bash commit call), but the next commit will escalate. Consider a mechanical fix now.\\"}"
exit 0
'`;
}

function buildDeployDisciplineScript(): string {
  // Deploy-discipline gate (PreToolUse/Bash). Restores the invariant that
  // makes multi-session deploys safe: production only ever runs a commit on
  // the default branch, deployed from the main checkout. Deploying from a
  // worktree makes "what is live" diverge from main, so the next deploy from
  // main silently rolls back the worktree fix — the worst failure mode of
  // parallel sessions. Command detection mirrors buildDeployFreshnessScript.
  // BLOCKS (exit 2) a PRODUCTION deploy run:
  //   (a) from a worktree (git-dir != git-common-dir),
  //   (b) from a non-default branch,
  //   (c) with a dirty working tree,
  //   (d) while another session holds a fresh deploy.lock.
  // Preview/channel deploys stay allowed from anywhere — the browser-QA gate
  // depends on worktree sessions deploying previews to test against.
  // The manifest + go/no-go conversation lives in the skills (a hook cannot
  // converse); this is only the mechanical floor.
  return `bash -c '
COMMAND="$HOOK_TOOL_INPUT"

# Only engage on deploy commands (same detection as the deploy-freshness gate)
if ! echo "$COMMAND" | grep -qE "(firebase[[:space:]]+deploy|wrangler[[:space:]]+(pages[[:space:]]+deploy|deploy)|netlify[[:space:]]+deploy|fly[[:space:]]+deploy|vercel([[:space:]]|$)|(npm|pnpm|yarn|bun)([[:space:]]+run)?[[:space:]]+deploy)"; then
  exit 0
fi

# Preview/channel deploys are exempt — worktree sessions must keep deploying
# previews for browser QA.
if echo "$COMMAND" | grep -qE "wrangler[[:space:]]+pages[[:space:]]+deploy" && echo "$COMMAND" | grep -qE -- "--branch"; then
  exit 0
fi
if echo "$COMMAND" | grep -qE "firebase[[:space:]]+hosting:channel:deploy"; then
  exit 0
fi
if echo "$COMMAND" | grep -qE "vercel([[:space:]]|$)" && ! echo "$COMMAND" | grep -qE -- "--prod"; then
  exit 0
fi
if echo "$COMMAND" | grep -qE "netlify[[:space:]]+deploy" && ! echo "$COMMAND" | grep -qE -- "--prod"; then
  exit 0
fi

# Outside a git repo: nothing to enforce.
GD=$(git rev-parse --git-dir 2>/dev/null)
[ -z "$GD" ] && exit 0
GD=$(cd "$GD" 2>/dev/null && pwd -P)
GCD=$(cd "$(git rev-parse --git-common-dir 2>/dev/null)" 2>/dev/null && pwd -P)
[ -z "$GCD" ] && exit 0

# (a) Worktree check: linked worktrees have a private git-dir under the
# common dir. Production deploys only run from the main checkout.
if [ "$GD" != "$GCD" ]; then
  echo "BLOCKED by deploy-from-main-only: this is a PRODUCTION deploy from a git worktree. Production must be deployed from the main checkout on the default branch, after merging — otherwise what is live diverges from main and the next deploy from main silently rolls this work back. Merge to the default branch first (see /soloship:finish), then deploy from the main checkout. Preview deploys (wrangler pages deploy --branch, vercel without --prod, firebase hosting:channel:deploy) remain allowed from worktrees." >&2
  exit 2
fi

# (b) Default-branch check.
BR=$(git branch --show-current 2>/dev/null)
DEF=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed "s@^origin/@@")
if [ -z "$DEF" ]; then
  if git rev-parse --verify -q origin/main >/dev/null 2>&1; then DEF=main
  elif git rev-parse --verify -q origin/master >/dev/null 2>&1; then DEF=master
  elif git rev-parse --verify -q main >/dev/null 2>&1; then DEF=main
  elif git rev-parse --verify -q master >/dev/null 2>&1; then DEF=master
  fi
fi
if [ -n "$DEF" ] && [ -n "$BR" ] && [ "$BR" != "$DEF" ]; then
  echo "BLOCKED by deploy-from-main-only: this is a PRODUCTION deploy from branch $BR, not the default branch ($DEF). Merge to $DEF first, then deploy from a clean, synced $DEF checkout. Preview deploys remain allowed from feature branches." >&2
  exit 2
fi

# (c) Dirty-tree check: uncommitted changes mean what deploys is not what git
# records as deployed.
if [ -n "$(git status --porcelain 2>/dev/null | head -1)" ]; then
  echo "BLOCKED by deploy-from-main-only: the working tree has uncommitted changes. A production deploy must ship exactly a commit on the default branch — commit (or stash) everything first, so the prod tag can truthfully mark what is live." >&2
  exit 2
fi

# (d) Foreign fresh deploy lock: another session is mid-deploy.
LOCK="$GCD/soloship/deploy.lock"
if [ -f "$LOCK" ]; then
  INPUT=$(cat 2>/dev/null || true)
  SID=$(printf "%s" "$INPUT" | grep -oE "\\"session_id\\"[[:space:]]*:[[:space:]]*\\"[^\\"]*\\"" | head -1 | sed -E "s/.*:[[:space:]]*\\"//; s/\\"$//")
  [ -z "$SID" ] && SID="pid-$PPID"
  LSID=$(grep -oE "\\"session_id\\":\\"[^\\"]*\\"" "$LOCK" 2>/dev/null | head -1 | sed -E "s/\\"session_id\\":\\"//; s/\\"$//")
  if [ -n "$LSID" ] && [ "$LSID" != "$SID" ]; then
    MT=$(stat -f %m "$LOCK" 2>/dev/null || stat -c %Y "$LOCK" 2>/dev/null || echo 0)
    AGE_MIN=$(( ($(date +%s) - MT) / 60 ))
    if [ "$AGE_MIN" -lt ${DEPLOY_LOCK_STALE_MIN} ]; then
      echo "BLOCKED by deploy-from-main-only: another session (id $LSID) holds the deploy lock (refreshed $AGE_MIN min ago) — a deploy is already in progress. Wait for it to finish, or ask the user how to proceed. A lock is presumed stale only after ${DEPLOY_LOCK_STALE_MIN} min, and even then only the user may clear it: rm \\"$LOCK\\"" >&2
      exit 2
    fi
  fi
fi

exit 0
'`;
}

function buildSessionRegisterScript(): string {
  // Session presence (SessionStart). The break-room whiteboard: every worktree
  // of a repo shares exactly one git common dir, so live cross-session state
  // lives at <git-common-dir>/soloship/ — machine-local, structurally
  // impossible to commit, gone when the repo is deleted. This hook:
  //   1. rewrites config.json with the current thresholds (so skills read the
  //      same numbers the hooks enforce — one definition site),
  //   2. prunes session files older than SESSION_PRUNE_HOURS,
  //   3. announces other live sessions (heartbeat < SESSION_IDLE_MIN) so
  //      parallel sessions stop being blind to each other,
  //   4. registers this session (sessions/<session_id>.json, atomic write).
  // Guard-first: outside a git repo, or on any git error, exit 0 silently.
  // session_id arrives in the hook stdin JSON (common input field on all hook
  // events); fallback is the host process pid.
  return `bash -c '
INPUT=$(cat 2>/dev/null || true)

COMMON=$(git rev-parse --git-common-dir 2>/dev/null)
[ -z "$COMMON" ] && exit 0
COMMON=$(cd "$COMMON" 2>/dev/null && pwd -P)
[ -z "$COMMON" ] && exit 0

COORD="$COMMON/soloship"
mkdir -p "$COORD/sessions" "$COORD/claims" 2>/dev/null || exit 0

SID=$(printf "%s" "$INPUT" | grep -oE "\\"session_id\\"[[:space:]]*:[[:space:]]*\\"[^\\"]*\\"" | head -1 | sed -E "s/.*:[[:space:]]*\\"//; s/\\"$//")
[ -z "$SID" ] && SID="pid-$PPID"

# Rewrite thresholds every session start so upgrades propagate (atomic write).
CFG_TMP="$COORD/config.json.tmp.$$"
printf "{\\"session_prune_hours\\":${SESSION_PRUNE_HOURS},\\"session_active_min\\":${SESSION_ACTIVE_MIN},\\"session_idle_min\\":${SESSION_IDLE_MIN},\\"deploy_lock_stale_min\\":${DEPLOY_LOCK_STALE_MIN},\\"browser_claim_stale_min\\":${BROWSER_CLAIM_STALE_MIN}}\\n" > "$CFG_TMP" 2>/dev/null && mv "$CFG_TMP" "$COORD/config.json" 2>/dev/null

# Prune session files old enough to be certainly dead.
find "$COORD/sessions" -name "*.json" -mmin +${SESSION_PRUNE_HOURS * 60} -delete 2>/dev/null

# Announce other live sessions (heartbeat younger than the idle threshold).
NOW=$(date +%s)
MAIN_ROOT=$(cd "$COMMON/.." 2>/dev/null && pwd -P)
OTHERS=""
COUNT=0
for f in "$COORD/sessions"/*.json; do
  [ -f "$f" ] || continue
  BASE=$(basename "$f" .json)
  [ "$BASE" = "$SID" ] && continue
  MT=$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null || echo 0)
  AGE_MIN=$(( (NOW - MT) / 60 ))
  [ "$AGE_MIN" -ge ${SESSION_IDLE_MIN} ] && continue
  SDIR=$(grep -oE "\\"dir\\":\\"[^\\"]*\\"" "$f" 2>/dev/null | head -1 | sed -E "s/\\"dir\\":\\"//; s/\\"$//")
  SBR=$(grep -oE "\\"branch\\":\\"[^\\"]*\\"" "$f" 2>/dev/null | head -1 | sed -E "s/\\"branch\\":\\"//; s/\\"$//")
  if [ -n "$SDIR" ] && [ "$SDIR" != "$MAIN_ROOT" ]; then
    LABEL="worktree $(basename "$SDIR")"
  else
    LABEL="main checkout"
  fi
  [ -n "$SBR" ] && LABEL="$LABEL on $SBR"
  OTHERS="$OTHERS[$LABEL, $AGE_MIN min ago] "
  COUNT=$((COUNT + 1))
done

# Register this session (atomic: temp file + rename, so readers never see a
# half-written file).
DIR=$(git rev-parse --show-toplevel 2>/dev/null)
BR=$(git branch --show-current 2>/dev/null)
STARTED=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SF="$COORD/sessions/$SID.json"
SF_TMP="$SF.tmp.$$"
printf "{\\"session_id\\":\\"%s\\",\\"pid\\":%s,\\"dir\\":\\"%s\\",\\"branch\\":\\"%s\\",\\"started\\":\\"%s\\"}\\n" "$SID" "$PPID" "$DIR" "$BR" "$STARTED" > "$SF_TMP" 2>/dev/null && mv "$SF_TMP" "$SF" 2>/dev/null

if [ "$COUNT" -gt 0 ]; then
  echo "{\\"systemMessage\\": \\"$COUNT other active session(s) in this repo: \${OTHERS}- shared git index/stash caution applies. Run /soloship:status for the full picture.\\"}"
fi
exit 0
'`;
}

function buildSessionHeartbeatScript(): string {
  // Session heartbeat (PostToolUse, empty matcher = all tools). Rewrites this
  // session file after every tool call: the fresh mtime is the heartbeat
  // (freshness semantics live in the SESSION_* constants above and in
  // config.json), and rewriting — rather than touching — keeps dir/branch
  // truthful when a session moves into a worktree mid-session. pid is the
  // host process pid ($PPID is the same process for hooks and for skill Bash
  // commands), which is how a skill can find its own session file. Guard-first
  // and fast: outside a git repo, or before the register hook has created the
  // coordination dir, exit 0 instantly. Note a long tool call (a 20-minute
  // deploy) shows no heartbeats while it runs — the liveness thresholds
  // absorb this; the deploy lock does not depend on session heartbeats.
  return `bash -c '
COMMON=$(git rev-parse --git-common-dir 2>/dev/null)
[ -z "$COMMON" ] && exit 0
COMMON=$(cd "$COMMON" 2>/dev/null && pwd -P)
SESS_DIR="$COMMON/soloship/sessions"
[ -d "$SESS_DIR" ] || exit 0

INPUT=$(cat 2>/dev/null || true)
SID=$(printf "%s" "$INPUT" | grep -oE "\\"session_id\\"[[:space:]]*:[[:space:]]*\\"[^\\"]*\\"" | head -1 | sed -E "s/.*:[[:space:]]*\\"//; s/\\"$//")
[ -z "$SID" ] && SID="pid-$PPID"

SF="$SESS_DIR/$SID.json"
DIR=$(git rev-parse --show-toplevel 2>/dev/null)
BR=$(git branch --show-current 2>/dev/null)
STARTED=$(grep -oE "\\"started\\":\\"[^\\"]*\\"" "$SF" 2>/dev/null | head -1 | sed -E "s/\\"started\\":\\"//; s/\\"$//")
[ -z "$STARTED" ] && STARTED=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SF_TMP="$SF.tmp.$$"
printf "{\\"session_id\\":\\"%s\\",\\"pid\\":%s,\\"dir\\":\\"%s\\",\\"branch\\":\\"%s\\",\\"started\\":\\"%s\\"}\\n" "$SID" "$PPID" "$DIR" "$BR" "$STARTED" > "$SF_TMP" 2>/dev/null && mv "$SF_TMP" "$SF" 2>/dev/null
exit 0
'`;
}

function buildBrowserClaimScript(): string {
  // Browser claim (PostToolUse, matcher = browser MCP tools only). Writes
  // <git-common-dir>/soloship/${BROWSER_CLAIMS_DIRNAME}/<session>.json on every
  // browser MCP tool call; the fresh mtime is the heartbeat. This is how the
  // NEXT session distinguishes "a live QA run is driving Chrome right now"
  // from "a session that died yesterday never let go" — the exact ambiguity
  // that used to end QA runs with a false "browser is busy". Claims deliberately
  // live outside claims/ (that glob belongs to the plan-truth gate). The
  // "claimed" timestamp is preserved across rewrites, mirroring how the session
  // heartbeat preserves "started". Guard-first: outside a git repo, exit 0.
  return `bash -c '
COMMON=$(git rev-parse --git-common-dir 2>/dev/null)
[ -z "$COMMON" ] && exit 0
COMMON=$(cd "$COMMON" 2>/dev/null && pwd -P)
BDIR="$COMMON/soloship/${BROWSER_CLAIMS_DIRNAME}"
mkdir -p "$BDIR" 2>/dev/null || exit 0

INPUT=$(cat 2>/dev/null || true)
SID=$(printf "%s" "$INPUT" | grep -oE "\\"session_id\\"[[:space:]]*:[[:space:]]*\\"[^\\"]*\\"" | head -1 | sed -E "s/.*:[[:space:]]*\\"//; s/\\"$//")
[ -z "$SID" ] && SID="pid-$PPID"
TOOL=$(printf "%s" "$INPUT" | grep -oE "\\"tool_name\\"[[:space:]]*:[[:space:]]*\\"[^\\"]*\\"" | head -1 | sed -E "s/.*:[[:space:]]*\\"//; s/\\"$//")
case "$TOOL" in
  mcp__claude-in-chrome__*) SURFACE="chrome-mcp" ;;
  mcp__chrome-devtools__*)  SURFACE="chrome-devtools" ;;
  mcp__Claude_Browser__*)   SURFACE="desktop-browser" ;;
  *)                        SURFACE="unknown" ;;
esac

CF="$BDIR/$SID.json"
CLAIMED=$(grep -oE "\\"claimed\\":\\"[^\\"]*\\"" "$CF" 2>/dev/null | head -1 | sed -E "s/\\"claimed\\":\\"//; s/\\"$//")
[ -z "$CLAIMED" ] && CLAIMED=$(date -u +%Y-%m-%dT%H:%M:%SZ)
CF_TMP="$CF.tmp.$$"
printf "{\\"session_id\\":\\"%s\\",\\"pid\\":%s,\\"surface\\":\\"%s\\",\\"claimed\\":\\"%s\\"}\\n" "$SID" "$PPID" "$SURFACE" "$CLAIMED" > "$CF_TMP" 2>/dev/null && mv "$CF_TMP" "$CF" 2>/dev/null

# Sweep claims old enough to be certainly dead (same window as session files).
find "$BDIR" -name "*.json" -mmin +${SESSION_PRUNE_HOURS * 60} -delete 2>/dev/null
exit 0
'`;
}

function buildBrowserTeardownReminderScript(): string {
  // Browser teardown reminder (Stop). The collapse-zone guard for cleanup:
  // teardown lives at the tail of long QA sessions, exactly where skill
  // instructions stop being followed. This hook cannot close tabs (only the
  // owning session's MCP tools can), but it can make "you are still holding
  // the browser" impossible to miss: if this session's own claim file exists
  // and has been quiet for BROWSER_TEARDOWN_REMIND_MIN, every reply-end nags
  // with the exact release command until teardown happens or the session ends
  // (SessionEnd releases the claim mechanically). Active QA never sees this —
  // its claim mtime refreshes on every browser call. Guard-first: exit 0
  // outside a git repo or when no claim exists.
  return `bash -c '
COMMON=$(git rev-parse --git-common-dir 2>/dev/null)
[ -z "$COMMON" ] && exit 0
COMMON=$(cd "$COMMON" 2>/dev/null && pwd -P)
BDIR="$COMMON/soloship/${BROWSER_CLAIMS_DIRNAME}"
[ -d "$BDIR" ] || exit 0

INPUT=$(cat 2>/dev/null || true)
SID=$(printf "%s" "$INPUT" | grep -oE "\\"session_id\\"[[:space:]]*:[[:space:]]*\\"[^\\"]*\\"" | head -1 | sed -E "s/.*:[[:space:]]*\\"//; s/\\"$//")
[ -z "$SID" ] && SID="pid-$PPID"
CF="$BDIR/$SID.json"
[ -f "$CF" ] || exit 0

NOW=$(date +%s)
MT=$(stat -f %m "$CF" 2>/dev/null || stat -c %Y "$CF" 2>/dev/null || echo 0)
AGE_MIN=$(( (NOW - MT) / 60 ))
[ "$AGE_MIN" -lt ${BROWSER_TEARDOWN_REMIND_MIN} ] && exit 0

SURFACE=$(grep -oE "\\"surface\\":\\"[^\\"]*\\"" "$CF" 2>/dev/null | head -1 | sed -E "s/\\"surface\\":\\"//; s/\\"$//")
[ -z "$SURFACE" ] && SURFACE="browser"

echo "{\\"systemMessage\\": \\"This session still holds a browser claim ($SURFACE — last browser call $AGE_MIN min ago). If browser QA is finished, tear down now per browser-tooling-priority: close the tabs/pages you opened, release credential grants, then release the claim: rm \\\\\\"$CF\\\\\\" (otherwise it releases at session end).\\"}"
exit 0
'`;
}

function buildBrowserReleaseScript(): string {
  // Browser claim release (SessionEnd). The dead-man's-switch complement to the
  // claim script: when a session actually ends (clear, exit, close), its claim
  // file is removed so the browser reads as free instantly instead of after the
  // staleness window. Sessions that die WITHOUT a SessionEnd (crash, machine
  // sleep, abandoned desktop conversation) are covered by the staleness
  // threshold (browser_claim_stale_min in config.json) that readers apply to
  // the claim mtime. Guard-first: outside a git repo, exit 0.
  return `bash -c '
COMMON=$(git rev-parse --git-common-dir 2>/dev/null)
[ -z "$COMMON" ] && exit 0
COMMON=$(cd "$COMMON" 2>/dev/null && pwd -P)
BDIR="$COMMON/soloship/${BROWSER_CLAIMS_DIRNAME}"
[ -d "$BDIR" ] || exit 0

INPUT=$(cat 2>/dev/null || true)
SID=$(printf "%s" "$INPUT" | grep -oE "\\"session_id\\"[[:space:]]*:[[:space:]]*\\"[^\\"]*\\"" | head -1 | sed -E "s/.*:[[:space:]]*\\"//; s/\\"$//")
[ -z "$SID" ] && SID="pid-$PPID"

rm -f "$BDIR/$SID.json" "$BDIR/$SID.json.tmp."* 2>/dev/null
exit 0
'`;
}
