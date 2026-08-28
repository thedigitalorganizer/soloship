import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { Script } from "node:vm";
import type { ProjectInfo } from "./detect.js";
import {
  writeCommittedGateFiles,
  gateInvocation,
  portableGateInvocation,
  gatePath,
  GATE_BASE_DIR,
  GATE_DIRNAME,
  type GateName,
} from "./committed-gates.js";

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

// Deploy-lock teardown reminder. Same job as BROWSER_TEARDOWN_REMIND_MIN for
// the other shared resource a session can walk away still holding, so it is
// deliberately the same number rather than a new one (the
// BROWSER_CLAIM_STALE_MIN = SESSION_IDLE_MIN precedent). A live deploy
// refreshes the lock (`touch "$LOCK"` between steps per deploy-sequence.md),
// so an in-flight deploy is never nagged; a forgotten lock is surfaced long
// before DEPLOY_LOCK_STALE_MIN, when it would start blocking other sessions.
export const DEPLOY_LOCK_REMIND_MIN = BROWSER_TEARDOWN_REMIND_MIN;

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

// Mirrors PLAN_STATUS_ACK for the billing-confirmation gate (see
// .claude/rules/billing-confirmation-gate.md) — its own named constant so
// committed-gates.ts (and any future generator) never has to derive one path
// from the other's string.
export const BILLING_ACK = ".ai/.billing-ack";

const PLAN_STATUS_RE = PLAN_STATUSES.join("|");
const PLAN_STATUS_OPEN_RE = PLAN_STATUSES_OPEN.join("|");

// Body-level open-item markers: an unchecked checkbox, or a shouted status
// word a plan author dropped inline ("3. IN PROGRESS: watch quiz completion")
// instead of using the checkbox convention. These mean "this plan still has
// outstanding work" regardless of what its frontmatter or its branch's merge
// state implies. Shared by the Stop-hook contradiction check (which softens
// its message from a command to a prompt when these are present) and the
// done-checklist gate (which blocks a `status: done` write while they remain)
// — one definition so the two stay in lockstep.
//
// The status words are matched UPPERCASE-ONLY on purpose: the canonical
// frontmatter line is lowercase (`status: in-progress`, `status: blocked`),
// so this pattern never fires on the frontmatter itself, only on prose that
// shouts the word. A false positive here only ever produces the SOFTER
// message/the write-block asking to double check — never a false "done" — so
// erring toward over-matching is the safe direction.
//
// Unanchored on purpose: this same pattern is grepped against both real plan
// files (real newlines) AND raw tool-input JSON payloads (escaped into one
// line, where a `^`/line-start anchor is meaningless) — one definition that
// works against both shapes, rather than two patterns to keep in sync.
// Ordered so the pattern text does NOT start with "-": a leading "-" makes
// some grep implementations (BSD/macOS included) parse the pattern argument
// itself as an option flag instead of a pattern, even with -E. Every call
// site also passes "--" before the pattern as a second layer of defense.
const PLAN_OPEN_ITEM_GREP = "PENDING|BLOCKED|IN PROGRESS|- \\[ \\]";

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
  /billing-confirmation-gate|live-data-evidence-gate|\.ai\/learnings\.jsonl|deploy-from-main|plan-truth|plan-namespace|plan-merge|Key Decisions|"systemMessage": "%-m|soloship\/(sessions|claims)|Soloship update|BLOCKED: (Dangerous|Direct|Force)|phone-a-friend|recurrence|main-checkout-authoring|soloship\/deploy\.lock/i;

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

  // Write the committed cross-host gate files (scripts/soloship-hooks/*.cjs) once —
  // every host's installer that runs in this pass shares them. See
  // committed-gates.ts for why these 8 gates moved off inline bash: stdin
  // JSON.parse instead of grep/sed removes the JSON-escaping bug class that
  // bit command-safety and recurrence even after the 2026-08-27 stdin fix.
  const gateFiles = writeCommittedGateFiles(root);

  // Build hooks config
  const hooks: HooksConfig["hooks"] = {};

  // PreToolUse: dangerous-shell + deploy + billing + recurrence + plan gates.
  // Coaching hooks (phone-a-friend, local Semgrep) were removed from the
  // default set — CI owns Semgrep; review is deliberate, not filename heuristics.
  hooks.PreToolUse = [
    {
      matcher: "Bash",
      hooks: [
        {
          type: "command",
          command: gateInvocation(root, "command-safety"),
          timeout: 5000,
        },
      ],
    },
    {
      matcher: "Bash",
      hooks: [
        {
          type: "command",
          command: gateInvocation(root, "deploy-freshness"),
          timeout: 10000,
        },
      ],
    },
    {
      matcher: "Bash",
      hooks: [
        {
          type: "command",
          command: gateInvocation(root, "deploy-discipline"),
          timeout: 10000,
        },
      ],
    },
    {
      matcher: "Edit|Write|MultiEdit|NotebookEdit",
      hooks: [
        {
          type: "command",
          command: gateInvocation(root, "billing-confirmation"),
          timeout: 5000,
        },
      ],
    },
    {
      matcher: "Bash",
      hooks: [
        {
          type: "command",
          command: gateInvocation(root, "recurrence"),
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
          command: gateInvocation(root, "plan-truth"),
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
          command: gateInvocation(root, "plan-merge"),
          timeout: 5000,
        },
      ],
    },
    // Main-checkout authoring warn: committing in the main checkout while
    // other worktrees are active (warn-only, never blocks). Claude-only —
    // not in the Phase 1 cross-host gate list (it's about Claude Code's own
    // worktree pattern), so it stays inline bash.
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
          command: gateInvocation(root, "plan-namespace"),
          timeout: 5000,
        },
      ],
    },
    // Plan-completeness gate: a plan must declare ## Goal + ## Done-When.
    // Claude-only for now — not in the Phase 1 cross-host gate list.
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
    // Plan-done-checklist gate: blocks status: done while the body still has
    // unchecked boxes or PENDING/BLOCKED/IN PROGRESS markers. Claude-only for
    // now — not in the Phase 1 cross-host gate list.
    {
      matcher: "Edit|Write|MultiEdit",
      hooks: [
        {
          type: "command",
          command: buildPlanDoneChecklistGateScript(),
          timeout: 5000,
        },
      ],
    },
  ];

  results.push(`Written ${gateFiles.length} shared gate files to scripts/soloship-hooks/ (shared with Cursor, Codex, Antigravity — commit these)`);
  results.push("PreToolUse: block dangerous commands (rm -rf ~, .env edits, force push to main)");
  results.push("PreToolUse: plan-truth gate (blocks code commits whose plan still says 'planned')");
  results.push("PreToolUse: plan-merge gate (blocks merging a branch whose plan is still open)");
  results.push("PreToolUse: main-checkout authoring warn (commit in main checkout while worktrees active; warn-only)");
  results.push("PreToolUse: plan-namespace gate (docs/plans/ holds plans only; routes drafts/handoffs/reports)");
  results.push("PreToolUse: plan-completeness gate (a plan must declare ## Goal + ## Done-When)");
  results.push("PreToolUse: plan-done-checklist gate (blocks status: done while the plan body still has unchecked boxes or PENDING/BLOCKED/IN PROGRESS markers)");
  results.push("PreToolUse: deploy-freshness gate (blocks stale build artifact, warns on unapplied D1 migrations)");
  results.push("PreToolUse: deploy-discipline gate (blocks production deploys from worktrees, non-default branches, dirty trees, or past another session's fresh deploy lock)");
  results.push("PreToolUse: billing/credit/rerun-window confirmation gate (blocks edits until data-model semantics confirmed)");
  results.push("PreToolUse: recurrence gate (blocks a 2nd patch of a failure class already in .ai/learnings.jsonl)");

  // PostToolUse: recurrence audit + session/browser heartbeats.
  // Changelog nags, live-data phrase matching, and same-name component warns
  // were removed from the default set (release workflow / search / inventory).
  // The auto-lint hook was retired here too: it read $HOOK_MODIFIED_FILE, an
  // env var Claude Code never sets (same root cause as the inert PreToolUse
  // gates below), so it never actually ran — CI already lints, so nothing is
  // lost by deleting rather than porting it to stdin.
  const postToolUseHooks: HookEntry[] = [];

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
  // browser-qa-gate rule.
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

  // Stop: plan-truth backstop + shared-resource nags. Workflow navigator,
  // handoff coaching, and the per-reply timestamp were removed as noise.
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
  hooks.Stop.push({
    matcher: "",
    hooks: [
      {
        type: "command",
        command: buildDeployLockReminderScript(),
        timeout: 5000,
      },
    ],
  });
  results.push("Stop: plan-truth backstop (surfaces plans whose open status contradicts a merged branch)");
  results.push("Stop: browser teardown reminder (nags when this session still holds a quiet browser claim — close tabs, release grants, release the claim)");
  results.push("Stop: deploy lock reminder (nags when this session still holds a quiet deploy lock that is blocking every other session)");

  // SessionStart: safety snapshot + session presence. The daily npm update
  // check was removed — plugin/package managers own updates.
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
          command: buildSessionRegisterScript(),
          timeout: 10000,
        },
      ],
    },
  ];
  results.push("SessionStart: checkpoint commit before agent session");
  results.push("SessionStart: session presence (register this session, announce other live sessions in this repo)");

  // SessionEnd: release this session's shared-resource holds so the next
  // session sees them free instead of a phantom "someone else is using it".
  hooks.SessionEnd = [
    {
      matcher: "",
      hooks: [
        {
          type: "command",
          command: buildBrowserReleaseScript(),
          timeout: 5000,
        },
        {
          type: "command",
          command: buildDeployLockReleaseScript(),
          timeout: 5000,
        },
      ],
    },
  ];
  results.push("SessionEnd: browser claim release (frees this session's browser MCP claim when the session ends)");
  results.push("SessionEnd: deploy lock release (frees the deploy lock when the session that acquired it ends)");

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

