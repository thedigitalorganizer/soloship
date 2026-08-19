import type { ProjectInfo } from "./detect.js";

export type AgentTarget =
  | "auto"
  | "claude"
  | "codex"
  | "antigravity"
  | "cursor"
  | "both"
  | "all";

export interface AgentSelection {
  claude: boolean;
  codex: boolean;
  antigravity: boolean;
  cursor: boolean;
}

export function parseAgentTarget(value: string | undefined): AgentTarget {
  const target = (value || "auto").toLowerCase();
  if (
    target === "auto" ||
    target === "claude" ||
    target === "codex" ||
    target === "antigravity" ||
    target === "cursor" ||
    target === "both" ||
    target === "all"
  ) {
    return target;
  }
  throw new Error(
    "--agent must be one of: claude, codex, antigravity, cursor, both, all"
  );
}

export function resolveAgentSelection(
  target: AgentTarget,
  project: Pick<ProjectInfo, "hasCodex"> &
    Partial<Pick<ProjectInfo, "hasAntigravity" | "hasCursor">>
): AgentSelection {
  switch (target) {
    case "claude":
      return { claude: true, codex: false, antigravity: false, cursor: false };
    case "codex":
      return { claude: false, codex: true, antigravity: false, cursor: false };
    case "antigravity":
      return { claude: false, codex: false, antigravity: true, cursor: false };
    case "cursor":
      return { claude: false, codex: false, antigravity: false, cursor: true };
    case "both":
      return { claude: true, codex: true, antigravity: false, cursor: false };
    case "all":
      return { claude: true, codex: true, antigravity: true, cursor: true };
    case "auto":
      return {
        claude: true,
        codex: project.hasCodex ?? false,
        antigravity: project.hasAntigravity ?? false,
        cursor: project.hasCursor ?? false,
      };
  }
}

export function formatAgentSelection(selection: AgentSelection): string {
  const parts: string[] = [];
  if (selection.claude) parts.push("Claude Code");
  if (selection.codex) parts.push("Codex");
  if (selection.antigravity) parts.push("Antigravity");
  if (selection.cursor) parts.push("Cursor");
  return parts.join(" + ") || "None";
}

