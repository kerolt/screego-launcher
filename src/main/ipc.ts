import { ipcMain, shell } from 'electron';

import { IPC } from '../shared/ipc-channels';
import type {
  AppState,
  ConfigContent,
  SetActiveCoreResult,
  StartResult,
  UpdateInfo,
} from '../shared/types';
import type { RuntimePaths } from './services/paths';
import type { Settings } from './services/settings';
import type { CoreManager } from './services/core-manager';
import type { ServerManager } from './services/server-manager';
import * as screegoConfig from './services/screego-config';

export interface IpcContext {
  runtime: RuntimePaths;
  settings: Settings;
  coreManager: CoreManager;
  serverManager: ServerManager;
  getUpdateInfo(): UpdateInfo | null;
  setUpdateInfo(info: UpdateInfo | null): void;
}

export function getState(ctx: IpcContext): AppState {
  const interfaces = screegoConfig.listInterfaces();
  const selectedNicId = ctx.settings.get('nicId');
  const selectedNic = interfaces.find((i) => i.id === selectedNicId) ?? null;
  const conf = screegoConfig.parseConfig(ctx.runtime.configFile);
  return {
    interfaces,
    selectedNicId,
    selectedIp: selectedNic?.address ?? null,
    configPath: ctx.runtime.configFile,
    configPreview: {
      externalIp: conf['SCREEGO_EXTERNAL_IP'] ?? null,
      serverAddress: conf['SCREEGO_SERVER_ADDRESS'] ?? null,
      tls: conf['SCREEGO_SERVER_TLS'] === 'true',
      authMode: conf['SCREEGO_AUTH_MODE'] ?? null,
    },
    server: ctx.serverManager.state(),
    update: ctx.getUpdateInfo(),
    autoUpdateCore: ctx.settings.get('autoUpdateCore'),
  };
}

/** Starts screego on the currently active kernel + selected NIC. */
async function startWithActiveCore(ctx: IpcContext): Promise<StartResult | null> {
  const state = getState(ctx);
  if (!state.selectedIp) throw new Error('请先选择一张网卡');
  const active = await ctx.coreManager.resolveActive();
  if (!active) throw new Error('没有可用的 screego 内核');
  return ctx.serverManager.start({
    binary: active.binary,
    externalIp: state.selectedIp,
    configFile: ctx.runtime.configFile,
  });
}

/** Central registration of every ipcMain.handle — channel names come from shared/ipc-channels. */
export function registerIpc(ctx: IpcContext): void {
  ipcMain.handle(IPC.AppGetState, () => getState(ctx));
  ipcMain.handle(IPC.AppRefreshInterfaces, () => getState(ctx));

  ipcMain.handle(IPC.NicSelect, (_e, nicId: unknown) => {
    if (typeof nicId !== 'string') throw new Error('invalid interface id');
    const nic = screegoConfig.listInterfaces().find((i) => i.id === nicId);
    if (!nic) throw new Error(`unknown interface: ${nicId}`);
    ctx.settings.set('nicId', nicId);
    if (!ctx.serverManager.isRunning()) {
      screegoConfig.setExternalIp(ctx.runtime.configFile, nic.address);
    }
    return getState(ctx);
  });

  // Redacted read: the renderer never receives the real SCREEGO_SECRET.
  ipcMain.handle(IPC.ConfigGetContent, (): ConfigContent => {
    return {
      path: ctx.runtime.configFile,
      content: screegoConfig.readConfigRedacted(ctx.runtime.configFile),
    };
  });

  ipcMain.handle(IPC.ConfigWrite, (_e, content: unknown) => {
    if (typeof content !== 'string') throw new Error('invalid config content');
    screegoConfig.writeConfig(ctx.runtime.configFile, content); // validates first
    return getState(ctx);
  });

  ipcMain.handle(IPC.ConfigOpenExternal, async () => {
    const err = await shell.openPath(ctx.runtime.configFile);
    if (err) throw new Error(err);
    return true;
  });

  ipcMain.handle(IPC.ConfigReveal, () => {
    shell.showItemInFolder(ctx.runtime.configFile);
    return true;
  });

  ipcMain.handle(IPC.ServerStart, async () => {
    const result = await startWithActiveCore(ctx);
    if (!result) throw new Error('启动失败');
    return result;
  });

  ipcMain.handle(IPC.ServerStop, async () => {
    await ctx.serverManager.stop();
    return ctx.serverManager.state();
  });

  ipcMain.handle(IPC.ServerLogs, () => ctx.serverManager.logs());

  ipcMain.handle(IPC.CoreStatus, () => ctx.coreManager.status());

  ipcMain.handle(IPC.CoreCheck, async () => {
    const info = await ctx.coreManager.checkLatest();
    info.checkedAt = Date.now();
    ctx.setUpdateInfo(info);
    return info;
  });

  ipcMain.handle(IPC.CoreUpdate, async () => {
    // Re-resolve the kernel right before (re)starting so a running server
    // comes back up on the NEW kernel, not the old one.
    const restart = async (): Promise<unknown> => startWithActiveCore(ctx);
    const result = await ctx.coreManager.updateToLatest({
      isRunning: () => ctx.serverManager.isRunning(),
      stop: (opts) => ctx.serverManager.stop(opts),
      start: restart,
    });
    ctx.setUpdateInfo(null);
    return result;
  });

  ipcMain.handle(IPC.CoreSetActive, async (_e, dir: unknown) => {
    if (typeof dir !== 'string' || !dir || dir.includes('/') || dir.includes('..')) {
      throw new Error('invalid core directory');
    }
    const status = await ctx.coreManager.setActive(dir); // validates installation
    let restarted = false;
    if (ctx.serverManager.isRunning()) {
      await ctx.serverManager.stop({ silent: true });
      // give the OS a moment to release the HTTP/TURN ports
      await new Promise((r) => setTimeout(r, 600));
      await startWithActiveCore(ctx);
      restarted = true;
    }
    const result: SetActiveCoreResult = { status, restarted };
    return result;
  });

  ipcMain.handle(IPC.CoreRollbackBundled, async () => {
    await ctx.coreManager.rollbackToBundled();
    return ctx.coreManager.status();
  });

  ipcMain.handle(IPC.SettingsSetAutoUpdate, (_e, value: unknown) => {
    ctx.settings.set('autoUpdateCore', Boolean(value));
    return getState(ctx);
  });

  ipcMain.handle(IPC.LinkOpen, (_e, url: unknown) => {
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) throw new Error('invalid url');
    return shell.openExternal(url);
  });
}
