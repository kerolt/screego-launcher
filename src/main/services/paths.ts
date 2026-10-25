import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';

export interface RuntimePaths {
  userData: string;
  /** userData/cores — downloaded kernels, one directory per version */
  coresDir: string;
  /** userData/cores/current.json — pointer to the active kernel */
  currentFile: string;
  tmpDir: string;
  configDir: string;
  /** userData/config/screego.config — the user-editable screego config */
  configFile: string;
  /** userData/config/launcher.json — launcher settings */
  settingsFile: string;
  logsDir: string;
}

export function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function runtimePaths(): RuntimePaths {
  const userData = app.getPath('userData');
  return {
    userData,
    coresDir: path.join(userData, 'cores'),
    currentFile: path.join(userData, 'cores', 'current.json'),
    tmpDir: path.join(userData, 'cores', '.tmp'),
    configDir: path.join(userData, 'config'),
    configFile: path.join(userData, 'config', 'screego.config'),
    settingsFile: path.join(userData, 'config', 'launcher.json'),
    logsDir: path.join(userData, 'logs'),
  };
}

export function ensureRuntimeDirs(p: RuntimePaths): void {
  ensureDir(p.coresDir);
  ensureDir(p.tmpDir);
  ensureDir(p.configDir);
  ensureDir(p.logsDir);
}

export interface BundledPaths {
  bundledCoresDir: string;
  manifestFile: string;
}

/**
 * The kernel shipped inside the app (assets/cores in dev, resources in prod).
 * Packaged builds read from process.resourcesPath/assets/cores, which must
 * match electron-builder's extraResources output path.
 */
export function bundledPaths(): BundledPaths {
  // dev: bundled main lives in dist/main/ -> project root is two levels up
  const root = app.isPackaged ? process.resourcesPath : path.resolve(import.meta.dirname, '../..');
  return {
    bundledCoresDir: path.join(root, 'assets', 'cores'),
    manifestFile: path.join(root, 'assets', 'cores', 'core-manifest.json'),
  };
}
