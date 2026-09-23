'use strict';
/**
 * Pre-build guard: fails fast when an asset an installer needs is missing,
 * instead of producing a broken package.
 *
 *   node tools/verify-assets.js
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const problems = [];

function require_(relative, hint) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) problems.push({ relative, hint });
  return full;
}

require_('build/icon.ico', 'run: powershell -NoProfile -ExecutionPolicy Bypass -File build/make-icon.ps1');
const launcher = require_(
  path.join('runtime', 'dsh-runtime', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
  'run: npm run fetch:runtime'
);

if (problems.length === 0) {
  let version = 'unknown';
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(path.dirname(launcher), '..', 'package.json'), 'utf8')
    );
    version = manifest.version;
  } catch {
    /* keep the placeholder */
  }
  console.log(`verify-assets: icon and Harness runtime ${version} are present`);
  process.exit(0);
}

console.error('verify-assets: missing build assets\n');
for (const problem of problems) {
  console.error(`  ${problem.relative}`);
  console.error(`      -> ${problem.hint}`);
}
console.error('');
process.exit(1);
