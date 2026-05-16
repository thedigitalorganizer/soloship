import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProjectInfo } from "./detect.js";

interface HooksConfig {
  hooks: {
    PreToolUse?: HookEntry[];
    PostToolUse?: HookEntry[];
    Stop?: HookEntry[];
    SessionStart?: HookEntry[];
  };
}

interface HookEntry {
  matcher: string;
  hooks: HookCommand[];
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
  ];
  results.push("PreToolUse: block dangerous commands (rm -rf ~, .env edits, force push to main)");
  results.push("PreToolUse: phone-a-friend warnings on commits (6 heuristic patterns)");
  results.push("PreToolUse: security scan on commits (Semgrep, blocks critical findings)");
  results.push("PreToolUse: deploy-freshness gate (blocks stale build artifact, warns on unapplied D1 migrations)");
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
  ];
  results.push("Stop: plan validation + workflow navigator + handoff reminder");

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
  ];
  results.push("SessionStart: checkpoint commit before agent session");
  results.push("SessionStart: daily check for Soloship updates on npm");

  // Merge hooks into settings (don't overwrite other settings)
  settings.hooks = hooks;

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

function buildStopScript(project: ProjectInfo): string {
  return `bash -c '
MESSAGES=""

# Plan validation: check for Key Decisions and Why lines
for plan in docs/plans/$(date +%Y)*.md; do
  if [ -f "$plan" ]; then
    if ! grep -q "Key Decisions" "$plan" 2>/dev/null; then
      MESSAGES="$MESSAGES Plan file $plan is missing a Key Decisions section."
      break
    fi
  fi
done

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
  # Escape for JSON
  ESCAPED=$(echo "$MESSAGES" | sed "s/\"/\\\\\\\\\"/g")
  echo "{\\"systemMessage\\": \\"$ESCAPED\\"}"
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
  ESCAPED=$(printf "%b" "$MSG" | sed "s/\"/\\\\\\\\\"/g" | tr "\\n" " ")
  echo "{\\"systemMessage\\": \\"$ESCAPED\\"}"
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

echo "BLOCKED by billing-confirmation-gate: this edit touches billing / credit / rerun-window state (matched: $WHY). Per the billing-confirmation-gate rule, you must FIRST confirm the data-model semantics with the user — unit & sign (cents vs dollars, balance vs delta), idempotency (what a double-run does), the window boundary (inclusive/exclusive, timezone), and backfill scope (which rows, before/after counts). Do NOT write this code until the user confirms. After they confirm, record it: mkdir -p .ai && echo \\"confirmed: <what> ($(date +%Y-%m-%d))\\" > .ai/.billing-ack — then this gate stands down. Creating that file without an actual confirmation violates the rule." >&2
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
  echo "BLOCKED by recurrence-gate — HARD STOP (this failure class has recurred $TIER times):$HIST" >&2
  echo "A repeat patch is not the fix. Escalate to a MECHANICAL fix (hook, test, or structural change) so it cannot recur. If a patch is genuinely correct this time, record why: mkdir -p .ai && echo \\"<reason> ($(date +%F))\\" >> .ai/.recurrence-ack then re-commit." >&2
  exit 2
fi

if [ $DEGRADED -eq 1 ]; then
  echo "{\\"systemMessage\\": \\"recurrence-gate WARNING (degraded match — heredoc/unparseable commit message, file-overlap only, not blocking on the weaker signal): this commit touches a recorded failure class:$HIST . If it is the same failure, escalate to a mechanical fix instead of re-patching.\\"}"
  exit 0
fi

echo "BLOCKED by recurrence-gate — first recurrence:$HIST" >&2
echo "This failure class was already addressed (see the solution path above). A second patch is not allowed. Either escalate to a mechanical fix (hook/test/structural change) so it cannot recur, or, if a patch is genuinely correct this time, record why: mkdir -p .ai && echo \\"<reason> ($(date +%F))\\" >> .ai/.recurrence-ack then re-commit. Writing that file without a real reason violates the recurrence-gate rule." >&2
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