export async function installAntigravityHooks(
  root: string,
  _project: ProjectInfo
): Promise<string[]> {
  const results: string[] = [];
  const agentsDir = join(root, ".agents");

  if (!existsSync(agentsDir)) {
    mkdirSync(agentsDir, { recursive: true });
  }

  const hooksPath = join(agentsDir, "hooks.json");

  // The old inline command-safety script (rm -rf / .env / force-push / API
  // key / deploy-branch checks) is gone — superseded by the shared
  // command-safety.cjs gate wired below via sharedGateEntry.
  const preWriteInline = `node -e '
const fs = require("fs");
try {
  const input = fs.readFileSync(0, "utf-8");
  const data = JSON.parse(input || "{}");
  const target = data.toolCall?.args?.TargetFile || data.toolCall?.args?.AbsolutePath || "";
  const content = data.toolCall?.args?.CodeContent || data.toolCall?.args?.ReplacementContent || "";
  if (target.includes(".soloship/version")) {
    console.log(JSON.stringify({ decision: "deny", reason: "BLOCKED: .soloship/version is managed exclusively by the Soloship CLI." }));
    process.exit(0);
  }
  if (target.includes("docs/plans") && target.endsWith(".md") && content) {
    if (!content.startsWith("---") || !/status:\\s*(?:backlog|planned|in-progress|blocked|done|abandoned|superseded)/.test(content)) {
      console.log(JSON.stringify({ decision: "deny", reason: "BLOCKED: Plans in docs/plans/ must have valid YAML frontmatter and status." }));
      process.exit(0);
    }
  }
} catch(e) {}
console.log(JSON.stringify({ decision: "allow" }));
'`;

  const stopInline = `node -e '
const fs = require("fs");
const { execSync } = require("child_process");
try {
  const branch = execSync("git branch --show-current 2>/dev/null", { encoding: "utf-8" }).trim();
  if ((branch === "main" || branch === "master") && fs.existsSync("docs/plans")) {
    const files = fs.readdirSync("docs/plans").filter(f => f.endsWith(".md"));
    for (const f of files) {
      const c = fs.readFileSync("docs/plans/" + f, "utf-8");
      if (c.includes("status: in-progress")) {
        const m = c.match(/branch:\\s*([^\\s\\n]+)/);
        if (m && m[1]) {
          const merged = execSync("git branch --merged " + branch + " 2>/dev/null", { encoding: "utf-8" });
          if (merged.includes(m[1])) {
            console.log(JSON.stringify({ decision: "continue", reason: "PLAN STATUS CONTRADICTION: Branch " + m[1] + " is merged into " + branch + ", but docs/plans/" + f + " still says status: in-progress. Update to status: done." }));
            process.exit(0);
          }
        }
      }
    }
  }
} catch(e) {}
console.log(JSON.stringify({}));
'`;

  // The committed gates (command-safety, deploy-freshness, deploy-discipline,
  // billing-confirmation, recurrence, plan-truth, plan-merge, plan-namespace)
  // give Antigravity full parity with Claude/Codex — previously only 3 of 11
  // gates existed here (command-safety, file-protection, stop-checks), all as
  // Antigravity-only inline copies of patterns that now live once in
  // committed-gates.ts. preWriteInline's extra checks (.soloship/version
  // protection, plan doc-format validation beyond plan-namespace's status
  // check) and stopInline (post-merge plan-truth backstop) are not yet in the
  // shared gate set — kept here as-is rather than dropping coverage.
  const gateFiles = writeCommittedGateFiles(root);
  const RUN_COMMAND_MATCHER = "run_command";
  const WRITE_MATCHER = "write_to_file|replace_file_content|multi_replace_file_content";
  const sharedGateEntry = (name: GateName, matcher: string) => ({
    [`soloship-${name}`]: {
      PreToolUse: [
        {
          matcher,
          hooks: [{ type: "command", command: portableGateInvocation(name), timeout: 15 }],
        },
      ],
    },
  });

  const hooksConfig = {
    ...sharedGateEntry("command-safety", RUN_COMMAND_MATCHER),
    ...sharedGateEntry("deploy-freshness", RUN_COMMAND_MATCHER),
    ...sharedGateEntry("deploy-discipline", RUN_COMMAND_MATCHER),
    ...sharedGateEntry("recurrence", RUN_COMMAND_MATCHER),
    ...sharedGateEntry("plan-truth", RUN_COMMAND_MATCHER),
    ...sharedGateEntry("plan-merge", RUN_COMMAND_MATCHER),
    ...sharedGateEntry("billing-confirmation", WRITE_MATCHER),
    ...sharedGateEntry("plan-namespace", WRITE_MATCHER),
    "soloship-file-protection": {
      PreToolUse: [
        {
          matcher: WRITE_MATCHER,
          hooks: [
            {
              type: "command",
              command: preWriteInline,
              timeout: 15,
            },
          ],
        },
      ],
    },
    "soloship-stop-checks": {
      Stop: [
        {
          type: "command",
          command: stopInline,
          timeout: 15,
        },
      ],
    },
  };

  writeFileSync(hooksPath, JSON.stringify(hooksConfig, null, 2));
  results.push(`Written ${gateFiles.length} shared gate files to scripts/soloship-hooks/ (shared with Claude, Cursor, Codex — commit these)`);
  results.push(
    "PreToolUse: command-safety, deploy-freshness, deploy-discipline, recurrence, plan-truth, plan-merge, billing-confirmation, plan-namespace (shared gates)"
  );
  results.push("PreToolUse: file-protection (protects .soloship/version, validates plan format — Antigravity-only, not yet unified)");
  results.push("Stop: plan-truth-check (prevents lying plans after branch merge)");
  results.push("Written to .agents/hooks.json");

  return results;
}

