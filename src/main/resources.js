'use strict';
/**
 * Locates static files (icon, splash, notices) in both dev and packaged runs.
 */

const path = require('node:path');

const packaged = typeof process.resourcesPath === 'string' && __dirname.includes('app.asar');

/** Absolute path to the application icon (.ico on Windows). */
function iconPath() {
  return packaged
    ? path.join(process.resourcesPath, 'dsh-desktop', 'icon.ico')
    : path.join(__dirname, '..', '..', 'build', 'icon.ico');
}

module.exports = { iconPath, packaged };
