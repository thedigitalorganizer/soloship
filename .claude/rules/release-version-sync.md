# Release Version Sync (Auto-Loaded)

## The Rule

Every Soloship release must bump **two** version files to the same value, in the same commit:

1. `package.json` — npm package version
2. `.claude-plugin/plugin.json` — Claude Code plugin manifest version

They describe the same software (the npm CLI and the plugin marketplace ship from the same repo and tag together). If they disagree, plugin-marketplace users see one version while npm users see another, and the SessionStart upgrade-check hook compares the wrong baseline.

## How To Apply

When running `npm version patch|minor|major` for Soloship, immediately after the npm command edits `package.json`, hand-edit `.claude-plugin/plugin.json` to the same version. Stage both in the same commit (use `git commit --amend --no-edit` if `npm version` already created the commit, or edit `.claude-plugin/plugin.json` before `npm version` runs so it gets included).

```bash
# Sequence
npm version minor                                           # bumps package.json + creates commit + tag
# At this point: package.json = 0.3.0 (committed), plugin.json = 0.2.0 (stale, uncommitted-ahead-of)

# Sync plugin.json
NEW_VERSION=$(node -p "require('./package.json').version")
sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" .claude-plugin/plugin.json
rm .claude-plugin/plugin.json.bak

# Amend the version commit so the tag points at the fully-synced state
git add .claude-plugin/plugin.json
git commit --amend --no-edit
git tag -f "v$NEW_VERSION"

# Then push and publish
git push origin main --follow-tags --force-with-lease
npm publish
```

The `--force-with-lease` is needed because we amended a commit that `npm version` already wrote. This is safe immediately after the bump (no one else has pulled it yet). If you skipped this step and pushed already, file an issue and bump again rather than rewriting public history.

## Self-Check Before Publish

Before `npm publish`, verify:

```bash
PKG_VER=$(node -p "require('./package.json').version")
PLG_VER=$(node -p "require('./.claude-plugin/plugin.json').version")
[ "$PKG_VER" = "$PLG_VER" ] && echo "OK: $PKG_VER" || echo "DRIFT: package=$PKG_VER plugin=$PLG_VER"
```

If `DRIFT:` appears, do NOT publish until they match.

## Why This Exists

On 2026-05-12 we discovered `.claude-plugin/plugin.json` had been stuck at 0.1.0 across multiple npm releases (we were at 0.2.0). Plugin-marketplace users were seeing 0.1.0 in their plugin manifest while running 0.2.0 of the code. The auto-upgrade hook couldn't compare versions correctly. Putting this rule in a checked-in auto-loaded file means it cascades to every device that pulls the repo, and any future agent doing a release sees the requirement before running `npm version`.

## When This Rule Triggers

- Any `npm version` invocation in Soloship's repo.
- Any `/soloship-shipthorough` or `/soloship-shipfast` run that publishes to npm.
- Any conversation where the user asks to "ship a new version", "release", "publish", or "push v0.X".
- The pre-publish self-check above runs as part of the release sequence.

Does NOT trigger for plain `git push` — versions only need to match at release time, not on every commit.
