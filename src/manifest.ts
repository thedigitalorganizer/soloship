/**
 * Soloship dependency manifest.
 *
 * Declares the companion plugins, MCP servers, user-scope skills, and global
 * hooks that Soloship either REQUIRES (its skills will break without them) or
 * RECOMMENDS (non-coder workflow is materially improved by having them).
 *
 * The `doctor` command audits this list against the user's actual
 * `~/.claude/` environment and reports what's missing with install commands.
 *
 * Edit this file when Soloship adds or drops companion dependencies. The
 * manifest is the single source of truth for dependency information — do not
 * hard-code checks elsewhere.
 */

export type Severity = "required" | "recommended";

export interface PluginDep {
  /** Plugin identifier as it appears in ~/.claude/settings.json enabledPlugins */
  id: string;
  /** Marketplace the plugin ships from (the suffix after @ in enabledPlugins) */
  source: string;
  severity: Severity;
  /** One-sentence purpose for the doctor output */
  purpose: string;
  /** Which Soloship skills route to this plugin */
  usedBy: string[];
  /** Install guidance shown when missing */
  install: string;
}

export interface McpServerDep {
  /** Server name as it appears in `claude mcp list` */
  name: string;
  severity: Severity;
  purpose: string;
  /** Install command (or template — use <VAULT_PATH>, <PROJECT_ROOT>, etc.) */
  install: string;
  /** Notes shown alongside install command */
  notes?: string;
}

export interface SkillDep {
  /** Directory name under ~/.claude/skills/ */
  name: string;
  severity: Severity;
  purpose: string;
  install: string;
}

export interface HookDep {
  /** Hook event name (SessionStart, PreToolUse, Stop, etc.) */
  event: string;
  /** Matcher value, or null for matcher-less hooks */
  matcher: string | null;
  /** Substring that identifies this hook's command in settings.json */
  commandContains: string;
  severity: Severity;
  purpose: string;
  install: string;
}

export interface DependencyManifest {
  plugins: PluginDep[];
  mcpServers: McpServerDep[];
  skills: SkillDep[];
  hooks: HookDep[];
}

export const SOLOSHIP_MANIFEST: DependencyManifest = {
  plugins: [
    {
      id: "superpowers",
      source: "superpowers-marketplace",
      severity: "required",
      purpose: "Brainstorming, plan-writing, debugging, and parallel-agent primitives.",
      usedBy: [
        "soloship-brainstorm",
        "soloship-plan",
        "soloship-debug",
        "soloship-implement",
      ],
      install:
        "Install 'superpowers' from the Claude Code plugin marketplace. Soloship routers will silently fail without it.",
    },
    {
      id: "compound-engineering",
      source: "every-marketplace",
      severity: "required",
      purpose: "Solution doc authoring, agent-native workflows, review orchestration.",
      usedBy: ["soloship-learn", "soloship-review"],
      install:
        "Install 'compound-engineering' from the Every marketplace in Claude Code.",
    },
  ],

  mcpServers: [
    {
      name: "serena",
      severity: "recommended",
      purpose:
        "Symbol-level code navigation and surgical editing via LSP. Makes refactors safer and faster.",
      install:
        "claude mcp add -s user serena -- uvx --from git+https://github.com/oraios/serena serena start-mcp-server",
      notes: "Requires `uv` (https://docs.astral.sh/uv/).",
    },
    {
      name: "obsidian",
      severity: "recommended",
      purpose: "Cross-project read/search access to an Obsidian vault.",
      install:
        'claude mcp add -s user obsidian -- npx -y obsidian-mcp "<VAULT_PATH>"',
      notes:
        "Replace <VAULT_PATH> with the absolute path to your vault (e.g., '/Users/you/Documents/vault').",
    },
    {
      name: "context7",
      severity: "recommended",
      purpose: "Up-to-date documentation for 9,000+ libraries injected into prompts.",
      install: "claude mcp add -s user context7 -- npx -y @upstash/context7-mcp",
    },
    {
      name: "chrome-devtools",
      severity: "recommended",
      purpose: "Headless browser automation for QA and testing flows.",
      install:
        "claude mcp add -s user chrome-devtools -- npx -y chrome-devtools-mcp@latest",
    },
  ],

  skills: [
    {
      name: "gstack",
      severity: "recommended",
      purpose:
        "Command bundle that provides office-hours, plan reviews (eng/CEO/design), QA, CSO, design-review, retro, and others. Soloship skills delegate to gstack for review and QA workflows.",
      install:
        "gstack has its own install path — check its README. It typically deploys as a directory under ~/.claude/skills/gstack plus individual symlinked skills (office-hours, plan-eng-review, qa, cso, etc.).",
    },
    {
      name: "log",
      severity: "recommended",
      purpose: "Session capture with decisions, rationale, and alternatives.",
      install:
        "The Soloship log skill is shipped as part of Soloship. If missing, re-run `soloship init` from a project directory.",
    },
    {
      name: "obsidian-second-brain",
      severity: "recommended",
      purpose:
        "Vault-aware thinking commands (/challenge, /emerge, /connect) plus ~20 content-ingestion and synthesis commands.",
      install:
        'git clone https://github.com/eugeniughelbur/obsidian-second-brain ~/.claude/skills/obsidian-second-brain && bash ~/.claude/skills/obsidian-second-brain/scripts/setup.sh "<VAULT_PATH>"',
    },
  ],

  hooks: [
    {
      event: "SessionStart",
      matcher: "compact",
      commandContains: "reinject-claude-md-after-compact",
      severity: "recommended",
      purpose:
        "Re-injects the nearest CLAUDE.md after auto-compaction so the agent doesn't forget project rules mid-session.",
      install:
        "Add a SessionStart hook with matcher 'compact' in ~/.claude/settings.json pointing at a script that reads stdin, walks up from `cwd` to find CLAUDE.md, and outputs it as `additionalContext` JSON. See the Soloship docs for a reference script.",
    },
  ],
};
