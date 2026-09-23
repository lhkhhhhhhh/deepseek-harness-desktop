'use strict';
/**
 * Resolves the Harness runtime and the DSH_HOME data root.
 *
 * Resolution order for the runtime:
 *   1. DSH_DESKTOP_DSH_HOME_OVERRIDE / DSH_DESKTOP_RUNTIME  (diagnostics, tests)
 *   2. the runtime bundled with the installer (resources/dsh-runtime)
 *   3. the user's npm cache runtime (an existing `npx @deepseek-ai/dsh` install)
 *
 * The runtime is only ever read; every writable artefact (profiles, sessions,
 * credentials, plugin state) lives under DSH_HOME.
 */

const fs = require('node:fs');
const path = require('node:path');

const LAUNCHER_TAIL = path.join('@deepseek-ai', 'dsh', 'lib', 'bin.js');

/** A runtime is usable when the package and its launcher both exist. */
function isRuntime(root) {
  if (typeof root !== 'string' || root === '') return false;
  try {
    if (!fs.existsSync(path.join(root, LAUNCHER_TAIL))) return false;
    const manifest = JSON.parse(fs.readFileSync(path.join(root, '@deepseek-ai', 'dsh', 'package.json'), 'utf8'));
    return typeof manifest.version === 'string';
  } catch {
    return false;
  }
}

function runtimeVersion(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, '@deepseek-ai', 'dsh', 'package.json'), 'utf8')).version;
  } catch {
    return 'unknown';
  }
}

/** The runtime shipped inside the installed application. */
function bundledRuntime() {
  const resourcesPath = process.resourcesPath;
  if (typeof resourcesPath !== 'string') return null;
  const root = path.join(resourcesPath, 'dsh-runtime', 'node_modules');
  return isRuntime(root) ? root : null;
}

/**
 * The runtime `npm run fetch:runtime` installs next to the sources. This is what
 * an unpackaged run (development, CI, `npm start`) uses; without it those runs
 * would silently depend on a machine-specific npx cache.
 */
function checkedOutRuntime() {
  const root = path.resolve(__dirname, '..', '..', 'runtime', 'dsh-runtime', 'node_modules');
  return isRuntime(root) ? root : null;
}

/** An existing npx-installed runtime in the user's npm cache. */
function npxRuntime() {
  const localAppData = process.env.LOCALAPPDATA;
  if (typeof localAppData !== 'string' || localAppData === '') return null;
  const cacheRoot = path.join(localAppData, 'npm-cache', '_npx');
  let entries;
  try {
    entries = fs.readdirSync(cacheRoot, { withFileTypes: true });
  } catch {
    return null;
  }
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const root = path.join(cacheRoot, entry.name, 'node_modules');
    if (!isRuntime(root)) continue;
    let mtime = 0;
    try {
      mtime = fs.statSync(path.join(root, LAUNCHER_TAIL)).mtimeMs;
    } catch {
      /* keep zero */
    }
    candidates.push({ root, mtime });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0].root;
}

/**
 * @returns {{root: string, launcher: string, version: string, origin: string} | null}
 */
function resolveRuntime() {
  const candidates = [
    { root: process.env.DSH_DESKTOP_RUNTIME, origin: 'DSH_DESKTOP_RUNTIME' },
    { root: bundledRuntime(), origin: 'bundled' },
    { root: checkedOutRuntime(), origin: 'fetched' },
    { root: npxRuntime(), origin: 'npx-cache' }
  ];
  for (const candidate of candidates) {
    if (isRuntime(candidate.root)) {
      return {
        root: candidate.root,
        launcher: path.join(candidate.root, LAUNCHER_TAIL),
        version: runtimeVersion(candidate.root),
        origin: candidate.origin
      };
    }
  }
  return null;
}

/**
 * The Harness data root: explicit override, else $DSH_HOME, else ~/.dsh. This is
 * deliberately the same root the CLI uses, so the desktop client and the
 * terminal share credentials, settings, sessions, and plugins.
 */
function resolveDshHome() {
  const override = process.env.DSH_DESKTOP_DSH_HOME || process.env.DSH_HOME;
  if (typeof override === 'string' && override.trim() !== '') return path.resolve(override);
  const home = process.env.USERPROFILE || process.env.HOME || process.cwd();
  return path.join(home, '.dsh');
}

module.exports = { resolveRuntime, resolveDshHome, isRuntime, runtimeVersion };
