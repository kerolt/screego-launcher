import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type IpcChannel } from '../shared/ipc-channels';
import type {
  AppState,
  CoreProgress,
  LauncherApi,
  ServerState,
  UpdateInfo,
} from '../shared/types';

function invoke<T>(channel: IpcChannel, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

function on<T>(channel: IpcChannel) {
  return (callback: (payload: T) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, payload: T) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  };
}

// Whitelist bridge: only these methods reach the renderer, ipcRenderer itself
// is never exposed. Channel names are centralized in shared/ipc-channels.
const api: LauncherApi = {
  getState: () => invoke(IPC.AppGetState),
  refreshInterfaces: () => invoke(IPC.AppRefreshInterfaces),
  selectNic: (nicId) => invoke(IPC.NicSelect, nicId),
  getConfigContent: () => invoke(IPC.ConfigGetContent),
  saveConfig: (content) => invoke(IPC.ConfigWrite, content),
  openConfigExternal: () => invoke(IPC.ConfigOpenExternal),
  revealConfig: () => invoke(IPC.ConfigReveal),
  startServer: () => invoke(IPC.ServerStart),
  stopServer: () => invoke(IPC.ServerStop),
  getLogs: () => invoke(IPC.ServerLogs),
  coreStatus: () => invoke(IPC.CoreStatus),
  coreCheck: () => invoke(IPC.CoreCheck),
  coreUpdate: () => invoke(IPC.CoreUpdate),
  setActiveCore: (dir) => invoke(IPC.CoreSetActive, dir),
  coreRollbackBundled: () => invoke(IPC.CoreRollbackBundled),
  setAutoUpdate: (value) => invoke(IPC.SettingsSetAutoUpdate, value),
  openLink: (url) => invoke(IPC.LinkOpen, url),
  onServerLog: on<string>(IPC.ServerLog),
  onServerState: on<ServerState>(IPC.ServerState),
  onCoreProgress: on<CoreProgress>(IPC.CoreProgress),
  onUpdateAvailable: on<UpdateInfo>(IPC.CoreUpdateAvailable),
  onStateChanged: on<AppState>(IPC.StateChanged),
};

contextBridge.exposeInMainWorld('launcher', api);
