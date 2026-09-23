'use strict';
/**
 * Workspace (working directory) preferences for the desktop client.
 *
 * The Harness treats its process working directory as the default workspace
 * root, so the desktop client asks once where work should happen, remembers the
 * answer, and boots the service there afterwards.
 */

const fs = require('node:fs');
const path = require('node:path');

function isDirectory(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/** The workspace the shell would use right now, or null when none is set. */
function currentWorkspace(store) {
  const saved = store.get('workspace');
  if (typeof saved === 'string' && saved !== '' && isDirectory(saved)) return saved;
  return null;
}

function defaultWorkspace() {
  const candidates = [
    path.join(process.env.USERPROFILE || '', 'Documents'),
    path.join(process.env.USERPROFILE || '', 'Desktop'),
    process.env.USERPROFILE || '',
    process.cwd()
  ];
  for (const candidate of candidates) {
    if (candidate !== '' && isDirectory(candidate)) return candidate;
  }
  return process.cwd();
}

/** Native folder picker, remembered as the most recent choice. */
async function pickWorkspace(dialog, startIn) {
  const result = await dialog.showOpenDialog({
    title: 'Choose the DeepSeek Harness workspace',
    message: 'The Harness opens this folder as its default workspace.',
    defaultPath: isDirectory(startIn) ? startIn : defaultWorkspace(),
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Use this folder'
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
}

/**
 * Resolve the workspace to boot in, asking the user the first time.
 * @returns {Promise<string|null>} null when the user dismissed the picker
 */
async function ensureWorkspace(dialog, store, headless) {
  const existing = currentWorkspace(store);
  if (existing !== null) return existing;

  // A dev run must never be blocked by a modal picker.
  if (headless) {
    const fallback = defaultWorkspace();
    store.set('workspace', fallback);
    return fallback;
  }

  const startIn = store.get('lastPickedWorkspace') || defaultWorkspace();
  const picked = await pickWorkspace(dialog, startIn);
  if (picked === null) return null;
  rememberWorkspace(store, picked);
  return picked;
}

function rememberWorkspace(store, workspace) {
  store.set('workspace', workspace);
  store.set('lastPickedWorkspace', workspace);
  const recent = Array.isArray(store.get('recentWorkspaces')) ? store.get('recentWorkspaces') : [];
  const next = [workspace, ...recent.filter((entry) => entry !== workspace)].slice(0, 6);
  store.set('recentWorkspaces', next);
}

const workspacePrefs = { currentWorkspace, defaultWorkspace, pickWorkspace, ensureWorkspace, rememberWorkspace, isDirectory };

module.exports = { workspacePrefs };
