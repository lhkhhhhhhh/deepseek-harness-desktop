'use strict';
/**
 * Diagnostics: prints what the desktop shell would use on this machine.
 *
 *   node tools/doctor.js
 */

const path = require('node:path');
const fs = require('node:fs');

const { resolveNode, candidates, MIN_NODE_MAJOR } = require('../src/main/node-runtime');
const { resolveRuntime, resolveDshHome } = require('../src/main/dsh-runtime');
const { workspacePrefs } = require('../src/main/workspace-prefs');
const { store, settingsDir } = require('../src/main/settings');

async function main() {
  console.log('DeepSeek Harness desktop client - diagnostics');
  console.log('');

  const node = await resolveNode();
  console.log('Node.js        :', node.ok ? `${node.version}  ${node.exe}` : `NOT FOUND (need v${String(MIN_NODE_MAJOR)}+)`);
  if (!node.ok) {
    for (const attempt of node.attempts) console.log('   tried       :', attempt.exe, '-', attempt.reason);
    console.log('   candidates  :', candidates().join(', '));
  }

  const runtime = resolveRuntime();
  console.log('Harness runtime:', runtime === null ? 'NOT FOUND' : `${runtime.version} via ${runtime.origin}`);
  if (runtime !== null) console.log('   launcher    :', runtime.launcher);
  else console.log('   fix         : run `npm run fetch:runtime`');

  console.log('DSH_HOME       :', resolveDshHome());
  console.log('workspace      :', workspacePrefs.currentWorkspace(store) ?? '(will be chosen on first run)');
  console.log('port           :', store.get('port') === 0 ? '0 (OS-assigned, never collides)' : String(store.get('port')));

  const settingsFile = path.join(settingsDir, 'desktop.json');
  console.log('desktop config :', fs.existsSync(settingsFile) ? settingsFile : `${settingsFile} (not created yet)`);
  console.log('');

  const ok = node.ok && runtime !== null;
  console.log(ok ? 'OK: this machine can start the desktop client.' : 'NOT READY: fix the items marked above.');
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
