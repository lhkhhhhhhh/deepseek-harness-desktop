'use strict';
/**
 * Owns the local Harness service process.
 *
 * The desktop client is only a launcher: the Harness itself keeps running as an
 * ordinary Node process (`dsh web`) with its full plugin graph, and this window
 * displays the GUI that process serves. Nothing about the Harness is replaced,
 * trimmed, or re-implemented here.
 *
 * Startup sequence, per the desktop client contract:
 *   detect (port/token discovery) -> spawn -> wait until the HTTP surface is
 *   live -> hand the authenticated URL to the shell.
 */

const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');

const URL_LINE = /dsh web:\s*(http:\/\/\S+)/u;
const STARTUP_TIMEOUT_MS = 180_000;
const STOP_TIMEOUT_MS = 8_000;
const LOG_RING = 400;

/** Strip userinfo and query values so logs never carry the launch token. */
function sanitize(line) {
  return line
    .replace(/([?&]token=)[^\s&"']+/gu, '$1<redacted>')
    .replace(/\/\/([^/@\s]+)@/gu, '//$1@');
}

class HarnessService extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.nodeExe       absolute path to node.exe
   * @param {string} options.launcher      absolute path to the dsh CLI entry
   * @param {string} options.dshHome       DSH_HOME for the service process
   * @param {string} options.workspace     working directory (workspace root)
   * @param {number} [options.port]        0 lets the OS pick a free port
   * @param {string} [options.profile]     dsh profile name
   */
  constructor(options) {
    super();
    this.options = options;
    this.child = null;
    this.log = [];
    this.url = null;
    this.authUrl = null;
    this.port = null;
    this.state = 'idle';
    this.stopping = false;
  }

  /** The last `count` log lines, oldest first. */
  tail(count = 40) {
    return this.log.slice(-count).join('\n');
  }

  record(stream, chunk) {
    const text = sanitize(String(chunk));
    for (const raw of text.split(/\r?\n/u)) {
      const line = raw.trimEnd();
      if (line === '') continue;
      this.log.push(`[${stream}] ${line}`);
      if (this.log.length > LOG_RING) this.log.shift();
    }
    this.emit('log', text);
  }

  parseUrl(chunk) {
    if (this.authUrl !== null) return;
    const match = URL_LINE.exec(String(chunk));
    if (!match) return;
    const authenticated = match[1].replace(/[.,;)]+$/u, '');
    try {
      const parsed = new URL(authenticated);
      this.port = Number(parsed.port);
      this.authUrl = authenticated;
      this.url = `${parsed.protocol}//${parsed.host}/`;
      this.emit('url', { url: this.url, authUrl: this.authUrl, port: this.port });
    } catch {
      /* an unparsable line is ignored; readiness polling still applies */
    }
  }

  /**
   * Start the service and resolve once its GUI is reachable.
   * @returns {Promise<{url: string, authUrl: string, port: number, pid: number}>}
   */
  async start() {
    // Values are read here, not in the constructor: the shell resolves Node.js
    // and the workspace lazily, then starts the service.
    const { nodeExe, launcher, dshHome, workspace, port = 0, profile = 'web' } = this.options;

    for (const [key, value] of Object.entries({ nodeExe, launcher, workspace, dshHome })) {
      if (typeof value !== 'string' || value === '') {
        throw new Error(`the Harness service needs a valid ${key} (received ${JSON.stringify(value ?? null)})`);
      }
    }

    this.emit('log', `spawn: ${nodeExe} ${launcher} --profile ${profile} --port ${String(port)} --no-open (cwd ${workspace})\n`);

    // stdin is ignored rather than piped: the service must never wait on a
    // console, and nothing may pop a console window on Windows.
    const child = spawn(nodeExe, [launcher, '--profile', profile, '--port', String(port), '--no-open'], {
      cwd: workspace,
      env: {
        ...process.env,
        DSH_HOME: dshHome,
        // Keep the service's own accounting separate from the desktop shell.
        DSH_DESKTOP_HOST: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: false
    });

    this.child = child;
    this.state = 'starting';
    this.emit('state', this.state);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      this.parseUrl(chunk);
      this.record('out', chunk);
    });
    child.stderr.on('data', (chunk) => this.record('err', chunk));

    const exited = new Promise((_, reject) => {
      child.once('error', (error) => reject(new Error(`could not start the Harness service: ${error.message}`)));
      child.once('exit', (code, signal) => {
        this.state = 'exited';
        this.emit('state', this.state);
        if (this.stopping) return;
        reject(new Error(`the Harness service exited during startup (code ${String(code)}, signal ${String(signal)})\n${this.tail(20)}`));
      });
    });

    this.ready = this.waitForReady().then(() => {
      this.state = 'running';
      this.emit('state', this.state);
      return { url: this.url, authUrl: this.authUrl, port: this.port, pid: child.pid };
    });

    child.once('exit', () => {
      if (!this.stopping) this.emit('service-exit');
    });

    return Promise.race([this.ready, exited]);
  }

  /** Poll the service until its HTTP surface answers. */
  async waitForReady() {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (this.child === null || this.child.exitCode !== null) {
        throw new Error(`the Harness service stopped before it became reachable\n${this.tail(20)}`);
      }
      if (this.authUrl !== null) {
        // The token exchange is the strongest readiness signal: a 302 proves the
        // server accepted the launch token and issued the browser session cookie.
        const status = await this.probe(this.authUrl);
        if (status === 302 || status === 303 || status === 200) return;
      }
      if (this.url !== null) {
        const status = await this.probe(this.url);
        if (status !== null && status !== 0) return;
      }
      await delay(250);
    }
    throw new Error(`the Harness service did not become reachable within ${String(STARTUP_TIMEOUT_MS / 1000)}s\n${this.tail(20)}`);
  }

  /** @returns {Promise<number|null>} HTTP status, or null when unreachable. */
  async probe(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      const response = await fetch(url, { redirect: 'manual', signal: controller.signal });
      return response.status;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Stop the service; the desktop shell calls this on quit. */
  async stop() {
    const child = this.child;
    if (child === null || child.exitCode !== null) return;
    this.stopping = true;
    this.state = 'stopping';
    this.emit('state', this.state);

    const closed = new Promise((resolve) => child.once('exit', resolve));
    try {
      child.kill();
    } catch {
      /* already gone */
    }
    const timedOut = await Promise.race([
      closed.then(() => false),
      delay(STOP_TIMEOUT_MS).then(() => true)
    ]);
    if (timedOut && child.exitCode === null) {
      // The service ignores SIGTERM on Windows; end the whole tree instead.
      const { spawnSync } = require('node:child_process');
      try {
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      } catch {
        /* nothing else to try */
      }
    }
    this.child = null;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { HarnessService };
