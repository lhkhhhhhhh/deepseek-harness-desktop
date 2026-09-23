'use strict';
/**
 * Regression test for the shutdown and crash-recovery paths.
 *
 *   1. start the desktop client and wait for its service to become ready
 *   2. force-kill the client (no quit handler): its service must die with it,
 *      so no Harness process is left running against the user's DSH_HOME
 *   3. seed the pid file with a real leftover Node process and start the client
 *      again: the leftover must be removed before the new service starts
 *   4. seed the pid file with a non-Node process: it must be left alone, so a
 *      recycled pid can never take down an unrelated program
 *
 *   node tools/test-orphan-recovery.js
 *
 * The test uses its own settings directory and its own DSH_HOME, so it never
 * touches a real installation.
 */

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workDir = path.join(root, '.test-orphan');
const settingsDir = path.join(workDir, 'settings');
const pidFile = path.join(settingsDir, 'service.pid');
const logFile = path.join(settingsDir, 'desktop.log');
const electron = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : `  (${detail})`}`);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function readPid() {
  try {
    const pid = Number.parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function startClient() {
  const child = spawn(electron, ['.', '--dsh-dev'], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: {
      ...process.env,
      DSH_DESKTOP_SETTINGS_DIR: settingsDir,
      DSH_DESKTOP_RUNTIME: path.join(root, 'runtime', 'dsh-runtime', 'node_modules'),
      DSH_HOME: path.join(workDir, 'dsh-home')
    }
  });
  child.unref();
  return child.pid;
}

async function waitForLog(pattern, since, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let lines = [];
    try {
      lines = fs.readFileSync(logFile, 'utf8').split(/\r?\n/u);
    } catch {
      /* not created yet */
    }
    const line = lines.slice(since).find((entry) => entry.includes(pattern));
    if (line !== undefined) return { line, index: lines.length };
    await delay(500);
  }
  return null;
}

function logLength() {
  try {
    return fs.readFileSync(logFile, 'utf8').split(/\r?\n/u).length;
  } catch {
    return 0;
  }
}

function killProcessOnly(pid) {
  spawnSync('taskkill', ['/pid', String(pid), '/F'], { windowsHide: true });
}

/** A long-lived Node process that stands in for a leftover Harness service. */
function startFakeLeftover() {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();
  return child.pid;
}

/**
 * A long-lived non-Node process that stands in for a recycled pid. It is started
 * through a throwaway PowerShell launcher so it does not share a job object with
 * this test (child processes here die with their parent).
 */
function startFakeUnrelated() {
  const launcher = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      'Start-Process -FilePath powershell.exe -ArgumentList \'-NoProfile\',\'-Command\',\'Start-Sleep -Seconds 300\' -WindowStyle Hidden -PassThru | Select-Object -ExpandProperty Id'
    ],
    { encoding: 'utf8', windowsHide: true }
  );
  const pid = Number.parseInt((launcher.stdout ?? '').trim(), 10);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

async function main() {
  if (!fs.existsSync(electron)) {
    console.error(`electron binary not found at ${electron} - run npm install first`);
    process.exit(1);
  }
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(settingsDir, { recursive: true });
  fs.writeFileSync(
    path.join(settingsDir, 'desktop.json'),
    JSON.stringify({ workspace: root, port: 0, theme: 'system', recentWorkspaces: [] }, null, 2)
  );

  /* 1 + 2: a force-killed client must not leave its service behind ---------- */
  console.log('[1] start the client, then kill it without its quit handler');
  const clientPid = startClient();
  const ready = await waitForLog('service ready', 0, 180_000);
  check('the client starts its service', ready !== null, ready?.line ?? 'no ready line within 180 s');
  if (ready === null) return finish();

  const servicePid = readPid();
  check('the service pid is recorded', servicePid !== null && isAlive(servicePid), `pid ${String(servicePid)}`);

  killProcessOnly(clientPid);
  await delay(5000);
  check('the client is gone', !isAlive(clientPid));
  check(
    'killing the client also ends its service',
    servicePid === null || !isAlive(servicePid),
    `pid ${String(servicePid)}`
  );

  /* 3: a real leftover is removed on the next start ------------------------- */
  console.log('\n[2] seed the pid file with a leftover Node process, then start again');
  const leftover = startFakeLeftover();
  fs.writeFileSync(pidFile, `${String(leftover)}\n`);
  await delay(500);

  const secondPid = startClient();
  const cleaned = await waitForLog('left behind by a previous run', 0, 180_000);
  check('the next launch reports the leftover service', cleaned !== null, cleaned?.line ?? 'no cleanup line within 180 s');

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && isAlive(leftover)) await delay(500);
  check('the leftover was stopped', !isAlive(leftover), `pid ${String(leftover)}`);

  const newService = readPid();
  check(
    'a new service is running for this launch',
    newService !== null && newService !== leftover && isAlive(newService),
    `pid ${String(newService)}`
  );
  check('the pid file now names the new service', readPid() === newService);

  killProcessOnly(secondPid);
  await delay(4000);

  /* 4: a recycled pid is never touched ------------------------------------- */
  console.log('\n[3] the pid guard must ignore a process that is not a Node process');
  const { ServiceRegistry, cleanStale, isNodeProcess } = require('../src/main/service-registry');
  const unrelated = startFakeUnrelated();
  await delay(1500);
  if (unrelated === null || !isAlive(unrelated)) {
    console.log('SKIP  the pid guard checks: could not keep a stand-in process alive in this session');
    finish(true);
    return;
  }
  check('the stand-in process is running', isAlive(unrelated), `pid ${String(unrelated)} (powershell)`);
  check('the guard does not classify it as an orphaned service', !isNodeProcess(unrelated));

  fs.writeFileSync(pidFile, `${String(unrelated)}\n`);
  const outcome = cleanStale(new ServiceRegistry(pidFile));
  check('cleanup reports nothing to remove', outcome === null, JSON.stringify(outcome));
  check('the unrelated process was left alone', isAlive(unrelated), `pid ${String(unrelated)}`);
  check('the stale pid file was cleared', readPid() === null);

  if (isAlive(unrelated)) killProcessOnly(unrelated);

  finish();
}

function finish(skipped = false) {
  const failed = checks.filter((entry) => !entry.ok);
  console.log(`\n${String(checks.length - failed.length)}/${String(checks.length)} checks passed${skipped ? ' (some skipped)' : ''}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('test failed:', error);
  process.exit(2);
});
