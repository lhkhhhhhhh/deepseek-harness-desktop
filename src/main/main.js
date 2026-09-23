'use strict';
/**
 * DeepSeek Harness desktop client - Electron main process.
 *
 * Responsibilities, in order:
 *   1. find a Node.js runtime and the Harness runtime the installer shipped;
 *   2. resolve the user's DSH_HOME so credentials, settings, plugins, API keys,
 *      and sessions are the same ones the terminal `dsh` uses;
 *   3. start the local Harness service when it is not already running, and wait
 *      until it is reachable;
 *   4. show the Harness GUI inside a normal Windows application window.
 *
 * No console window is ever created, and the Harness core is never modified:
 * the client launches the shipped `dsh web` profile and displays what it serves.
 */

const { app, BrowserWindow, Menu, dialog, nativeTheme, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const { store } = require('./settings');
const { resolveRuntime, resolveDshHome } = require('./dsh-runtime');
const { resolveNode } = require('./node-runtime');
const { HarnessService } = require('./harness-service');
const { buildMenu } = require('./menu');
const { workspacePrefs } = require('./workspace-prefs');
const { iconPath, packaged } = require('./resources');
const { ServiceRegistry, cleanStale } = require('./service-registry');

app.setAppUserModelId('ai.deepseek.harness.desktop');
app.setName('DeepSeek Harness');

// Some Windows configurations (older drivers, RDP sessions) render Chromium
// windows blank; software compositing is the reliable default for a desktop
// shell, and DSH_DESKTOP_GPU=1 opts back into hardware acceleration.
if (process.env.DSH_DESKTOP_GPU !== '1') app.disableHardwareAcceleration();

const DEV = process.argv.includes('--dsh-dev');
const PARTITION = 'persist:dsh-desktop';
const ICON = iconPath();

// Pin the user-data directory before anything reads or writes settings: the
// default is derived from the application name, and Electron must know the name
// before the first app.getPath('userData') call. DSH_DESKTOP_SETTINGS_DIR moves
// both the settings and the Electron profile, which is what lets a development
// checkout run side by side with an installed copy.
const APP_DATA_DIR =
  process.env.DSH_DESKTOP_SETTINGS_DIR && process.env.DSH_DESKTOP_SETTINGS_DIR.trim() !== ''
    ? path.resolve(process.env.DSH_DESKTOP_SETTINGS_DIR)
    : path.join(process.env.APPDATA || app.getPath('appData'), 'DeepSeek Harness');
app.setPath('userData', APP_DATA_DIR);

/** @type {HarnessService|null} */
let service = null;
/** @type {BrowserWindow|null} */
let mainWindow = null;
/** @type {BrowserWindow|null} */
let splashWindow = null;
let quitting = false;
let lastUrl = null;
let lastAuthUrl = null;
let booting = false;

/** Records the service pid so a crashed run can be cleaned up on the next start. */
const serviceRegistry = new ServiceRegistry(path.join(APP_DATA_DIR, 'service.pid'));

const logFile = () => path.join(APP_DATA_DIR, 'desktop.log');

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  if (DEV) process.stdout.write(`${line}\n`);
  try {
    fs.appendFileSync(logFile(), `${line}\n`, 'utf8');
  } catch {
    /* logging must never break startup */
  }
}

/* ------------------------------------------------------------------ splash -- */

const SPLASH_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>DeepSeek Harness</title>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; }
  body {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 16px; font-family: "Segoe UI", system-ui, sans-serif;
    background: linear-gradient(140deg, #4d6bfe 0%, #182c94 100%); color: #fff;
    user-select: none; cursor: default;
  }
  .mark { font-size: 42px; font-weight: 700; letter-spacing: 2px; }
  .title { font-size: 16px; font-weight: 600; }
  .bar { width: 190px; height: 3px; border-radius: 2px; background: rgba(255,255,255,.25); overflow: hidden; }
  .bar > i { display: block; width: 40%; height: 100%; border-radius: 2px; background: #fff;
             animation: slide 1.15s ease-in-out infinite; }
  @keyframes slide { 0% { transform: translateX(-110%); } 100% { transform: translateX(360%); } }
  .stage { font-size: 12.5px; opacity: .85; min-height: 18px; }
</style></head>
<body>
  <div class="mark">DS</div>
  <div class="title">DeepSeek Harness</div>
  <div class="bar"><i></i></div>
  <div class="stage">Starting the local Harness service...</div>
</body></html>`;

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 250,
    resizable: false,
    frame: false,
    show: false,
    center: true,
    title: 'DeepSeek Harness',
    icon: ICON,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  void splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(SPLASH_HTML)}`).catch(() => undefined);
  splashWindow.once('ready-to-show', () => splashWindow?.show());
  splashWindow.on('closed', () => (splashWindow = null));
}

