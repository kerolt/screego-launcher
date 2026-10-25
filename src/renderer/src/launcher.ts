import type { LauncherApi } from '../../shared/types';

/** Typed access to the preload whitelist bridge. */
export const launcher: LauncherApi = window.launcher;

/** Strips Electron's IPC error wrapper so toasts show the real message. */
export function ipcErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}
