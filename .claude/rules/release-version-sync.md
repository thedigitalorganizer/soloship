# Release Version Sync (Auto-Loaded)

## The Rule

Every Soloship release must bump **three** version files to the same value, in the same commit:

1. `package.json` — npm package version
2. `.claude-plugin/plugin.json` — Claude Code plugin manifest (installed plugin metadata)
3. `.claude-plugin/marketplace.json` — Claude Code marketplace listing (what the marketplace UI shows users; what triggers "update available" prompts)

They all describe the same software (the npm CLI and the plugin marketplace ship from the same repo and tag together). If any disagrees:
- `package.json` drift → npm install gets wrong version
- `plugin.json` drift → installed-plugin metadata is wrong, SessionStart upgrade hook compares wrong baseline
- **`marketplace.json` drift → the marketplace UI never offers users an update**, so plugin-path users get stuck on whatever was in the listing when they first installed

The third one was discovered on 2026-05-12 after plugin-marketplace users were stuck at 0.1.0 across three published releases — the listing in marketplace.json had never been bumped.

## How To Apply

When running `npm version patch|minor|major` for Soloship, immediately after the npm command edits `package.json`, hand-edit BOTH `.claude-plugin/plugin.json` AND `.claude-plugin/marketplace.json` to the same version. Stage all three in the same commit (use `git commit --amend --no-edit` since `npm version` already created the version commit).

```bash
# Sequence
npm version minor                                           # bumps package.json + creates commit + tag
# At this point: package.json = 0.3.0 (committed), the two manifests are stale

# Sync both manifests
NEW_VERSION=$(node -p "require('./package.json').version")
sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" .claude-plugin/plugin.json
# marketplace.json has the version nested inside plugins[0]; use a more specific match
sed -i.bak -E "s/(\"version\": \")[0-9]+\\.[0-9]+\\.[0-9]+(\")/\\1$NEW_VERSION\\2/" .claude-plugin/marketplace.json
rm .claude-plugin/plugin.json.bak .claude-plugin/marketplace.json.bak

# Amend the version commit so the tag points at the fully-synced state
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json
git commit --amend --no-edit
git tag -f "v$NEW_VERSION"

# Then push and publish
git push origin main --follow-tags --force-with-lease
git push origin "v$NEW_VERSION" --force        # tag was rewritten by --amend, needs explicit push
npm publish
```

The `--force-with-lease` is needed because we amended a commit that `npm version` already wrote. This is safe immediately after the bump (no one else has pulled it yet). If you skipped this step and pushed already, file an issue and bump again rather than rewriting public history.

## Self-Check Before Publish

Before `npm publish`, verify all three match:

```bash
PKG_VER=$(node -p "require('./package.json').version")
PLG_VER=$(node -p "require('./.claude-plugin/plugin.json').version")
MKT_VER=$(node -p "require('./.claude-plugin/marketplace.json').plugins[0].version")
if [ "$PKG_VER" = "$PLG_VER" ] && [ "$PLG_VER" = "$MKT_VER" ]; then
  echo "OK: $PKG_VER"
else
  echo "DRIFT: package=$PKG_VER plugin=$PLG_VER marketplace=$MKT_VER"
fi
```

If `DRIFT:` appears, do NOT publish until all three match.

## Why This Exists

On 2026-05-11 we discovered `.claude-plugin/plugin.json` had been stuck at 0.1.0 across multiple npm releases (we had shipped 0.2.0). Plugin-marketplace users were seeing 0.1.0 in their plugin manifest while running 0.2.0 of the code. The auto-upgrade hook couldn't compare versions correctly.

On 2026-05-12 we discovered the deeper bug: `.claude-plugin/marketplace.json` was ALSO stuck at 0.1.0, and that's the file Claude Code's marketplace UI uses to decide whether an update is available. With marketplace.json frozen, the marketplace had been silently telling plugin users they were already up-to-date across three published releases. Anyone who installed Soloship via the plugin marketplace had been pinned at the first-published version forever.

Putting this rule in a checked-in auto-loaded file means it cascades to every device that pulls the repo, and any future agent doing a release sees the three-file requirement before running `npm version`.

## When This Rule Triggers

- Any `npm version` invocation in Soloship's repo.
- Any `/soloship-shipthorough` or `/soloship-shipfast` run that publishes to npm.
- Any conversation where the user asks to "ship a new version", "release", "publish", or "push v0.X".
- The pre-publish self-check above runs as part of the release sequence.

Does NOT trigger for plain `git push` — versions only need to match at release time, not on every commit.
