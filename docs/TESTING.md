# Testing Foundation

## Testing the npm Installer

```bash
# Create a temp directory and test init
mkdir -p /tmp/foundation-test
cd /tmp/foundation-test
git init -q
npm init -y > /dev/null 2>&1

# Run init with defaults (no prompts)
node ~/Projects/Internal\ Tools/Foundation\ Skill/dist/cli.js init --skip-prompts

# Verify output
ls -la CLAUDE.md AGENTS.md CHANGELOG.md
ls -la .claude/settings.local.json
ls -la .claude/rules/
ls -la .github/workflows/
ls -la __arch__/
cat docs/SOLUTION_GUIDE.md

# Clean up
rm -rf /tmp/foundation-test
```

## Testing on an Existing Project (MAPS)

Run `/foundation-audit` in Claude Code while in the MAPS project directory.
Expected: 10 parallel agents, comprehension checkpoint, full report at
`docs/audit/AUDIT-YYYY-MM-DD.md` + `docs/audit/audit-findings.json`.

Then run `/foundation-bootstrap` to test audit-informed mode.
Expected: reads `audit-findings.json`, presents setup summary, creates/updates
CLAUDE.md and AGENTS.md files based on findings.

## Testing Individual Skills

Each skill can be tested by invoking it directly in Claude Code:

| Skill | Test by typing | Expected behavior |
|-------|---------------|-------------------|
| `/foundation-brainstorm` | "Let's brainstorm a new feature" | Routes to office-hours or brainstorming, ends with design-first nudge |
| `/foundation-plan` | "Plan this feature" | Solution search, enforcement gate, plan file written |
| `/foundation-debug` | "Fix this bug" | Routes to systematic-debugging, suggests /learn if non-obvious |
| `/foundation-shipfast` | "Ship this fix" | Lint → test → build → commit → push → deploy |
| `/foundation-review` | "Review this plan/code" | Plan: eng/CEO/design review. Code: 3-pass parallel review |

## Testing Hooks

### PreToolUse (dangerous command blocking)
Try running `rm -rf ~/` in Claude Code — should be blocked with exit code 2.

### PostToolUse (CHANGELOG check)  
Make a `feat:` commit without updating CHANGELOG.md — should warn via systemMessage.

### Stop (workflow navigator)
Write a plan file to `docs/plans/` — within 2 minutes, the Stop hook should
suggest running /foundation-implement.

### Stop (handoff reminder)
Work for 30+ minutes with uncommitted changes — should nudge to write a handoff note.

### SessionStart (context injection)
Generate `.ai/deps.json` via madge, then start a new session — should see
"Dependency graph loaded" message.

## Verifying Symlinks

```bash
# All 16 Foundation skills should be symlinked
ls -la ~/.claude/skills/foundation-* | wc -l  # Should be 16

# Each should point to the project directory
ls -la ~/.claude/skills/foundation-audit
# → /Users/shawn/Projects/Internal Tools/Foundation Skill/skills/audit
```

## Known Limitations to Test Around

1. madge only works for JS/TS — Python projects won't get dependency graphs
2. Hooks can't enforce judgment — plan validation checks presence, not quality
3. gstack skills still load 60-line preamble — tolerated for occasional use
4. SpecKit + Brand phantoms still appear in system prompt — can't be removed
