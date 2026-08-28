import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  renameSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { join, dirname, relative } from "node:path";

// Phase 4 of docs/plans/2026-08-27-one-source-of-truth-across-agent-hosts.md:
// `.agents/skills/<name>/` is the canonical location for a PROJECT's own
// skills (as opposed to Soloship's own skill distribution, which ships
// through the Claude Code plugin system into the user's home directory —
// unrelated to this). Three of five hosts read `.agents/skills/` natively
// (Cursor, Codex, Antigravity); Claude Code reads only `.claude/skills/` but
// documents symlinked skill directories as supported and dedupes them. So
// the canonical copy lives once, in `.agents/skills/`, and
// `.claude/skills/<name>` becomes a relative symlink to it — every host sees
// the same skill, no copies to drift.
//
// This operates on a project Soloship is installed INTO, migrating whatever
// state it finds. It is not itself gated on any --agent selection — a
// project may have Claude-only skills today that should still migrate even
// if this run only targets Codex, since the point is one shared layout.

export const CLAUDE_SKILLS_DIR = ".claude/skills";
export const AGENTS_SKILLS_DIR = ".agents/skills";

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function isRealDir(path: string): boolean {
  try {
    const st = lstatSync(path);
    return st.isDirectory() && !st.isSymbolicLink();
  } catch {
    return false;
  }
}

function hasSkillMd(dirPath: string): boolean {
  return existsSync(join(dirPath, "SKILL.md"));
}

function relativeSymlinkTarget(fromPath: string, toPath: string): string {
  return relative(dirname(fromPath), toPath);
}

function safeSymlink(target: string, linkPath: string): boolean {
  try {
    mkdirSync(dirname(linkPath), { recursive: true });
    symlinkSync(target, linkPath, "dir");
    return true;
  } catch {
    // Windows without Developer Mode/Admin, or a filesystem that refuses
    // symlinks — report rather than silently leaving no link at all.
    return false;
  }
}

/** Resolves a symlink's target to an absolute path, or null if it can't be
 * read (broken link, not a symlink, permission error). */
function resolvedSymlinkTarget(linkPath: string): string | null {
  try {
    const raw = readlinkSync(linkPath);
    return join(dirname(linkPath), raw);
  } catch {
    return null;
  }
}

