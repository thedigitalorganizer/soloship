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
  ];
  results.push("PreToolUse: block dangerous commands (rm -rf ~, .env edits, force push to main)");
  results.push("PreToolUse: phone-a-friend warnings on commits (6 heuristic patterns)");
  results.push("PreToolUse: security scan on commits (Semgrep, blocks critical findings)");

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

  // SessionStart: Checkpoint commit + context injection
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
          command: buildSessionStartScript(),
          timeout: 10000,
        },
      ],
    },
  ];
  results.push("SessionStart: checkpoint commit before agent session");
  results.push("SessionStart: context injection");

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

function buildSessionStartScript(): string {
  return `bash -c '
# Dependency graph injection removed.
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
