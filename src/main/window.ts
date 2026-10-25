import path from 'node:path';
import { BrowserWindow } from 'electron';

let win: BrowserWindow | null = null;
let isQuitting = false;

/**
 * Marks the app as really quitting: window 'close' handlers stop intercepting
 * and let the window close for good. Set from the before-quit path only.
 */
export function markQuitting(): void {
  isQuitting = true;
}

export function getWindow(): BrowserWindow | null {
  return win && !win.isDestroyed() ? win : null;
}

export async function createWindow(): Promise<BrowserWindow> {
  const w = new BrowserWindow({
    width: 720,
    height: 860,
    minWidth: 640,
    minHeight: 560,
    title: 'Screego Launcher',
    backgroundColor: '#ffffff',
    // Frameless-ish: the page background runs to the top and the (still
    // native) traffic lights sit inside the header band, which is the drag
    // region via -webkit-app-region in the renderer.
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 20 },
    webPreferences: {
      // sandboxed preloads must be CommonJS -> electron-vite emits index.cjs
      preload: path.join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win = w;

  // Closing the window must not quit the app: hide it and keep the screego
  // server running in the background (Dock resident). Only the explicit quit
  // path (Cmd+Q / Quit menu, flagged via markQuitting) lets the window die.
  w.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    w.hide();
  });
  w.on('closed', () => {
    if (win === w) win = null;
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    await w.loadURL(devUrl); // electron-vite dev server (HMR)
  } else {
    await w.loadFile(path.join(import.meta.dirname, '../renderer/index.html'));
  }
  return w;
}

/** Shows (or recreates) the main window — used by Dock 'activate' and single-instance focus. */
export async function showWindow(): Promise<void> {
  const existing = getWindow();
  if (!existing) {
    await createWindow();
    return;
  }
  if (existing.isMinimized()) existing.restore();
  existing.show();
  existing.focus();
}