export function syncSkillsCanonical(root: string): string[] {
  const results: string[] = [];
  const claudeDir = join(root, CLAUDE_SKILLS_DIR);
  const agentsDir = join(root, AGENTS_SKILLS_DIR);

  // Step 1a: .agents/skills/<name> symlinks pointing the OLD direction
  // (into .claude/skills/<name>) are reversed — the real directory should
  // live under .agents/skills, not .claude/skills. Runs BEFORE the
  // real-directory migration below: until this reversal happens,
  // .claude/skills/<name> is a real dir AND .agents/skills/<name> already
  // "exists" (as the old-direction symlink) — the exact shape the conflict
  // check below would otherwise misreport as two independent real copies.
  if (existsSync(agentsDir)) {
    for (const name of readdirSync(agentsDir)) {
      const agentsPath = join(agentsDir, name);
      if (!isSymlink(agentsPath)) continue;

      const resolved = resolvedSymlinkTarget(agentsPath);
      const claudePath = join(claudeDir, name);
      const pointsAtClaude = resolved && resolved.replace(/\/$/, "") === claudePath.replace(/\/$/, "");
      if (!pointsAtClaude) continue;
      if (!isRealDir(claudePath)) continue; // broken or unexpected target — leave for manual review

      // The real directory currently lives at .claude/skills/<name> (that's
      // what the old-direction .agents/skills/<name> symlink points at).
      // Drop that symlink, then move the real directory to its canonical
      // home and re-point both names at it correctly.
      unlinkSync(agentsPath);
      renameSync(claudePath, agentsPath);
      const target = relativeSymlinkTarget(claudePath, agentsPath);
      if (safeSymlink(target, claudePath)) {
        results.push(`${name}: reversed symlink direction — real copy now at ${AGENTS_SKILLS_DIR}/${name}, ${CLAUDE_SKILLS_DIR}/${name} symlinks to it`);
      } else {
        results.push(
          `${name}: reversed symlink direction (real copy now at ${AGENTS_SKILLS_DIR}/${name}), but could not recreate the ${CLAUDE_SKILLS_DIR}/${name} symlink`
        );
      }
    }
  }

  // Step 1b: real .claude/skills/<name>/ directories containing SKILL.md
  // move to .agents/skills/<name>/, with a relative symlink left behind.
  if (existsSync(claudeDir)) {
    for (const name of readdirSync(claudeDir)) {
      const claudePath = join(claudeDir, name);

      if (!isRealDir(claudePath)) continue; // symlinks and loose files handled below/elsewhere
      if (!hasSkillMd(claudePath)) continue; // not a skill folder — leave alone (step 2)

      const agentsPath = join(agentsDir, name);
      if (existsSync(agentsPath) || isSymlink(agentsPath)) {
        results.push(
          `CONFLICT: ${CLAUDE_SKILLS_DIR}/${name} is a real directory, but ${AGENTS_SKILLS_DIR}/${name} already exists — left both alone, resolve by hand`
        );
        continue;
      }

      mkdirSync(agentsDir, { recursive: true });
      renameSync(claudePath, agentsPath);
      const target = relativeSymlinkTarget(claudePath, agentsPath);
      if (safeSymlink(target, claudePath)) {
        results.push(`${name}: moved to ${AGENTS_SKILLS_DIR}/${name}, symlinked from ${CLAUDE_SKILLS_DIR}/${name}`);
      } else {
        results.push(
          `${name}: moved to ${AGENTS_SKILLS_DIR}/${name}, but could not create the ${CLAUDE_SKILLS_DIR}/${name} symlink (Windows without Developer Mode/Admin, or an unsupported filesystem) — Claude Code will not see this skill until the symlink is created by hand`
        );
      }
    }
  }

  // Step 1c: real .agents/skills/<name>/ directories lacking a
  // .claude/skills/<name> symlink get one — Claude Code needs the symlink
  // to see a skill that already lives canonically under .agents/skills/.
  if (existsSync(agentsDir)) {
    for (const name of readdirSync(agentsDir)) {
      const agentsPath = join(agentsDir, name);
      if (!isRealDir(agentsPath)) continue;
      if (!hasSkillMd(agentsPath)) continue;

      const claudePath = join(claudeDir, name);
      if (existsSync(claudePath) || isSymlink(claudePath)) continue; // already has something there

      const target = relativeSymlinkTarget(claudePath, agentsPath);
      if (safeSymlink(target, claudePath)) {
        results.push(`${name}: added missing ${CLAUDE_SKILLS_DIR}/${name} symlink to existing ${AGENTS_SKILLS_DIR}/${name}`);
      } else {
        results.push(
          `${name}: could not create ${CLAUDE_SKILLS_DIR}/${name} symlink for existing ${AGENTS_SKILLS_DIR}/${name} — Claude Code will not see this skill`
        );
      }
    }
  }

  // Step 2: loose .md files directly in .claude/skills/ are reported, never
  // moved — Claude Code documents skills only as <name>/SKILL.md folders, so
  // these are probably never loaded, but they are user content.
  if (existsSync(claudeDir)) {
    const looseFiles = readdirSync(claudeDir).filter((f) => {
      const full = join(claudeDir, f);
      try {
        return lstatSync(full).isFile() && f.endsWith(".md");
      } catch {
        return false;
      }
    });
    if (looseFiles.length > 0) {
      results.push(
        `${looseFiles.length} loose .md file(s) directly in ${CLAUDE_SKILLS_DIR}/ (not moved — Claude Code only loads <name>/SKILL.md folders, so these are probably inert, but they're user content): ${looseFiles.join(", ")}`
      );
    }
  }

  return results;
}
