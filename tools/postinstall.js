'use strict';
/**
 * npm postinstall hook.
 *
 * Windows packaging needs two things that a plain `npm install` does not set up:
 * a 7-Zip shim that survives electron-builder's winCodeSign archive (which
 * contains macOS symlinks an unprivileged account cannot create), and a note in
 * the console when the Harness runtime still has to be fetched.
 *
 * Everything here is best-effort: a failure must never break `npm install`.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

if (process.platform === 'win32') {
  const script = path.join(root, 'tools', 'prepare-builder-tools.ps1');
  if (fs.existsSync(script)) {
    const result = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script],
      { stdio: 'inherit', windowsHide: true }
    );
    if (result.status !== 0) {
      console.warn('postinstall: could not prepare the packaging tools; `npm run dist` may need an elevated shell');
    }
  }
}

const launcher = path.join(root, 'runtime', 'dsh-runtime', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
if (!fs.existsSync(launcher)) {
  console.log('\npostinstall: the Harness runtime is not installed yet - run `npm run fetch:runtime` before packaging.\n');
}
