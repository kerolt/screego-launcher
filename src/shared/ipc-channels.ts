/**
 * All IPC channel names in one place, referenced by both the main process
 * (ipcMain.handle / webContents.send) and the preload bridge. Never inline
 * channel strings elsewhere — extend this enum-like object instead.
 */
export const IPC = {
  // ---- invoke channels (renderer -> main, request/response) ----
  AppGetState: 'app:get-state',
  AppRefreshInterfaces: 'app:refresh-interfaces',
  NicSelect: 'nic:select',
  ConfigGetContent: 'config:get-content',
  ConfigWrite: 'config:write',
  ConfigOpenExternal: 'config:open-external',
  ConfigReveal: 'config:reveal',
  ServerStart: 'server:start',
  ServerStop: 'server:stop',
  ServerLogs: 'server:logs',
  CoreStatus: 'core:status',
  CoreCheck: 'core:check',
  CoreUpdate: 'core:update',
  CoreSetActive: 'core:set-active',
  CoreRollbackBundled: 'core:rollback-bundled',
  SettingsSetAutoUpdate: 'settings:set-auto-update',
  LinkOpen: 'link:open',

  // ---- event channels (main -> renderer, fire and forget) ----
  ServerLog: 'server:log',
  ServerState: 'server:state',
  CoreProgress: 'core:progress',
  CoreUpdateAvailable: 'core:update-available',
  StateChanged: 'state:changed',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
