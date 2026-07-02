import type { ProjectInfo } from "./detect.js";

export type AgentTarget = "auto" | "claude" | "codex" | "both";

export interface AgentSelection {
  claude: boolean;
  codex: boolean;
}

export function parseAgentTarget(value: string | undefined): AgentTarget {
  const target = (value || "auto").toLowerCase();
  if (
    target === "auto" ||
    target === "claude" ||
    target === "codex" ||
    target === "both"
  ) {
    return target;
  }
  throw new Error("--agent must be one of: claude, codex, both");
}

export function resolveAgentSelection(
  target: AgentTarget,
  project: Pick<ProjectInfo, "hasCodex">
): AgentSelection {
  switch (target) {
    case "claude":
      return { claude: true, codex: false };
    case "codex":
      return { claude: false, codex: true };
    case "both":
      return { claude: true, codex: true };
    case "auto":
      return { claude: true, codex: project.hasCodex };
  }
}

export function formatAgentSelection(selection: AgentSelection): string {
  if (selection.claude && selection.codex) return "Claude Code + Codex";
  if (selection.codex) return "Codex";
  return "Claude Code";
}
