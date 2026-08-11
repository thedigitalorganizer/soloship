import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Repo-scoped plugin enablement, so Claude Code cloud sessions (claude.ai/code)
// get the Soloship plugin auto-installed at session start. User-scope installs
// (`/plugin install` on a laptop) never carry over to cloud sessions — the
// checked-in `.claude/settings.json` keys below are the documented mechanism:
// https://code.claude.com/docs/en/cloud-environments#what-carries-over-from-your-setup
export const SOLOSHIP_MARKETPLACE_NAME = "soloship";
export const SOLOSHIP_MARKETPLACE_REPO = "thedigitalorganizer/soloship";
export const SOLOSHIP_PLUGIN_ID = `soloship@${SOLOSHIP_MARKETPLACE_NAME}`;

interface ProjectSettings {
  enabledPlugins?: Record<string, boolean>;
  extraKnownMarketplaces?: Record<
    string,
    { source: { source: string; repo?: string; url?: string } }
  >;
  [key: string]: unknown;
}

/**
 * Merge-write the repo-scoped plugin enablement into the project's checked-in
 * `.claude/settings.json`. Idempotent; preserves every existing key, including
 * other marketplaces/plugins the project declares. Never touches
 * `.claude/settings.local.json` (hooks live there, gitignored by design).
 *
 * On laptops this coexists with a user-scope install: Claude Code resolves the
 * same plugin id through the scope chain (one cached install, no double-load),
 * and a user can opt out per-machine via `.claude/settings.local.json`.
 */
export function installCloudPluginEnablement(root: string): string[] {
  const claudeDir = join(root, ".claude");
  const settingsPath = join(claudeDir, "settings.json");

  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
  }

  let settings: ProjectSettings = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    } catch {
      return [
        `.claude/settings.json exists but is not valid JSON — left untouched. ` +
          `Add "${SOLOSHIP_PLUGIN_ID}" to enabledPlugins by hand.`,
      ];
    }
  }

  const alreadyEnabled =
    settings.enabledPlugins?.[SOLOSHIP_PLUGIN_ID] === true &&
    settings.extraKnownMarketplaces?.[SOLOSHIP_MARKETPLACE_NAME] !== undefined;
  if (alreadyEnabled) {
    return [".claude/settings.json (cloud plugin enablement already present)"];
  }

  settings.extraKnownMarketplaces = {
    ...settings.extraKnownMarketplaces,
    [SOLOSHIP_MARKETPLACE_NAME]: {
      source: { source: "github", repo: SOLOSHIP_MARKETPLACE_REPO },
    },
  };
  settings.enabledPlugins = {
    ...settings.enabledPlugins,
    [SOLOSHIP_PLUGIN_ID]: true,
  };

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  return [
    `.claude/settings.json (cloud plugin enablement: ${SOLOSHIP_PLUGIN_ID} — ` +
      `cloud sessions now auto-install the plugin; commit this file)`,
  ];
}