function closeSplash() {
  if (splashWindow !== null && !splashWindow.isDestroyed()) splashWindow.close();
  splashWindow = null;
}

/* ------------------------------------------------------------------ window -- */

function defaultBounds() {
  const { screen } = require('electron');
  const area = screen.getPrimaryDisplay().workAreaSize;
  return {
    width: Math.min(1440, Math.max(1000, Math.round(area.width * 0.78))),
    height: Math.min(960, Math.max(680, Math.round(area.height * 0.82)))
  };
}

/** Restore saved geometry only when it still lands on a connected display. */
function restoredBounds() {
  const saved = store.get('window');
  const base = defaultBounds();
  if (!saved || typeof saved !== 'object') return base;
  const width = Number.isFinite(saved.width) ? saved.width : base.width;
  const height = Number.isFinite(saved.height) ? saved.height : base.height;
  if (!Number.isFinite(saved.x) || !Number.isFinite(saved.y)) return { width, height };

  const { screen } = require('electron');
  const onScreen = screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    return (
      saved.x < area.x + area.width - 40 &&
      saved.y < area.y + area.height - 40 &&
      saved.x + 200 > area.x &&
      saved.y + 100 > area.y
    );
  });
  return onScreen ? { x: saved.x, y: saved.y, width, height } : { width, height };
}

