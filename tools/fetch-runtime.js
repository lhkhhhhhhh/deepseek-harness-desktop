'use strict';
/**
 * Fetches the Harness runtime that the desktop client launches.
 *
 * The runtime is an ordinary npm dependency closure, not part of this
 * repository: `@deepseek-ai/dsh` pulls in the packages that provide the Harness
 * web profile. Keeping it out of version control keeps the repository small and
 * leaves the runtime's own license and provenance with its publisher.
 *
 *   node tools/fetch-runtime.js              # install the pinned version
 *   node tools/fetch-runtime.js --force      # reinstall from scratch
 *   node tools/fetch-runtime.js --from-npx   # reuse an existing npx cache (offline)
 *
 * The result is `runtime/dsh-runtime/node_modules`, which is exactly what
 * electron-builder copies into the installer and what the app resolves at
 * startup (see src/main/dsh-runtime.js).
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const pkg = manifest.dshRuntime ?? {};
const version = pkg.version ?? 'latest';
const runtimeDir = path.join(root, 'runtime', 'dsh-runtime');
const modulesDir = path.join(runtimeDir, 'node_modules');
const launcher = path.join(modulesDir, '@deepseek-ai', 'dsh', 'lib', 'bin.js');

/** Packages the web profile mounts; missing ones mean a half-installed tree. */
const REQUIRED = [
  '@deepseek-ai/dsh',
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  '@deepseek-ai/dsh-host-webserver',
  '@deepseek-ai/dsh-host-frontend-static',
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-web-frontend'
];

const args = new Set(process.argv.slice(2));

function fail(message) {
  console.error(`\nfetch-runtime: ${message}\n`);
  process.exit(1);
}

/** Which required packages are missing under a node_modules root. */
function missingPackages(from) {
  return REQUIRED.filter((name) => !fs.existsSync(path.join(from, name, 'package.json')));
}

function verify(from) {
  const missing = missingPackages(from);
  if (missing.length > 0) return `missing packages: ${missing.join(', ')}`;
  if (!fs.existsSync(path.join(from, '@deepseek-ai', 'dsh', 'lib', 'bin.js'))) return 'launcher (lib/bin.js) is missing';
  return null;
}

/** Reuse a runtime that already exists on this machine (npx cache or another install). */
function reuseExisting() {
  const candidates = [];
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const npxRoot = path.join(localAppData, 'npm-cache', '_npx');
    if (fs.existsSync(npxRoot)) {
      for (const entry of fs.readdirSync(npxRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        candidates.push(path.join(npxRoot, entry.name, 'node_modules'));
      }
    }
    candidates.push(path.join(localAppData, 'Programs', 'DeepSeek Harness', 'resources', 'dsh-runtime', 'node_modules'));
  }
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, '@deepseek-ai', 'dsh', 'lib', 'bin.js')));
}

function install() {
  fs.mkdirSync(runtimeDir, { recursive: true });

  let npm = 'npm';
  if (process.platform === 'win32') {
    for (const candidate of ['npm.cmd', path.join(path.dirname(process.execPath), 'npm.cmd')]) {
      if (candidate === 'npm.cmd' || fs.existsSync(candidate)) {
        npm = candidate;
        break;
      }
    }
  }

  const spec = `@deepseek-ai/dsh@${version}`;
  console.log(`fetch-runtime: installing ${spec} (this downloads roughly 200 MB)`);
  const result = spawnSync(
    npm,
    [
      'install',
      spec,
      '--prefix',
      runtimeDir,
      '--include=dev',
      '--no-package-lock',
      '--no-audit',
      '--no-fund',
      '--loglevel=error'
    ],
    { stdio: 'inherit', shell: process.platform === 'win32', windowsHide: true }
  );
  if (result.status !== 0) return `npm install exited with code ${String(result.status)}`;
  return null;
}

function main() {
  if (!args.has('--force')) {
    const existing = fs.existsSync(modulesDir) ? verify(modulesDir) : 'not installed';
    if (existing === null) {
      console.log(`fetch-runtime: runtime already present at ${path.relative(root, modulesDir)}`);
      return;
    }
  }

  if (args.has('--from-npx')) {
    const source = reuseExisting();
    if (!source) fail('no existing runtime found in the npm cache or an installed copy of the app');
    fs.rmSync(runtimeDir, { recursive: true, force: true });
    fs.mkdirSync(runtimeDir, { recursive: true });
    console.log(`fetch-runtime: copying ${source}`);
    fs.cpSync(source, modulesDir, { recursive: true, dereference: true });
  } else {
    if (args.has('--force')) fs.rmSync(modulesDir, { recursive: true, force: true });
    const error = install();
    if (error !== null) {
      const fallback = reuseExisting();
      if (fallback !== null) {
        console.warn(`fetch-runtime: ${error}; falling back to the local runtime at ${fallback}`);
        fs.rmSync(runtimeDir, { recursive: true, force: true });
        fs.mkdirSync(runtimeDir, { recursive: true });
        fs.cpSync(fallback, modulesDir, { recursive: true, dereference: true });
      } else {
        fail(error);
      }
    }
  }

  const problem = verify(modulesDir);
  if (problem !== null) fail(`runtime is incomplete: ${problem}`);

  const size = totalSize(modulesDir);
  console.log(`fetch-runtime: ready at ${path.relative(root, modulesDir)} (${size} MB)`);
}

function totalSize(dir) {
  let bytes = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) {
        try {
          bytes += fs.statSync(full).size;
        } catch {
          /* ignore */
        }
      }
    }
  }
  return Math.round(bytes / 1024 / 1024);
}

main();
