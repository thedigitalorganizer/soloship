import type { ProjectInfo } from "./detect.js";

export type AgentTarget =
  | "auto"
  | "claude"
  | "codex"
  | "antigravity"
  | "both"
  | "all";

export interface AgentSelection {
  claude: boolean;
  codex: boolean;
  antigravity: boolean;
}

export function parseAgentTarget(value: string | undefined): AgentTarget {
  const target = (value || "auto").toLowerCase();
  if (
    target === "auto" ||
    target === "claude" ||
    target === "codex" ||
    target === "antigravity" ||
    target === "both" ||
    target === "all"
  ) {
    return target;
  }
  throw new Error(
    "--agent must be one of: claude, codex, antigravity, both, all"
  );
}

export function resolveAgentSelection(
  target: AgentTarget,
  project: Pick<ProjectInfo, "hasCodex"> & Partial<Pick<ProjectInfo, "hasAntigravity">>
): AgentSelection {
  switch (target) {
    case "claude":
      return { claude: true, codex: false, antigravity: false };
    case "codex":
      return { claude: false, codex: true, antigravity: false };
    case "antigravity":
      return { claude: false, codex: false, antigravity: true };
    case "both":
      return { claude: true, codex: true, antigravity: false };
    case "all":
      return { claude: true, codex: true, antigravity: true };
    case "auto":
      return {
        claude: true,
        codex: project.hasCodex ?? false,
        antigravity: project.hasAntigravity ?? false,
      };
  }
}

export function formatAgentSelection(selection: AgentSelection): string {
  const parts: string[] = [];
  if (selection.claude) parts.push("Claude Code");
  if (selection.codex) parts.push("Codex");
  if (selection.antigravity) parts.push("Antigravity");
  return parts.join(" + ") || "None";
}

