'use strict';
/**
 * Application menu for the desktop client.
 *
 * The menu only exposes desktop-level actions (window, workspace, runtime
 * housekeeping). Every Harness feature stays where it belongs: in the Harness
 * GUI itself.
 */

const { app, clipboard, dialog, Menu } = require('electron');
const { store } = require('./settings');
const { workspacePrefs } = require('./workspace-prefs');

function buildMenu(actions) {
  const isMac = process.platform === 'darwin';

  const workspaceItems = () => {
    const current = workspacePrefs.currentWorkspace(store);
    const recent = Array.isArray(store.get('recentWorkspaces')) ? store.get('recentWorkspaces') : [];
    const entries = [
      {
        label: current === null ? 'Choose workspace…' : `Choose workspace…  (now: ${current})`,
        click: () => void actions.changeWorkspace()
      }
    ];
    const others = recent.filter((entry) => entry !== current && workspacePrefs.isDirectory(entry));
    if (others.length > 0) {
      entries.push({ type: 'separator' });
      for (const entry of others) {
        entries.push({ label: entry, click: () => actions.useWorkspace(entry) });
      }
    }
    entries.push({ type: 'separator' });
    entries.push({ label: 'Open Harness data folder', click: () => actions.openDshHome() });
    return entries;
  };

  return Menu.buildFromTemplate([
    {
      label: '&File',
      submenu: [
        {
          label: 'Copy GUI link',
          click: () => {
            const url = actions.getAuthUrl() ?? actions.getLastUrl();
            if (url !== null) clipboard.writeText(url);
          }
        },
        { type: 'separator' },
        ...workspaceItems(),
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit', label: 'Exit' }
      ]
    },
    {
      label: '&Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: '&View',
      submenu: [
        { label: 'Reload interface', accelerator: 'F5', click: () => actions.reload() },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        {
          label: 'Appearance',
          submenu: [
            { label: 'Match Windows', type: 'radio', checked: store.get('theme') === 'system', click: () => actions.setTheme('system') },
            { label: 'Light', type: 'radio', checked: store.get('theme') === 'light', click: () => actions.setTheme('light') },
            { label: 'Dark', type: 'radio', checked: store.get('theme') === 'dark', click: () => actions.setTheme('dark') }
          ]
        }
      ]
    },
    {
      label: '&Service',
      submenu: [
        { label: 'Restart Harness service', click: () => void actions.restartService() },
        { type: 'separator' },
        { label: 'Open log file', click: () => actions.openLog() }
      ]
    },
    {
      label: '&Help',
      submenu: [
        { label: 'DeepSeek Harness documentation', click: () => actions.openExternal('https://github.com/deepseek-ai/deepseek-harness') },
        { type: 'separator' },
        {
          label: 'About DeepSeek Harness',
          click: () =>
            void dialog.showMessageBox({
              type: 'info',
              title: 'About DeepSeek Harness',
              message: `DeepSeek Harness desktop client ${app.getVersion()}`,
              detail: [
                `Electron ${process.versions.electron}`,
                `Chromium ${process.versions.chrome}`,
                '',
                'The Harness core runs unmodified as a local service; this window is its desktop shell.'
              ].join('\n'),
              buttons: ['OK']
            })
        }
      ]
    }
  ]);
}

module.exports = { buildMenu };