export const CODEX_DIR = ".codex";
export const CODEX_GATE_NAMES: GateName[] = [
  "command-safety",
  "deploy-freshness",
  "deploy-discipline",
  "billing-confirmation",
  "recurrence",
  "plan-truth",
  "plan-merge",
  "plan-namespace",
];
// Codex's own docs (learn.chatgpt.com/docs/hooks, fetched 2026-08-27) put the
// timeout in seconds ("timeout": 600 in their own example) — matches
// Cursor's unit, not Claude's milliseconds. Generous enough for a git call on
// a cold sandbox, short enough that a hung hook does not stall the turn.
const CODEX_HOOK_TIMEOUT_SEC = 10;

// Ensures `.codex/config.toml` has `[features]\nhooks = true`. No TOML
// library dependency (Soloship keeps zero runtime deps) — deliberately
// narrow text surgery: only touches a `[features]` table's `hooks` key,
// never anything else in the file, and never both writes AND reads back a
// value it did not itself just write. If Codex ever changes hooks to
// default-on (its own doc summary already read that way once, in tension
// with the hooks reference page — see the plan's Phase 0 notes), writing the
// key explicitly is still correct: an explicit `true` cannot make hooks any
// more enabled than a version-dependent default already would.
function ensureCodexHooksFeatureFlag(root: string): boolean {
  const configPath = join(root, CODEX_DIR, "config.toml");
  let content = existsSync(configPath) ? readFileSync(configPath, "utf-8") : "";

  const featuresHeaderRe = /^\[features\]\s*$/m;
  const hooksKeyRe = /^hooks\s*=\s*true\s*$/m;

  if (featuresHeaderRe.test(content)) {
    // A [features] table exists. Does it already set hooks = true somewhere
    // between its header and the next table header (or EOF)?
    const start = content.search(featuresHeaderRe);
    const afterHeader = content.slice(start);
    const nextTable = afterHeader.slice(1).search(/^\[/m);
    const sectionEnd = nextTable === -1 ? afterHeader.length : nextTable + 1;
    const section = afterHeader.slice(0, sectionEnd);
    if (hooksKeyRe.test(section)) {
      return false; // already set, nothing to change
    }
    // Insert right after the [features] header line.
    const headerLineEnd = content.indexOf("\n", start);
    const insertAt = headerLineEnd === -1 ? content.length : headerLineEnd + 1;
    content = content.slice(0, insertAt) + "hooks = true\n" + content.slice(insertAt);
  } else {
    const sep = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
    content = `${content}${sep}${content.length > 0 ? "\n" : ""}[features]\nhooks = true\n`;
  }

  if (!existsSync(join(root, CODEX_DIR))) {
    mkdirSync(join(root, CODEX_DIR), { recursive: true });
  }
  writeFileSync(configPath, content);
  return true;
}

// Codex's own default cap on combined AGENTS.md content is 32 KiB (per the
// plan's Phase 3 research) — too small once root AGENTS.md carries the seven
// safety gates (Phase 2) plus nested intent-layer files; a real project's
// root instructions alone can exceed that (MAPS: 17.5 KB, before this diet
// added the gates). 128 KiB is generous headroom without being unbounded.
export const CODEX_PROJECT_DOC_MAX_BYTES = 131072;

// `project_doc_max_bytes` is a TOP-LEVEL TOML key (not under any table —
// verified against learn.chatgpt.com/docs/config-file/config-reference,
// 2026-08-27), so unlike the `[features]` table above, the only placement
// rule is "before the first [table] header" — prepending at position 0
// always satisfies that regardless of what else is in the file.
function ensureCodexProjectDocMaxBytes(root: string): boolean {
  const configPath = join(root, CODEX_DIR, "config.toml");
  let content = existsSync(configPath) ? readFileSync(configPath, "utf-8") : "";

  const keyRe = /^project_doc_max_bytes\s*=\s*(\d+)\s*$/m;
  const existing = content.match(keyRe);
  if (existing && Number(existing[1]) >= CODEX_PROJECT_DOC_MAX_BYTES) {
    return false; // already generous enough — never shrink a user's own value
  }

  content = existing
    ? content.replace(keyRe, `project_doc_max_bytes = ${CODEX_PROJECT_DOC_MAX_BYTES}`)
    : `project_doc_max_bytes = ${CODEX_PROJECT_DOC_MAX_BYTES}\n${content}`;

  if (!existsSync(join(root, CODEX_DIR))) {
    mkdirSync(join(root, CODEX_DIR), { recursive: true });
  }
  writeFileSync(configPath, content);
  return true;
}

// Codex CLI hooks. Verified live against learn.chatgpt.com/docs/hooks,
// 2026-08-27: PreToolUse delivers {session_id, cwd, hook_event_name,
// tool_name, tool_input} on stdin — byte-identical to Claude Code's contract
// for the fields these gates read — and blocks via exit 2 (stderr) or exit 0
// with {systemMessage} JSON to warn without blocking. That means the SAME
// gate files Claude uses (auto-detecting "claude" for this shape — see
// committed-gates.ts) work here unchanged; only the config format differs
// (`.codex/hooks.json`, `matcher`/`hooks` shape identical to Claude's,
// `timeout` in seconds not ms) and hooks must be enabled via
// `[features] hooks = true` in `.codex/config.toml`.
export async function installCodexHooks(
  root: string,
  _project: ProjectInfo
): Promise<string[]> {
  const results: string[] = [];
  const codexDir = join(root, CODEX_DIR);
  if (!existsSync(codexDir)) {
    mkdirSync(codexDir, { recursive: true });
  }

  const gateFiles = writeCommittedGateFiles(root);

  const preToolUse = CODEX_GATE_NAMES.map((name) => ({
    matcher: name === "billing-confirmation" || name === "plan-namespace" ? "Edit|Write|MultiEdit|NotebookEdit" : "Bash",
    hooks: [
      {
        type: "command",
        command: portableGateInvocation(name),
        timeout: CODEX_HOOK_TIMEOUT_SEC,
      },
    ],
  }));

  const hooksPath = join(codexDir, "hooks.json");
  let config: Record<string, unknown> = {};
  if (existsSync(hooksPath)) {
    try {
      config = JSON.parse(readFileSync(hooksPath, "utf-8"));
    } catch {
      // Unparseable file: start fresh rather than refusing to install a gate.
    }
  }
  // Merge, not overwrite — a user may have added their own Codex hook
  // entries. Replace only entries whose command references our committed
  // gate directory (mirrors the Cursor installer's own-and-merge pattern).
  const existingHooks = (config.hooks as Record<string, unknown[]>) || {};
  const mergedHooks: Record<string, unknown[]> = { ...existingHooks };
  const priorPreToolUse = Array.isArray(existingHooks.PreToolUse) ? existingHooks.PreToolUse : [];
  const customPreToolUse = priorPreToolUse.filter((entry) => {
    const cmd = (entry as { hooks?: { command?: string }[] })?.hooks?.[0]?.command || "";
    return !cmd.includes(`${GATE_BASE_DIR}/${GATE_DIRNAME}/`);
  });
  mergedHooks.PreToolUse = [...customPreToolUse, ...preToolUse];
  config.hooks = mergedHooks;
  writeFileSync(hooksPath, JSON.stringify(config, null, 2) + "\n");

  const flagChanged = ensureCodexHooksFeatureFlag(root);
  const capChanged = ensureCodexProjectDocMaxBytes(root);

  results.push(`Written ${gateFiles.length} shared gate files to scripts/soloship-hooks/ (shared with Claude, Cursor, Antigravity — commit these)`);
  results.push(
    "PreToolUse: command-safety, deploy-freshness, deploy-discipline, billing-confirmation, recurrence, plan-truth, plan-merge, plan-namespace"
  );
  results.push(`Written to ${CODEX_DIR}/hooks.json`);
  results.push(
    flagChanged
      ? `${CODEX_DIR}/config.toml: set [features] hooks = true (hooks are off by default until this is set)`
      : `${CODEX_DIR}/config.toml: [features] hooks = true already set`
  );
  results.push(
    capChanged
      ? `${CODEX_DIR}/config.toml: raised project_doc_max_bytes to ${CODEX_PROJECT_DOC_MAX_BYTES} (Codex's default cap on combined AGENTS.md content is 32 KiB — too small once the safety gates are in there)`
      : `${CODEX_DIR}/config.toml: project_doc_max_bytes already >= ${CODEX_PROJECT_DOC_MAX_BYTES}`
  );

  return results;
}

function buildPreToolUseScript(): string {
  // Exit code 2 blocks the action
  return `bash -c '
COMMAND=$(cat 2>/dev/null || true)

# Block rm -rf with home directory
if echo "$COMMAND" | grep -qE "rm\\s+-rf\\s+(~|/Users|/home|\\$HOME)"; then
  echo "BLOCKED: Dangerous rm -rf targeting home directory" >&2
  exit 2
fi

# Block .env edits. Boundary after ".env" must accept end-of-string,
# whitespace, OR a double quote — COMMAND is now the raw stdin JSON payload
# (fixed 2026-08-27; previously this env var was never set at all), and a
# command embedded in JSON is always followed by a closing quote, never
# whitespace or EOL. A boundary of ($|\\s) alone silently never matches
# inside JSON — found live via a MUST-BLOCK regression check on "cat .env".
if echo "$COMMAND" | grep -qE "(cat|echo|printf|>).*\\.env(\$|[[:space:]\\\"])"; then
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
TI=$(cat 2>/dev/null || true)
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
TI=$(cat 2>/dev/null || true)
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
TI=$(cat 2>/dev/null || true)
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

export function buildPlanDoneChecklistGateScript(): string {
  // Gate B3 — done-checklist gate (PreToolUse/Edit|Write|MultiEdit). A merged
  // branch does not mean a plan's own work is finished (see the Stop-hook
  // bifurcation in buildStopScript), and neither does an agent's self-report.
  // This is the write-side twin: refuse to let `status: done` land while the
  // plan body still carries open-item markers (PLAN_OPEN_ITEM_GREP).
  //
  // Write vs Edit/MultiEdit read different shapes of $HOOK_TOOL_INPUT, so
  // they get different treatment:
  //   - Write carries the FULL new file content in its `content` field — that
  //     payload IS the post-write truth, so open items are checked against
  //     the payload alone, never the stale on-disk file.
  //   - Edit/MultiEdit carry only the changed fragment (`old_string`/
  //     `new_string`, or an `edits` array) — there is no cheap way to compute
  //     the merged post-edit body in bash, so this falls back to the file as
  //     it stands ON DISK right now. An edit that both clears the LAST open
  //     item and flips the status in the same call gets blocked once — the
  //     fix is to land the checkbox edit first (or do it all in one Write);
  //     the escape hatch covers the rare genuine exception. Conservative by
  //     design, same bias as the read-side gate: ask rather than assert.
  //
  // Same trigger/exemption shape as Gates B and B2: only *.md directly under
  // the plans dir, archive/ and README.md exempt.
  return `bash -c '
TI=$(cat 2>/dev/null || true)
[ -z "$TI" ] && exit 0
[ -f ${PLAN_STATUS_ACK} ] && exit 0

FP=$(echo "$TI" | grep -oE "\\"file_path\\"[[:space:]]*:[[:space:]]*\\"[^\\"]*\\"" | head -1 | sed -E "s/.*:[[:space:]]*\\"//; s/\\"$//")
[ -z "$FP" ] && exit 0

case "$FP" in
  *${PLANS_DIR}/*.md) ;;
  *) exit 0 ;;
esac
case "$FP" in
  *${PLANS_DIR}/archive/*) exit 0 ;;
  */README.md) exit 0 ;;
esac

# Only fires when this write is SETTING status to done.
echo "$TI" | grep -qE "status:[[:space:]]*\\"?done" || exit 0

if echo "$TI" | grep -q "\\"content\\""; then
  # Write: the payload is the complete new file — check IT, not disk.
  echo "$TI" | grep -qE -- "${PLAN_OPEN_ITEM_GREP}" || exit 0
else
  # Edit / MultiEdit: no cheap way to compute the merged body — check the
  # file as it stands on disk right now.
  [ -f "$FP" ] || exit 0
  grep -qE -- "${PLAN_OPEN_ITEM_GREP}" "$FP" 2>/dev/null || exit 0
fi

echo "BLOCKED by plan-done-checklist-gate: \\"$FP\\" is being set to status: done, but its body still lists open items — an unchecked \\"- [ ]\\" box, or a PENDING / BLOCKED / IN PROGRESS marker.

A merged branch, or a self-report, is not the same claim as \\"this plan is finished\\" — the plan itself says otherwise right now.

FIX: resolve the open items first (check the boxes, clear the markers) — in one Write, or in a prior edit — THEN flip status: done in its own edit.

If the open markers are stale prose that no longer applies, clean them up in the same change instead of leaving them to contradict the status.

Escape hatch (requires a real reason): mkdir -p .ai && echo \\"why this plan is done with open markers still present\\" > ${PLAN_STATUS_ACK}" >&2
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
TI=$(cat 2>/dev/null || true)
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
TI=$(cat 2>/dev/null || true)
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

export function buildStopScript(_project: ProjectInfo): string {
  return `bash -c '
MESSAGES=""

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
  LIARS_OPEN=""
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
      # A merged branch means the CODE is live — it does not mean the PLAN
      # body agrees the work is finished. Split on whether the body still
      # carries open-item markers (unchecked boxes, shouted PENDING/BLOCKED/
      # IN PROGRESS): with none, the frontmatter is provably stale and the
      # fix is mechanical (flip it). With markers present, "merged" and
      # "done" are NOT the same claim — the message must ask, not assert.
      if grep -qE -- "${PLAN_OPEN_ITEM_GREP}" "$plan" 2>/dev/null; then
        LIARS_OPEN="$LIARS_OPEN $plan(says:$PSTATUS)"
      else
        LIARS="$LIARS $plan(says:$PSTATUS)"
      fi
    fi
  done
  if [ -n "$LIARS" ]; then
    MESSAGES="$MESSAGES PLAN STATUS CONTRADICTION —$LIARS: the branch is already merged into $DEFAULT_BRANCH, so this work is LIVE, but the plan still claims it is not done. Fix the status now (status: done) — a lying plan can send the next agent to rebuild shipped work."
  fi
  if [ -n "$LIARS_OPEN" ]; then
    MESSAGES="$MESSAGES PLAN STATUS CHECK —$LIARS_OPEN: the branch is merged into $DEFAULT_BRANCH, but the plan body still lists open items (an unchecked box, or a PENDING/BLOCKED/IN PROGRESS marker). Merged into the default branch means the code is live — it does NOT by itself mean the plan is finished. Read the Cutover/QA Plan/Done-When sections before touching the status: if the work is genuinely complete, flip to status: done; if it is not, leave the status open and say why, rather than assuming merged means done."
  fi
  if [ -n "$ORPHANS" ]; then
    MESSAGES="$MESSAGES NOT A PLAN? —$ORPHANS: no status frontmatter. ${PLANS_DIR}/ holds live plans only. Give it a status, or move it (draft -> ${DRAFTS_DIR}/, handoff -> ${HANDOFFS_DIR}/, report -> ${REPORTS_DIR}/, decision log -> ${DECISIONS_DIR}/)."
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
COMMAND=$(cat 2>/dev/null || true)

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
TI=$(cat 2>/dev/null || true)
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
TI=$(cat 2>/dev/null || true)
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
  # TI is now the raw stdin JSON payload (fixed 2026-08-27), so every quote
  # around the -m argument is JSON-escaped (\\") rather than bare (") — a
  # bare-quote grep never matches, which silently forced every real commit
  # into the degraded/warn-only path instead of the intended block-on-first-
  # recurrence path. Match against a backslash-stripped copy instead of
  # trying to make the ERE tolerate an optional backslash at each boundary.
  TI_UNESC=$(printf "%s" "$TI" | tr -d "\\\\")
  MSG=$(echo "$TI_UNESC" | grep -oE -- "-m[[:space:]]+\\"[^\\"]*\\"" | head -1 | sed -E "s/^-m[[:space:]]+\\"//; s/\\"$//")
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
COMMAND=$(cat 2>/dev/null || true)

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
  SID=$(printf "%s" "$COMMAND" | grep -oE "\\"session_id\\"[[:space:]]*:[[:space:]]*\\"[^\\"]*\\"" | head -1 | sed -E "s/.*:[[:space:]]*\\"//; s/\\"$//")
  [ -z "$SID" ] && SID="pid-$PPID"
  LSID=$(grep -oE "\\"session_id\\":\\"[^\\"]*\\"" "$LOCK" 2>/dev/null | head -1 | sed -E "s/\\"session_id\\":\\"//; s/\\"$//")
  if [ -n "$LSID" ] && [ "$LSID" != "$SID" ]; then
    MT=$(stat -f %m "$LOCK" 2>/dev/null) || MT=$(stat -c %Y "$LOCK" 2>/dev/null) || MT=0
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
  MT=$(stat -f %m "$f" 2>/dev/null) || MT=$(stat -c %Y "$f" 2>/dev/null) || MT=0
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
MT=$(stat -f %m "$CF" 2>/dev/null) || MT=$(stat -c %Y "$CF" 2>/dev/null) || MT=0
AGE_MIN=$(( (NOW - MT) / 60 ))
[ "$AGE_MIN" -lt ${BROWSER_TEARDOWN_REMIND_MIN} ] && exit 0

SURFACE=$(grep -oE "\\"surface\\":\\"[^\\"]*\\"" "$CF" 2>/dev/null | head -1 | sed -E "s/\\"surface\\":\\"//; s/\\"$//")
[ -z "$SURFACE" ] && SURFACE="browser"

echo "{\\"systemMessage\\": \\"This session still holds a browser claim ($SURFACE — last browser call $AGE_MIN min ago). If browser QA is finished, tear down now per browser-qa-gate: close the tabs/pages you opened, release credential grants, then release the claim: rm \\\\\\"$CF\\\\\\" (otherwise it releases at session end).\\"}"
exit 0
'`;
}

export function buildDeployLockReminderScript(): string {
  // Deploy-lock teardown reminder (Stop). The collapse-zone guard for the
  // OTHER shared resource a session can walk away still holding. Unlike a
  // browser claim (one file per session), deploy.lock is a single shared file,
  // so this only ever speaks about a lock THIS session owns: it parses
  // session_id out of the lock JSON and exits silently unless it matches.
  // A live deploy refreshes the lock, so in-flight deploys are never nagged.
  // Guard-first: exit 0 outside a git repo or with no lock present.
  return `bash -c '
COMMON=$(git rev-parse --git-common-dir 2>/dev/null)
[ -z "$COMMON" ] && exit 0
COMMON=$(cd "$COMMON" 2>/dev/null && pwd -P)
LOCK="$COMMON/soloship/deploy.lock"
[ -f "$LOCK" ] || exit 0

INPUT=$(cat 2>/dev/null || true)
SID=$(printf "%s" "$INPUT" | grep -oE "\\"session_id\\"[[:space:]]*:[[:space:]]*\\"[^\\"]*\\"" | head -1 | sed -E "s/.*:[[:space:]]*\\"//; s/\\"$//")
[ -z "$SID" ] && SID="pid-$PPID"

LSID=$(grep -oE "\\"session_id\\":\\"[^\\"]*\\"" "$LOCK" 2>/dev/null | head -1 | sed -E "s/\\"session_id\\":\\"//; s/\\"$//")
[ "$LSID" = "$SID" ] || exit 0

NOW=$(date +%s)
MT=$(stat -f %m "$LOCK" 2>/dev/null) || MT=$(stat -c %Y "$LOCK" 2>/dev/null) || MT=0
AGE_MIN=$(( (NOW - MT) / 60 ))
[ "$AGE_MIN" -lt ${DEPLOY_LOCK_REMIND_MIN} ] && exit 0

echo "{\\"systemMessage\\": \\"This session still holds the deploy lock (untouched for \${AGE_MIN} min). Every other session is blocked from deploying until it is released. If the deploy finished or was abandoned, release it now per deploy-sequence.md Step 6: rm \\\\\\"\${LOCK}\\\\\\" (it also releases at session end). If a deploy is genuinely still running, touch the lock to keep it fresh.\\"}"
exit 0
'`;
}

export function buildDeployLockReleaseScript(): string {
  // Deploy-lock release (SessionEnd). The dead-man's-switch complement to the
  // reminder above: deploy.lock previously had NO mechanical release at all —
  // a session that ended mid-deploy (or forgot Step 6) blocked every other
  // session's deploy until a human noticed and cleared it by hand.
  //
  // deploy.lock is a SHARED file, not a per-session one, so ownership is
  // checked before removal: the lock's session_id must equal this session's.
  // Removing another session's lock would break an in-flight deploy — the
  // exact failure the lock exists to prevent. Sessions that die without a
  // SessionEnd stay covered by DEPLOY_LOCK_STALE_MIN (never auto-broken; the
  // user decides). Guard-first: outside a git repo, exit 0.
  return `bash -c '
COMMON=$(git rev-parse --git-common-dir 2>/dev/null)
[ -z "$COMMON" ] && exit 0
COMMON=$(cd "$COMMON" 2>/dev/null && pwd -P)
LOCK="$COMMON/soloship/deploy.lock"
[ -f "$LOCK" ] || exit 0

INPUT=$(cat 2>/dev/null || true)
SID=$(printf "%s" "$INPUT" | grep -oE "\\"session_id\\"[[:space:]]*:[[:space:]]*\\"[^\\"]*\\"" | head -1 | sed -E "s/.*:[[:space:]]*\\"//; s/\\"$//")
[ -z "$SID" ] && SID="pid-$PPID"

LSID=$(grep -oE "\\"session_id\\":\\"[^\\"]*\\"" "$LOCK" 2>/dev/null | head -1 | sed -E "s/\\"session_id\\":\\"//; s/\\"$//")
[ "$LSID" = "$SID" ] || exit 0

rm -f "$LOCK" 2>/dev/null
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

// --- Cursor -------------------------------------------------------------
//
// Cursor's mechanical floor. Verified against https://cursor.com/docs/hooks
// and https://cursor.com/docs/reference/third-party-hooks (2026-08-18).
//
// Why this exists as a separate installer instead of leaning on Cursor's
// third-party-hook compatibility: Cursor CAN read Claude Code hooks from
// `.claude/settings.json` / `.claude/settings.local.json`, but only in the
// IDE, only when the user has turned on Settings -> Rules, Skills, Subagents
// -> "Include third-party Plugins, Skills, and other configs". Cursor CLOUD
// agents load NONE of that: they load committed `.cursor/hooks.json` (plus
// team/enterprise hooks) and nothing else. Since Soloship writes its Claude
// gates to `.claude/settings.local.json` — which is gitignored in most
// projects and never read in the cloud — a Cursor cloud agent ran with ZERO
// Soloship protection until this installer existed.
//
// Contract differences from the Claude installer, all verified in the docs:
//   * `timeout` is in SECONDS here (Claude's is milliseconds).
//   * Blocking is `{"permission":"deny"}` on stdout (or exit code 2), not
//     exit-2-with-stderr.
//   * The payload arrives as JSON on stdin — same as Claude Code, which
//     also delivers it only on stdin, never via a `$HOOK_TOOL_INPUT` env
//     var. (Soloship's Claude gates read that nonexistent env var until
//     2026-08-27, which made them silently inert — see the fix note on
//     buildPreToolUseScript and friends. Cursor's scripts never made that
//     mistake, which is why this installer's pattern is now the template
//     the Claude gates were rewritten to match.)
//   * `stop` returns `{"followup_message": "..."}`, which Cursor auto-submits
//     as the next user message.
//   * Scripts for PROJECT hooks resolve relative to the project root, so the
//     commands below are `.cursor/hooks/...`, not `./hooks/...`.

export const CURSOR_DIR = ".cursor";
export const CURSOR_HOOKS_DIRNAME = "hooks";
export const CURSOR_RULES_DIRNAME = "rules";
export const CURSOR_HOOKS_SCHEMA_VERSION = 1;
// Prefix every generated script with this so re-running the installer can
// replace exactly its own entries in a hooks.json the user may have added to.
export const CURSOR_HOOK_SCRIPT_PREFIX = "soloship-";
// `.cjs`, NOT `.js`. A project whose package.json declares `"type": "module"`
// makes every `.js` file an ES module, and these scripts use require(). The
// resulting ReferenceError is caught by the scripts' own try/catch, which then
// FAILS OPEN — so the gates emit a perfectly well-formed {"permission":"allow"}
// for every command while protecting nothing. Discovered by dogfooding into
// Soloship's own (ESM) repo, 2026-08-18. `.cjs` is CommonJS in both project
// shapes, so the same file works everywhere.
export const CURSOR_HOOK_SCRIPT_EXT = ".cjs";
// Seconds (Cursor's unit). Generous enough for a git call on a cold cloud VM,
// short enough that a hung hook does not stall the agent loop.
export const CURSOR_HOOK_TIMEOUT_SEC = 15;
// stop-hook follow-ups auto-submit as user messages. One corrective nudge per
// conversation is the point; Cursor's default of 5 would re-nag a plan the
// agent has already been told about.
export const CURSOR_STOP_LOOP_LIMIT = 1;

// Cursor tool names (docs: preToolUse matchers are Shell, Read, Write, Grep,
// Delete, Task, MCP:<name>). Claude's Edit/Write/MultiEdit/NotebookEdit all
// map onto Write; Delete is Cursor-only and can remove a protected file just
// as effectively as a write can corrupt it, so both are matched.
export const CURSOR_WRITE_TOOL_MATCHER = "Write|Delete";

const CURSOR_GENERATED_HEADER = `// GENERATED by Soloship (src/hooks.ts). Edit the source in the Soloship repo
// and re-run \`npx soloship upgrade --agent cursor\`, or /soloship:cursor.
// Local edits here are overwritten on the next upgrade.`;

/**
 * Install Soloship's mechanical gates as Cursor-native project hooks.
 *
 * Writes real, executable files — never symlinks — so the whole set can be
 * committed and therefore picked up by Cursor cloud agents.
 */
export async function installCursorHooks(
  root: string,
  _project: ProjectInfo
): Promise<string[]> {
  const results: string[] = [];
  const cursorDir = join(root, CURSOR_DIR);
  const hooksDir = join(cursorDir, CURSOR_HOOKS_DIRNAME);

  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  const scripts: Record<string, string> = {
    [`${CURSOR_HOOK_SCRIPT_PREFIX}command-safety${CURSOR_HOOK_SCRIPT_EXT}`]:
      buildCursorCommandSafetyScript(),
    [`${CURSOR_HOOK_SCRIPT_PREFIX}file-protection${CURSOR_HOOK_SCRIPT_EXT}`]:
      buildCursorFileProtectionScript(),
    [`${CURSOR_HOOK_SCRIPT_PREFIX}plan-truth${CURSOR_HOOK_SCRIPT_EXT}`]:
      buildCursorPlanTruthScript(),
  };

  for (const [filename, body] of Object.entries(scripts)) {
    // Parse-check before writing. A generated script with a syntax error is the
    // worst possible outcome: Cursor fails OPEN on a crashing hook, so the gate
    // silently protects nothing while `doctor` reports it installed. This
    // happened twice while building these (a "/" inside an interpolated regex
    // literal), so the check is mechanical rather than a note to be careful.
    // Failing loudly here is deliberate — a broken generator is a Soloship bug,
    // not something to ship quietly.
    new Script(body, { filename });
    const path = join(hooksDir, filename);
    writeFileSync(path, body);
    // 0o755: Cursor spawns these directly, so the executable bit is load-bearing.
    chmodSync(path, 0o755);
    verifyCursorHookScript(path, filename);
  }

  const rel = (filename: string) =>
    `${CURSOR_DIR}/${CURSOR_HOOKS_DIRNAME}/${filename}`;

  const fresh = {
    beforeShellExecution: [
      {
        command: rel(`${CURSOR_HOOK_SCRIPT_PREFIX}command-safety${CURSOR_HOOK_SCRIPT_EXT}`),
        timeout: CURSOR_HOOK_TIMEOUT_SEC,
      },
    ],
    preToolUse: [
      {
        command: rel(`${CURSOR_HOOK_SCRIPT_PREFIX}file-protection${CURSOR_HOOK_SCRIPT_EXT}`),
        matcher: CURSOR_WRITE_TOOL_MATCHER,
        timeout: CURSOR_HOOK_TIMEOUT_SEC,
      },
    ],
    stop: [
      {
        command: rel(`${CURSOR_HOOK_SCRIPT_PREFIX}plan-truth${CURSOR_HOOK_SCRIPT_EXT}`),
        timeout: CURSOR_HOOK_TIMEOUT_SEC,
        loop_limit: CURSOR_STOP_LOOP_LIMIT,
      },
    ],
  };

  for (const entries of Object.values(fresh)) {
    for (const entry of entries) {
      if (!existsSync(join(root, entry.command))) {
        throw new Error(
          `Soloship generated a Cursor hook entry pointing at ${entry.command}, which does not exist. This is a Soloship bug — a hooks.json entry with a dead path is a gate that never runs.`
        );
      }
    }
  }

  const hooksPath = join(cursorDir, "hooks.json");
  let config: Record<string, unknown> = {};
  if (existsSync(hooksPath)) {
    try {
      config = JSON.parse(readFileSync(hooksPath, "utf-8"));
    } catch {
      // Unparseable file: start fresh rather than refusing to install a gate.
    }
  }

  // JSON has no comment syntax, so this file cannot carry a GENERATED header
  // (the scripts it points at do). Merge instead of overwrite: hooks.json is a
  // committed file a user may have added their own entries to, and blowing
  // those away is how an installer gets deleted from a project.
  const existingHooks = (config.hooks as Record<string, unknown[]>) || {};
  const mergedHooks: Record<string, unknown[]> = { ...existingHooks };
  for (const [event, entries] of Object.entries(fresh)) {
    const prior = Array.isArray(existingHooks[event]) ? existingHooks[event] : [];
    const custom = prior.filter((entry) => {
      const cmd = (entry as { command?: string })?.command || "";
      return !cmd.includes(
        `${CURSOR_HOOKS_DIRNAME}/${CURSOR_HOOK_SCRIPT_PREFIX}`
      );
    });
    mergedHooks[event] = [...custom, ...entries];
  }

  config.version = CURSOR_HOOKS_SCHEMA_VERSION;
  config.hooks = mergedHooks;
  writeFileSync(hooksPath, JSON.stringify(config, null, 2) + "\n");

  results.push(
    "beforeShellExecution: command safety (blocks rm -rf home/root, direct .env writes, force push to main/master, hardcoded API keys, deploys off the default branch)"
  );
  results.push(
    "preToolUse (Write|Delete): file protection (.soloship/version, docs/plans/ frontmatter + status vocabulary, plan done-checklist, direct .env writes)"
  );
  results.push(
    "stop: plan-truth check (surfaces a plan still claiming in-progress after its branch merged)"
  );
  results.push(
    `Written to ${CURSOR_DIR}/hooks.json + 3 executable scripts in ${CURSOR_DIR}/${CURSOR_HOOKS_DIRNAME}/`
  );
  results.push(
    "Commit these — Cursor cloud agents load committed .cursor/hooks.json ONLY (never ~/.cursor/hooks.json, never Claude Code hooks)"
  );

  return results;
}

/**
 * Run a freshly written hook script once and confirm it actually answers.
 *
 * The syntax check above catches a script that cannot parse. It cannot catch a
 * script that parses fine and then dies at runtime — the ESM/`require()` case,
 * where the script's own error handling converts the crash into a cheerful
 * "allow" and the gate becomes a no-op that every audit reports as installed.
 * The only way to know a gate works is to make it fire.
 */
function verifyCursorHookScript(path: string, filename: string): void {
  // A payload every script must answer without blocking: an innocuous command
  // for the permission gates, an ignorable status for the stop hook.
  const probe = JSON.stringify({
    command: "echo soloship-hook-selftest",
    status: "completed",
    loop_count: 0,
    tool_name: "Write",
    tool_input: {},
  });

  const result = spawnSync(process.execPath, [path], {
    input: probe,
    encoding: "utf8",
    timeout: CURSOR_HOOK_TIMEOUT_SEC * 1000,
  });

  const stdout = (result.stdout || "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    parsed = undefined;
  }

  const answered =
    result.status === 0 && parsed !== undefined && typeof parsed === "object";
  // A probe that BLOCKS is just as broken as one that crashes: it means the
  // gate would deny benign work, which is how a guardrail gets switched off.
  const blocked =
    typeof parsed === "object" &&
    parsed !== null &&
    (parsed as { permission?: string }).permission === "deny";

  if (!answered || blocked) {
    throw new Error(
      [
        `Soloship could not verify the generated Cursor hook ${filename}.`,
        `  exit: ${result.status}`,
        `  stdout: ${stdout || "(empty)"}`,
        `  stderr: ${(result.stderr || "").trim() || "(empty)"}`,
        "This is a Soloship bug, not a project problem. Installing an unverified",
        "hook is worse than installing none: Cursor fails OPEN on a crashing hook,",
        "so the gate would report as installed while protecting nothing.",
      ].join("\n")
    );
  }
}

// Shared gate source for the Cursor scripts. Antigravity's installer carries
// its own inline copies of the same patterns (src/hooks.ts,
// installAntigravityHooks) — folding those onto these constants is a
// worthwhile follow-up, deliberately not done in the same change as adding a
// new target.
// Blocks a recursive delete whose TARGET is a home directory or the
// filesystem root, including any path beneath one. The trailing class is what
// makes `rm -rf ~/Documents` and `rm -rf /Users/x` match while leaving
// `rm -rf dist/`, `rm -rf ./build`, and `rm -rf /tmp/scratch` alone — an
// end-anchor here (the shape the Antigravity gate still carries) silently
// allows every subpath, which is the common case.
// Exported (not just Cursor-local) so committed-gates.ts can reuse the same
// validated patterns for the shared command-safety gate instead of a third
// copy — see committed-gates.ts header.
export const CURSOR_DANGEROUS_RM_RE = String.raw`\brm\s+(?:-\S+\s+)+["']?(?:~|\$HOME|/Users|/home|/)(?:[\s/*"']|$)`;
export const CURSOR_ENV_WRITE_RE = String.raw`(?:cat|echo|printf|>)\s*[^|]*\.env(?:\s|$|\.)`;
// Two independent lookaheads so flag order does not matter: a sequential
// pattern misses `git push origin main --force`, which is how the command is
// most often typed. `--force` as a prefix also covers `--force-with-lease`.
export const CURSOR_FORCE_PUSH_RE = String.raw`git\s+push\b(?=[^\n]*(?:--force|\s-f(?:\s|$)))(?=[^\n]*\b(?:main|master)\b)`;
export const CURSOR_API_KEY_RE = String.raw`(?:ANTHROPIC|OPENAI|STRIPE|FIREBASE|GEMINI|CURSOR)_[A-Z_]*KEY\s*=\s*["'][a-zA-Z0-9_\-]{20,}["']`;
export const CURSOR_DEPLOY_RE = String.raw`(?:npm\s+run\s+deploy|wrangler\s+deploy|fly\s+deploy|vercel\s+--prod|netlify\s+deploy[^\n]*--prod)`;

// Path/plan patterns for the file-protection and plan-truth scripts. Same rule
// as the command patterns: these are STRINGS compiled with new RegExp in the
// generated script, never inlined as /literals/. A literal built by string
// interpolation breaks the moment the pattern contains a "/" — which silently
// produced a script that could not parse, and therefore a gate that protected
// nothing while doctor reported it installed (caught in QA, 2026-08-18).
const SOLOSHIP_VERSION_PATH = ".soloship/version";
const CURSOR_ENV_FILE_RE = String.raw`(^|/)\.env(\.[A-Za-z0-9_-]+)?$`;
const CURSOR_PLANS_PATH_RE = `(^|/)${PLANS_DIR}/`;
const CURSOR_PLAN_STATUS_RE = String.raw`^status:\s*(${PLAN_STATUS_RE})\s*$`;
const CURSOR_PLAN_OPEN_STATUS_RE = String.raw`^status:\s*(${PLAN_STATUS_OPEN_RE})\s*$`;
const CURSOR_PLAN_DONE_RE = String.raw`^status:\s*done\s*$`;
const CURSOR_PLAN_BRANCH_FIELD_RE = String.raw`^branch:\s*(\S+)\s*$`;

// Preamble shared by every generated script: read the stdin payload Cursor
// sends, and fail OPEN on anything unexpected. A gate that cannot parse its
// input must not brick the agent — an installer that bricks the agent gets
// deleted, and then it guards nothing at all.
function cursorScriptPreamble(): string {
  return `#!/usr/bin/env node
${CURSOR_GENERATED_HEADER}
"use strict";

// Cursor sends the hook payload as JSON on stdin (NOT via $HOOK_TOOL_INPUT,
// which is Claude Code-only). CURSOR_PROJECT_DIR and CLAUDE_PROJECT_DIR are
// both set to the workspace root.
function readPayload() {
  try {
    const raw = require("fs").readFileSync(0, "utf-8");
    return JSON.parse(raw || "{}");
  } catch (e) {
    return null;
  }
}

function allow() {
  process.stdout.write(JSON.stringify({ permission: "allow" }));
  process.exit(0);
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({ permission: "deny", user_message: reason, agent_message: reason })
  );
  process.exit(0);
}
`;
}

export function buildCursorCommandSafetyScript(): string {
  return `${cursorScriptPreamble()}
// beforeShellExecution payload: { command, cwd, sandbox }
const data = readPayload();
if (!data) allow();
const cmd = String(data.command || "");

// Patterns are built with new RegExp from JSON-escaped strings, never regex
// literals: several of them contain "/" (as in /Users, /home), which
// terminates a literal early and emits a script that will not even parse.
// Caught by the scratch-repo QA run, 2026-08-18.
const RULES = [
  [new RegExp(${JSON.stringify(CURSOR_DANGEROUS_RM_RE)}), "BLOCKED (Soloship): dangerous rm -rf targeting a home or root directory."],
  [new RegExp(${JSON.stringify(CURSOR_ENV_WRITE_RE)}), "BLOCKED (Soloship): direct .env modification. Secrets are edited by hand, never by an agent."],
  [new RegExp(${JSON.stringify(CURSOR_FORCE_PUSH_RE)}), "BLOCKED (Soloship): force push to main/master rewrites shared history."],
  [new RegExp(${JSON.stringify(CURSOR_API_KEY_RE)}), "BLOCKED (Soloship): looks like a hardcoded API key. Use an env var or the platform secret store."],
];

for (const [re, reason] of RULES) {
  if (re.test(cmd)) deny(reason);
}

// Deploy discipline: production only ever runs the default branch. The full
// Claude gate also checks worktree/dirty-tree/deploy-lock state; this is the
// branch check alone, which is the part that survives a cloud VM.
if (new RegExp(${JSON.stringify(CURSOR_DEPLOY_RE)}).test(cmd)) {
  try {
    const branch = require("child_process")
      .execSync("git branch --show-current 2>/dev/null", { encoding: "utf-8" })
      .trim();
    if (branch && branch !== "main" && branch !== "master") {
      deny(
        "BLOCKED (Soloship): production deploys must run from the default branch. You are on '" +
          branch +
          "'. Merge to main first, then deploy from there."
      );
    }
  } catch (e) {
    // No git, or git failed: nothing to assert, so do not block.
  }
}

allow();
`;
}

export function buildCursorFileProtectionScript(): string {
  return `${cursorScriptPreamble()}
// preToolUse payload: { tool_name, tool_input, tool_use_id, cwd, ... }.
// The exact tool_input field names for Cursor's Write tool are not documented,
// so every plausible key is read and an unrecognized shape falls through to
// allow(). A gate that blocks every edit because it could not find a field
// name is worse than no gate.
const data = readPayload();
if (!data) allow();
const input = (data && data.tool_input) || {};

const target = String(
  input.file_path || input.path || input.target_file || input.absolute_path ||
  input.filePath || input.targetFile || input.file || ""
);
const content = String(
  input.content || input.contents || input.new_string || input.code ||
  input.text || input.new_content || input.newString || ""
);

if (!target) allow();
const norm = target.split("\\\\").join("/");

if (norm.includes(${JSON.stringify(SOLOSHIP_VERSION_PATH)})) {
  deny(
    "BLOCKED (Soloship): ${SOLOSHIP_VERSION_PATH} is managed exclusively by the Soloship CLI. Run 'npx soloship upgrade' instead of editing the stamp."
  );
}

// Writing .env through the file tool bypasses the shell gate entirely.
if (new RegExp(${JSON.stringify(CURSOR_ENV_FILE_RE)}).test(norm)) {
  deny(
    "BLOCKED (Soloship): direct .env modification. Secrets are edited by hand, never by an agent."
  );
}

// docs/plans/ holds live plans only, and every plan carries a status the rest
// of the system reads. Content-dependent checks are skipped when the payload
// carries no content — a shape this script could not read is not evidence of
// a malformed plan.
if (new RegExp(${JSON.stringify(CURSOR_PLANS_PATH_RE)}).test(norm) && norm.endsWith(".md") && content) {
  if (!content.startsWith("---") || !new RegExp(${JSON.stringify(CURSOR_PLAN_STATUS_RE)}, "m").test(content)) {
    deny(
      "BLOCKED (Soloship): files in ${PLANS_DIR}/ must open with YAML frontmatter carrying a valid status (${PLAN_STATUSES.join(", ")}). Drafts belong in ${DRAFTS_DIR}/, handoffs in ${HANDOFFS_DIR}/, point-in-time reports in ${REPORTS_DIR}/."
    );
  }
  // Done-checklist gate: a plan cannot claim done while its own body still
  // lists open work.
  if (
    new RegExp(${JSON.stringify(CURSOR_PLAN_DONE_RE)}, "m").test(content) &&
    new RegExp(${JSON.stringify(PLAN_OPEN_ITEM_GREP)}).test(content)
  ) {
    deny(
      "BLOCKED (Soloship): this plan is being set to 'done' while its body still lists open items (an unchecked - [ ] box, or PENDING/BLOCKED/IN PROGRESS). Resolve or re-scope them first — the plan body is the tiebreaker, not the merge state."
    );
  }
}

allow();
`;
}

export function buildCursorPlanTruthScript(): string {
  return `#!/usr/bin/env node
${CURSOR_GENERATED_HEADER}
"use strict";

// stop payload: { status, loop_count }. The output shape is NOT a permission —
// it is { followup_message }, which Cursor auto-submits as the next user
// message (capped by loop_limit in hooks.json). Emit {} when there is nothing
// to say.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function quiet() {
  process.stdout.write("{}");
  process.exit(0);
}

function speak(message) {
  process.stdout.write(JSON.stringify({ followup_message: message }));
  process.exit(0);
}

try {
  const root =
    process.env.CURSOR_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const plansDir = path.join(root, ${JSON.stringify(PLANS_DIR)});
  if (!fs.existsSync(plansDir)) quiet();

  const branch = execSync("git branch --show-current 2>/dev/null", {
    cwd: root,
    encoding: "utf-8",
  }).trim();
  if (branch !== "main" && branch !== "master") quiet();

  const merged = execSync("git branch --merged " + branch + " 2>/dev/null", {
    cwd: root,
    encoding: "utf-8",
  });
  const mergedBranches = merged
    .split("\\n")
    .map(function (line) {
      return line.replace(new RegExp("^[*+]?\\\\s*"), "").trim();
    })
    .filter(function (line) {
      return line && line !== branch;
    });

  const OPEN_STATUS_RE = new RegExp(${JSON.stringify(CURSOR_PLAN_OPEN_STATUS_RE)}, "m");
  const BRANCH_FIELD_RE = new RegExp(${JSON.stringify(CURSOR_PLAN_BRANCH_FIELD_RE)}, "m");
  const OPEN_ITEM_RE = new RegExp(${JSON.stringify(PLAN_OPEN_ITEM_GREP)});

  const plans = fs.readdirSync(plansDir).filter(function (f) {
    return f.endsWith(".md");
  });

  for (const file of plans) {
    const body = fs.readFileSync(path.join(plansDir, file), "utf-8");
    if (!OPEN_STATUS_RE.test(body)) continue;
    const match = body.match(BRANCH_FIELD_RE);
    if (!match) continue;
    const planBranch = match[1].replace(new RegExp("^[\\"']|[\\"']$", "g"), "");
    if (mergedBranches.indexOf(planBranch) === -1) continue;

    if (OPEN_ITEM_RE.test(body)) {
      speak(
        "PLAN STATUS CHECK (Soloship): branch '" + planBranch + "' is merged into " + branch +
          ", but ${PLANS_DIR}/" + file + " is still open AND its body still lists unfinished items. Merged and done are not the same claim — review its Cutover / QA Plan / Done-When sections, then set the status that is actually true."
      );
    }
    speak(
      "PLAN STATUS CONTRADICTION (Soloship): branch '" + planBranch + "' is merged into " + branch +
        ", and ${PLANS_DIR}/" + file + " lists no open items, but its frontmatter still says the work has not landed. Set 'status: done' in that file now — a plan that lies sends the next agent to build the work a second time."
    );
  }
} catch (e) {
  // A reporting hook must never break the session.
}

quiet();
`;
}
