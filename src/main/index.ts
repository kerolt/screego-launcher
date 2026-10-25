import { app, dialog } from 'electron';

import { IPC, type IpcChannel } from '../shared/ipc-channels';
import type { UpdateInfo } from '../shared/types';
import { runtimePaths, bundledPaths, ensureRuntimeDirs } from './services/paths';
import { Settings } from './services/settings';
import { CoreManager } from './services/core-manager';
import { ServerManager } from './services/server-manager';
import * as screegoConfig from './services/screego-config';
import { registerIpc, getState, type IpcContext } from './ipc';
import { createWindow, showWindow, markQuitting, getWindow } from './window';

let updateInfo: UpdateInfo | null = null;
let serverManager: ServerManager | null = null;

function send(channel: IpcChannel, payload: unknown): void {
  const win = getWindow();
  if (win) win.webContents.send(channel, payload);
}

/** Silent update check on boot; notifies the renderer when a newer kernel exists. */
async function autoCheckForUpdates(ctx: IpcContext): Promise<void> {
  if (!ctx.settings.get('autoUpdateCore')) return;
  try {
    const info = await ctx.coreManager.checkLatest();
    info.checkedAt = Date.now();
    ctx.setUpdateInfo(info);
    if (info.updateAvailable && info.latest !== ctx.settings.get('lastSeenLatestVersion')) {
      ctx.settings.set('lastSeenLatestVersion', info.latest);
      send(IPC.CoreUpdateAvailable, info);
    }
    send(IPC.StateChanged, getState(ctx));
  } catch (err) {
    send(IPC.CoreProgress, {
      phase: 'error',
      percent: null,
      message: `检查更新失败：${(err as Error).message}`,
    });
  }
}

async function bootstrap(): Promise<void> {
  const runtime = runtimePaths();
  ensureRuntimeDirs(runtime);
  const settings = new Settings(runtime.settingsFile);

  const interfaces = screegoConfig.listInterfaces();
  let nic = interfaces.find((i) => i.id === settings.get('nicId')) ?? null;
  if (!nic) {
    nic = interfaces[0] ?? null;
    if (nic) settings.set('nicId', nic.id);
  }
  screegoConfig.ensureConfigFile(runtime.configFile, nic?.address ?? '');

  const coreManager = new CoreManager(runtime, bundledPaths(), send);
  serverManager = new ServerManager(runtime, (channel: string, payload: unknown) => {
    send(channel as IpcChannel, payload);
    if (channel === IPC.ServerState) send(IPC.StateChanged, getState(ctx));
  });

  const ctx: IpcContext = {
    runtime,
    settings,
    coreManager,
    serverManager,
    getUpdateInfo: () => updateInfo,
    setUpdateInfo: (info) => {
      updateInfo = info;
    },
  };

  // First run: copy the bundled kernel out of the (possibly read-only) app
  // bundle so it can be de-quarantined and later replaced by updates.
  const provision = await coreManager.provisionBundledCore();
  if (!provision.provisioned && !(await coreManager.resolveActive())) {
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      buttons: ['下载内核', '退出'],
      defaultId: 0,
      title: '缺少内核',
      message: '应用内没有自带 screego 内核',
      detail: '打包时未包含 screego 内核（可运行 npm run pack:core 生成）。是否现在从 GitHub 下载最新内核？',
    });
    if (choice !== 0) {
      app.quit();
      return;
    }
    try {
      const latest = (await coreManager.checkLatest()).latest;
      const installed = await coreManager.downloadAndInstall(latest);
      coreManager.writeCurrent({ ...installed, source: 'downloaded' });
    } catch (err) {
      dialog.showErrorBox('内核下载失败', (err as Error).message);
      app.quit();
      return;
    }
  }

  registerIpc(ctx);
  await createWindow();

  setTimeout(() => void autoCheckForUpdates(ctx), 1500);
}

// ---- app lifecycle ----

/** Set once the graceful dispose-quit sequence has begun (before-quit). */
let disposeStarted = false;

/**
 * Single instance: a second launch just focuses the existing window.
 * The one-shot retry covers electron-vite's watch-restart, which spawns the
 * new process the moment it SIGTERMs the old one — the dying instance may
 * still hold the SingletonLock for a few hundred ms. A real double launch
 * simply exits 800ms later than it otherwise would.
 */
async function acquireSingleInstanceLock(): Promise<boolean> {
  if (app.requestSingleInstanceLock()) return true;
  await new Promise((r) => setTimeout(r, 800));
  return app.requestSingleInstanceLock();
}

if (!(await acquireSingleInstanceLock())) {
  app.quit();
} else {
  app.on('second-instance', () => void showWindow());
  void app.whenReady().then(bootstrap);
}

// Dock click restores the window (recreates it if it was ever destroyed).
app.on('activate', () => {
  if (app.isReady()) void showWindow();
});

// Closing all windows never quits: the launcher stays resident in the Dock
// and keeps the screego server alive. Real quit only flows through before-quit.
// Exception: while a dispose-quit is already in progress, re-issue the quit —
// on macOS the quit sequence can otherwise stall right here when the last
// window closes (observed with Electron 33: will-quit never fires).
app.on('window-all-closed', () => {
  if (disposeStarted) app.quit();
});

// Tooling kills (electron-vite watch-restart SIGTERMs the app on rebuild) race
// Chromium's own native signal handling on macOS and are not guaranteed to
// reach Node handlers; when they do, synchronously kill the screego child and
// exit immediately — never route through app.quit() here (async disposal
// inside a signal handler can deadlock against the native shutdown sequence).
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    try {
      serverManager?.killChildSync();
    } catch {
      // best effort — exiting anyway
    }
    process.exit(0);
  });
}

// Full quit (Cmd+Q / Quit menu): stop the screego child process BEFORE the
// app exits, waiting for disposal with a hard timeout fallback so we never
// strand a screego process holding the ports.
app.on('before-quit', (event) => {
  if (disposeStarted) return; // second pass: let the quit proceed
  event.preventDefault();
  disposeStarted = true;
  markQuitting(); // window 'close' handlers now let windows close

  const manager = serverManager;
  if (!manager) {
    app.quit();
    return;
  }
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 5000));
  void Promise.race([manager.dispose(), timeout])
    .catch(() => {})
    .finally(() => app.quit());
});
