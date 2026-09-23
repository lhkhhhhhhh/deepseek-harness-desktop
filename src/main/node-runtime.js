'use strict';
/**
 * Node.js discovery for the desktop client.
 *
 * The Harness service is a Node program; the desktop shell only launches it. We
 * therefore need a real `node.exe`. Discovery is ordered from most explicit to
 * most generic, and every candidate is verified by running `--version` so a
 * stale PATH entry can never produce a confusing failure later.
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

/** Minimum Node major accepted by the Harness runtime. */
const MIN_NODE_MAJOR = 20;

/** Candidate locations, in priority order. */
function candidates() {
  const list = [];
  const push = (value) => {
    if (typeof value === 'string' && value.trim() !== '' && !list.includes(value)) list.push(value);
  };

  // 1. Explicit override (also the escape hatch for unusual installs).
  push(process.env.DSH_DESKTOP_NODE);

  // 2. Whatever the user's PATH resolves to.
  push('node');

  // 3. Standard Windows install locations.
  push(path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'));
  push(path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'nodejs', 'node.exe'));
  push(path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node.exe'));
  push(path.join(process.env.APPDATA || '', 'nvm', 'current', 'node.exe'));

  // 4. Volta / fnm / scoop shims.
  push(path.join(process.env.LOCALAPPDATA || '', 'Volta', 'node.exe'));
  push(path.join(process.env.USERPROFILE || '', 'scoop', 'shims', 'node.exe'));
  push(path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'node.exe'));

  // 5. nvm-windows installs one directory per version.
  try {
    const nvmRoot = [process.env.NVM_HOME, path.join(process.env.APPDATA || '', 'nvm')]
      .find((dir) => dir && fs.existsSync(dir));
    if (nvmRoot) {
      const versions = fs
        .readdirSync(nvmRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^v\d+\./.test(entry.name))
        .map((entry) => entry.name)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const version of versions) push(path.join(nvmRoot, version, 'node.exe'));
    }
  } catch {
    /* a missing or unreadable nvm root is not fatal */
  }

  return list;
}

/** Run `node --version` for one candidate. */
function probe(exe) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(exe, ['--version'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ ok: false, reason: error instanceof Error ? error.message : String(error) });
      return;
    }
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', (chunk) => (err += chunk));
    child.on('error', (error) => resolve({ ok: false, reason: error.message }));
    child.on('close', (code) => {
      const text = `${out}${err}`.trim();
      const match = /v(\d+)\.(\d+)\.(\d+)/.exec(text);
      if (code !== 0 || !match) {
        resolve({ ok: false, reason: text || `exit code ${String(code)}` });
        return;
      }
      resolve({ ok: true, version: match[0], major: Number(match[1]) });
    });
  });
}

/**
 * Resolve a usable `node.exe`.
 * @returns {Promise<{ok: true, exe: string, version: string} | {ok: false, attempts: Array<{exe: string, reason: string}>}>}
 */
async function resolveNode() {
  const attempts = [];
  for (const exe of candidates()) {
    const result = await probe(exe);
    if (result.ok) {
      if (result.major < MIN_NODE_MAJOR) {
        attempts.push({ exe, reason: `Node ${result.version} is too old (need v${String(MIN_NODE_MAJOR)}+)` });
        continue;
      }
      return { ok: true, exe, version: result.version };
    }
    attempts.push({ exe, reason: result.reason });
  }
  return { ok: false, attempts };
}

module.exports = { resolveNode, candidates, MIN_NODE_MAJOR };
