/** Shared types between the main process and the renderer (via preload). */

export interface NicInfo {
  /** os.networkInterfaces() key, e.g. "en0" */
  id: string;
  name: string;
  address: string;
  netmask: string;
  mac: string;
  recommended: boolean;
}

export interface ConfigPreview {
  externalIp: string | null;
  serverAddress: string | null;
  tls: boolean;
  authMode: string | null;
}

export interface ServerState {
  running: boolean;
  /** LAN access URL while running (rebuilt after renderer reloads) */
  url: string | null;
  lastExit: {
    code: number | null;
    signal: string | null;
    intentional: boolean;
    at: number;
  } | null;
}

export interface ActiveCore {
  binary: string;
  version: string | null;
  source: 'bundled' | 'downloaded';
  /** directory name inside the cores dir, when the binary lives there */
  dir: string | null;
}

export interface CoreStatus {
  active: ActiveCore | null;
  installed: Array<{ dir: string; version: string | null }>;
  bundled: { version: string } | null;
  minSupported: string;
}

export interface SetActiveCoreResult {
  status: CoreStatus;
  /** true when a running server was restarted onto the new kernel */
  restarted: boolean;
}

export interface UpdateInfo {
  latest: string;
  publishedAt: string;
  assetName: string;
  size: number;
  current: string | null;
  updateAvailable: boolean;
  checkedAt?: number;
}

export interface CoreProgress {
  phase: 'download' | 'extract' | 'done' | 'error';
  percent: number | null;
  version?: string;
  message?: string;
}

export interface AppState {
  interfaces: NicInfo[];
  selectedNicId: string | null;
  selectedIp: string | null;
  configPath: string;
  configPreview: ConfigPreview;
  server: ServerState;
  update: UpdateInfo | null;
  autoUpdateCore: boolean;
}

export interface StartResult {
  url: string;
  port: number;
  scheme: 'http' | 'https';
}

/**
 * Config file content as served to the renderer: the SCREEGO_SECRET value is
 * replaced with SECRET_PLACEHOLDER so the real secret never leaves the main
 * process. Saving the file with the placeholder untouched keeps the secret.
 */
export const SECRET_PLACEHOLDER = '__UNCHANGED__';

export interface ConfigContent {
  path: string;
  content: string;
}

/** API surface exposed on window.launcher by the preload script. */
export interface LauncherApi {
  getState(): Promise<AppState>;
  refreshInterfaces(): Promise<AppState>;
  selectNic(nicId: string): Promise<AppState>;
  getConfigContent(): Promise<ConfigContent>;
  saveConfig(content: string): Promise<AppState>;
  openConfigExternal(): Promise<boolean>;
  revealConfig(): Promise<boolean>;
  startServer(): Promise<StartResult>;
  stopServer(): Promise<ServerState>;
  getLogs(): Promise<string>;
  coreStatus(): Promise<CoreStatus>;
  coreCheck(): Promise<UpdateInfo>;
  coreUpdate(): Promise<{ updated: boolean; version: string | null }>;
  setActiveCore(dir: string): Promise<SetActiveCoreResult>;
  coreRollbackBundled(): Promise<CoreStatus>;
  setAutoUpdate(value: boolean): Promise<AppState>;
  openLink(url: string): Promise<void>;
  onServerLog(cb: (chunk: string) => void): () => void;
  onServerState(cb: (state: ServerState) => void): () => void;
  onCoreProgress(cb: (p: CoreProgress) => void): () => void;
  onUpdateAvailable(cb: (info: UpdateInfo) => void): () => void;
  onStateChanged(cb: (state: AppState) => void): () => void;
}
