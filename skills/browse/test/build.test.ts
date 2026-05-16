import { describe, test, expect } from 'bun:test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const SERVER_NODE = path.join(DIST_DIR, 'server-node.mjs');

describe('build: server-node.mjs', () => {
  test('passes node --check if present', () => {
    if (!fs.existsSync(SERVER_NODE)) {
      // browse/dist is gitignored; no build has run in this checkout.
      // Skip rather than fail so plain `bun test` without a prior build passes.
      return;
    }
    expect(() => execSync(`node --check ${JSON.stringify(SERVER_NODE)}`, { stdio: 'pipe' })).not.toThrow();
  });

  test('contains no absolute build-machine path (privacy: git-tracked, ships publicly)', () => {
    if (!fs.existsSync(SERVER_NODE)) return;
    const bundle = fs.readFileSync(SERVER_NODE, 'utf-8');
    // Bun's bundler injects `var __dirname = "<absolute build path>"`.
    // build-node-server.sh Step 2 must rewrite it to the runtime shim and
    // Step 5 must guard the build. If any /Users//home//root/ literal
    // survives, the build machine's path shipped in a public plugin.
    const leaks = bundle.match(/"\/(Users|home|root)\/[^"]+"/g);
    expect(leaks).toBeNull();
  });

  test('does not inline @ngrok/ngrok (must be external)', () => {
    if (!fs.existsSync(SERVER_NODE)) return;
    const bundle = fs.readFileSync(SERVER_NODE, 'utf-8');
    // Dynamic imports of externalized packages show up as string literals in the bundle,
    // not as inlined module code. The heuristic: ngrok's native binding loader would
    // reference its own internals. If any ngrok internal identifier appears, the module
    // got inlined despite the --external flag.
    expect(bundle).not.toMatch(/ngrok_napi|ngrokNapi|@ngrok\/ngrok-darwin|@ngrok\/ngrok-linux|@ngrok\/ngrok-win32/);
  });
});