function createMainWindow() {
  const bounds = restoredBounds();
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'DeepSeek Harness',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141414' : '#ffffff',
    icon: ICON,
    webPreferences: {
      partition: PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  const remember = () => {
    if (mainWindow === null || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;
    const b = mainWindow.getNormalBounds();
    store.set('window', { x: b.x, y: b.y, width: b.width, height: b.height });
  };
  for (const event of ['resize', 'move', 'maximize', 'unmaximize']) mainWindow.on(event, remember);

  mainWindow.once('ready-to-show', () => {
    closeSplash();
    if (mainWindow === null || mainWindow.isDestroyed()) return;
    log('harness window ready to show');
    mainWindow.show();
    mainWindow.focus();
  });

  // Links: the Harness surface stays in this window; everything else opens in
  // the user's default browser rather than an uncontrolled Electron window.
  const isHarnessUrl = (url) => url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost');
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isHarnessUrl(url)) return { action: 'allow' };
    if (/^https?:/u.test(url)) shell.openExternal(url).catch(() => undefined);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isHarnessUrl(url) || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('file:')) return;
    event.preventDefault();
    if (/^https?:/u.test(url)) shell.openExternal(url).catch(() => undefined);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

/**
 * Load the Harness GUI. The authenticated URL performs the launch-token
 * exchange and ends on the clean local URL, which is what the window then
 * shows; a stale or missing cookie falls back to the same exchange again.
 */
async function loadGui({ url, authUrl }) {
  const window = mainWindow;
  if (window === null || window.isDestroyed()) return;
  try {
    await window.loadURL(authUrl);
    lastUrl = url;
    lastAuthUrl = authUrl;
  } catch (error) {
    log(`token handoff failed (${error instanceof Error ? error.message : String(error)}); loading the plain URL`);
    await window.loadURL(url).catch(() => undefined);
    lastUrl = url;
    lastAuthUrl = url;
  }
}

function showFailure(error, options = {}) {
  const detail = error instanceof Error ? error.message : String(error);
  log(`startup failure: ${detail}`);
  closeSplash();
  const buttons = options.retry === false ? ['Open log', 'Quit'] : ['Retry', 'Open log', 'Quit'];
  const choice = dialog.showMessageBoxSync({
    type: 'error',
    title: 'DeepSeek Harness could not start',
    message: options.message || 'The local Harness service did not start.',
    detail,
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1,
    noLink: true
  });
  const picked = buttons[choice];
  if (picked === 'Retry') {
    void boot();
    return;
  }
  if (picked === 'Open log') shell.openPath(logFile()).catch(() => undefined);
  app.quit();
}

/* -------------------------------------------------------------------- boot -- */

function ensureService() {
  if (service !== null) return null;

  const runtime = resolveRuntime();
  if (runtime === null) {
    return new Error(
      [
        'The Harness runtime could not be located.',
        '',
        'Reinstall DeepSeek Harness, or set DSH_DESKTOP_RUNTIME to an existing',
        '@deepseek-ai/dsh installation (the directory that contains @deepseek-ai).'
      ].join('\n')
    );
  }

  const dshHome = resolveDshHome();
  try {
    fs.mkdirSync(dshHome, { recursive: true });
  } catch (error) {
    return new Error(`The Harness data directory is not writable:\n${dshHome}\n\n${String(error)}`);
  }

  service = new HarnessService({
    nodeExe: null, // filled in by boot() once Node is resolved
    launcher: runtime.launcher,
    dshHome,
    workspace: null,
    port: Number(store.get('port')) || 0,
    registry: serviceRegistry
  });
  service.runtime = runtime;

  service.on('log', (text) => {
    if (DEV) process.stdout.write(text);
  });
  service.on('service-exit', () => {
    if (quitting) return;
    log('the Harness service exited unexpectedly');
    const window = mainWindow;
    if (window === null || window.isDestroyed() || window.webContents.isDestroyed()) return;
    void window.webContents
      .executeJavaScript(
        'document.body.innerHTML = \'<div style="font:14px/1.6 Segoe UI,sans-serif;padding:32px;color:#c62828">' +
          'The local Harness service stopped. Use Service &gt; Restart Harness service, or start DeepSeek Harness again.</div>\';'
      )
      .catch(() => undefined);
  });

  return null;
}

async function boot() {
  if (booting) return;
  booting = true;
  try {
    const workspace = await workspacePrefs.ensureWorkspace(dialog, store, DEV);
    if (workspace === null) {
      app.quit();
      return;
    }

    // A previous run that was killed without its quit handler leaves the service
    // alive. Remove it before starting one, so the user's DSH_HOME has a single
    // owner and nothing is left running in the background.
    const stale = cleanStale(serviceRegistry);
    if (stale !== null) {
      log(`removed a Harness service left behind by a previous run (pid ${String(stale.pid)})`);
    }

    const setupError = ensureService();
    if (setupError !== null) {
      showFailure(setupError, { message: 'The Harness runtime could not be located.', retry: false });
      return;
    }

    if (service.options.nodeExe === null) {
      const node = await resolveNode();
      if (!node.ok) {
        showFailure(
          new Error(
            [
              'Node.js was not found on this computer.',
              '',
              'DeepSeek Harness runs on Node.js. Install the LTS build from https://nodejs.org and start this application again.',
              '',
              'Searched:',
              ...node.attempts.slice(0, 8).map((attempt) => `  ${attempt.exe} - ${attempt.reason}`)
            ].join('\n')
          ),
          { message: 'Node.js is required but was not found.' }
        );
        return;
      }
      service.options.nodeExe = node.exe;
      log(`node ${node.version} (${node.exe})`);
    }

    service.options.workspace = workspace;
    log(`runtime ${service.runtime.version} via ${service.runtime.origin} (${service.runtime.root})`);
    log(`DSH_HOME ${service.options.dshHome}`);
    log(`workspace ${workspace}`);

    const ready = await service.start();
    log(`service ready on port ${String(ready.port)} (pid ${String(ready.pid)})`);

    if (mainWindow === null || mainWindow.isDestroyed()) createMainWindow();
    await loadGui(ready);
  } catch (error) {
    log(`boot threw: ${error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)}`);
    showFailure(error);
  } finally {
    booting = false;
  }
}

async function restartService() {
  const active = service;
  service = null;
  if (active !== null) await active.stop();
  if (mainWindow !== null && !mainWindow.isDestroyed()) {
    closeSplash();
    await mainWindow
      .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
        '<body style="font:14px/1.6 Segoe UI,sans-serif;padding:32px;color:#333">Restarting DeepSeek Harness...</body>'
      )}`)
      .catch(() => undefined);
  }
  await boot();
}

/* ------------------------------------------------------------- lifecycle --- */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow === null) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  void app.whenReady().then(async () => {
    const savedTheme = store.get('theme');
    nativeTheme.themeSource = ['system', 'light', 'dark'].includes(savedTheme) ? savedTheme : 'system';
    Menu.setApplicationMenu(
      buildMenu({
        getLastUrl: () => lastUrl,
        getAuthUrl: () => lastAuthUrl,
        reload: () => mainWindow?.webContents.reload(),
        changeWorkspace: async () => {
          const current = workspacePrefs.currentWorkspace(store) ?? app.getPath('home');
          const picked = await workspacePrefs.pickWorkspace(dialog, current);
          if (picked === null || picked === current) return;
          workspacePrefs.rememberWorkspace(store, picked);
          await restartService();
        },
        useWorkspace: async (workspace) => {
          if (!workspacePrefs.isDirectory(workspace)) return;
          workspacePrefs.rememberWorkspace(store, workspace);
          await restartService();
        },
        setTheme: (theme) => {
          store.set('theme', theme);
          nativeTheme.themeSource = theme;
          Menu.setApplicationMenu(Menu.getApplicationMenu());
        },
        restartService,
        openDshHome: () => shell.openPath(resolveDshHome()).catch(() => undefined),
        openLog: () => shell.openPath(logFile()).catch(() => undefined),
        openExternal: (url) => shell.openExternal(url).catch(() => undefined)
      })
    );
    createSplash();
    await boot();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', (event) => {
    if (quitting) return;
    const active = service;
    if (active === null) return;
    event.preventDefault();
    quitting = true;
    service = null;
    void active.stop().finally(() => app.quit());
  });

  app.on('activate', () => {
    if (mainWindow === null) void boot();
  });
}
