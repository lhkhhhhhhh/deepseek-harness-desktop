'use strict';
/**
 * Small JSON settings store for the desktop shell.
 *
 * The Harness keeps its own state (credentials, settings, sessions, plugin
 * state) under DSH_HOME; this file only holds shell-scoped facts such as the
 * default workspace directory and the last window geometry.
 */

const fs = require('node:fs');
const path = require('node:path');

function resolveSettingsDir() {
  const override = process.env.DSH_DESKTOP_SETTINGS_DIR;
  if (typeof override === 'string' && override.trim() !== '') return override;
  const appData = process.env.APPDATA;
  if (typeof appData === 'string' && appData.trim() !== '') {
    return path.join(appData, 'DeepSeek Harness');
  }
  return path.join(process.cwd(), '.dsh-desktop');
}

const DEFAULTS = {
  /** Workspace the Harness service boots in; null means "ask on first run". */
  workspace: null,
  /** Remembered window geometry. */
  window: null,
  /** Harness spawn port; 0 asks the OS for a free port (never collides). */
  port: 0,
  /** Electron nativeTheme source: system | light | dark. */
  theme: 'system',
  /** Recent workspaces, newest first. */
  recentWorkspaces: []
};

class Store {
  constructor(file) {
    this.file = file;
    this.data = { ...DEFAULTS };
    this.persistTimer = null;
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') this.data = { ...DEFAULTS, ...parsed };
    } catch {
      /* first run, or a corrupt file: fall back to defaults */
    }
    return this.data;
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    this.schedule();
  }

  setMany(patch) {
    Object.assign(this.data, patch);
    this.schedule();
  }

  /** Coalesce bursts of writes (window geometry changes on every drag). */
  schedule() {
    if (this.persistTimer !== null) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.flush();
    }, 400);
  }

  flush() {
    if (this.persistTimer !== null) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8');
    } catch {
      /* a read-only settings directory must not break the session */
    }
  }
}

const settingsDir = resolveSettingsDir();
const store = new Store(path.join(settingsDir, 'desktop.json'));
store.load();

module.exports = { store, settingsDir, DEFAULTS };
