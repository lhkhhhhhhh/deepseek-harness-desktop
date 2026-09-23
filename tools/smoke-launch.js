'use strict';
/**
 * Standalone smoke test for the launch chain, runnable with plain Node so
 * failures are visible without an Electron window:
 *
 *   node tools/smoke-launch.js [--dsh-home <dir>] [--workspace <dir>]
 *
 * It resolves Node.js, resolves the Harness runtime, starts the service, reports
 * the authenticated URL, verifies the token exchange, and stops the service.
 */

const path = require('node:path');
const fs = require('node:fs');

const { resolveNode } = require('../src/main/node-runtime');
const { resolveRuntime, resolveDshHome } = require('../src/main/dsh-runtime');
const { HarnessService } = require('../src/main/harness-service');

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] !== undefined ? process.argv[index + 1] : fallback;
}

async function main() {
  const workspace = path.resolve(arg('workspace', process.cwd()));
  const dshHome = path.resolve(arg('dsh-home', path.join(process.env.TEMP || process.cwd(), 'dsh-desktop-smoke')));
  const runtime = resolveRuntime();
  const node = await resolveNode();

  console.log('node       :', node.ok ? `${node.version} (${node.exe})` : `MISSING (${node.attempts.length} candidates tried)`);
  console.log('runtime    :', runtime === null ? 'MISSING' : `${runtime.version} via ${runtime.origin}`);
  console.log('runtime dir:', runtime === null ? '-' : runtime.root);
  console.log('DSH_HOME   :', dshHome);
  console.log('workspace  :', workspace);
  if (!node.ok || runtime === null) process.exit(1);
  fs.mkdirSync(dshHome, { recursive: true });

  const service = new HarnessService({
    nodeExe: node.exe,
    launcher: runtime.launcher,
    dshHome,
    workspace,
    port: 0
  });
  service.on('log', (text) => process.stdout.write(`  | ${text}`));

  const started = Date.now();
  try {
    const ready = await service.start();
    console.log(`READY in ${String(Date.now() - started)} ms`);
    console.log('clean url  :', ready.url);

    const bare = await fetch(ready.url, { redirect: 'manual' });
    console.log('bare root  :', bare.status, '(401 without a browser session is expected)');

    const exchange = await fetch(ready.authUrl, { redirect: 'manual' });
    const setCookie = exchange.headers.get('set-cookie') ?? '';
    console.log('token root :', exchange.status, exchange.headers.get('location') ?? '-');
    console.log('cookie     :', setCookie.split(';')[0] || '(none)');

    // Replay the issued cookie against the clean URL, exactly as the window does.
    const authed = await fetch(ready.url, { redirect: 'manual', headers: { cookie: setCookie.split(';')[0] } });
    const html = await authed.text();
    console.log('authed root:', authed.status, `bytes=${String(html.length)}`);
    console.log('title      :', /<title>([^<]*)<\/title>/iu.exec(html)?.[1] ?? '(none)');
    console.log('boot blob  :', html.includes('__DSH_BOOT__') ? 'present' : 'ABSENT');
  } finally {
    await service.stop();
    console.log('service stopped');
  }
}

main().catch((error) => {
  console.error('SMOKE FAILED:', error instanceof Error ? error.message : error);
  process.exit(2);
});
