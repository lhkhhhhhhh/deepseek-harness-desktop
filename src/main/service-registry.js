'use strict';
/**
 * Keeps track of the Harness service process the shell started.
 *
 * The normal shutdown path stops the service explicitly. This module covers the
 * abnormal one: if the desktop client is terminated without running its quit
 * handler (task manager, a crash, a kill from a terminal), the Harness service
 * would otherwise stay alive and keep the user's DSH_HOME open. The next launch
 * therefore removes a service recorded by a previous run before starting a new
 * one.
 *
 * A recorded pid is only killed when it is still a Node process, so a recycled
 * pid can never take down an unrelated program.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

class ServiceRegistry {
  /** @param {string} file absolute path of the pid file */
  constructor(file) {
    this.file = file;
    this.pid = null;
  }

  read() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8').trim();
      const pid = Number.parseInt(raw, 10);
      return Number.isInteger(pid) && pid > 0 ? pid : null;
    } catch {
      return null;
    }
  }

  record(pid) {
    this.pid = pid;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, `${String(pid)}\n`, 'utf8');
    } catch {
      /* a failure here only costs us the stale-service check */
    }
  }

  clear(pid = this.pid) {
    if (pid === null) return;
    try {
      if (this.read() === pid) fs.rmSync(this.file, { force: true });
    } catch {
      /* nothing else to do */
    }
    if (this.pid === pid) this.pid = null;
  }
}

/** True when a pid exists and is a Node process (never kill anything else). */
function isNodeProcess(pid) {
  const result = spawnSync(
    'tasklist',
    ['/FI', `PID eq ${String(pid)}`, '/FI', 'IMAGENAME eq node.exe', '/NH', '/FO', 'CSV'],
    { encoding: 'utf8', windowsHide: true }
  );
  return typeof result.stdout === 'string' && result.stdout.toLowerCase().includes('node.exe');
}

/** True when a pid is alive at all (checked without spawning anything). */
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/**
 * Stop a service recorded by a previous run, if it is still around.
 * @returns {{pid: number, killed: boolean}|null}
 */
function cleanStale(registry) {
  const pid = registry.read();
  if (pid === null) return null;
  if (!isAlive(pid)) {
    registry.clear(pid);
    return null;
  }
  if (!isNodeProcess(pid)) {
    // The pid was recycled by something unrelated: forget it and move on.
    registry.clear(pid);
    return null;
  }
  // /T ends the whole tree, /F skips the graceful wait that Windows ignores anyway.
  spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
  registry.clear(pid);
  return { pid, killed: !isAlive(pid) };
}

module.exports = { ServiceRegistry, cleanStale, isNodeProcess, isAlive };
