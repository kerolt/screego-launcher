import { useCallback, useEffect, useRef, useState } from 'react';
import type { CoreProgress, CoreStatus, UpdateInfo } from '../../../shared/types';
import { launcher, ipcErrorMessage } from '../launcher';

export interface CoreManagerHook {
  status: CoreStatus | null;
  progress: CoreProgress | null;
  busy: boolean;
  refresh(): Promise<void>;
  check(): Promise<void>;
  update(): Promise<void>;
  rollback(): Promise<void>;
  setActive(dir: string): Promise<void>;
}

/**
 * Kernel state + actions, lifted to App so both the update banner and the
 * kernel panel share them. Progress bar rides on core:progress events.
 */
export function useCoreManager(opts: {
  push: (message: string) => void;
  setUpdateInfo: (info: UpdateInfo | null) => void;
}): CoreManagerHook {
  const { push, setUpdateInfo } = opts;
  const [status, setStatus] = useState<CoreStatus | null>(null);
  const [progress, setProgress] = useState<CoreProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const progressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      setStatus(await launcher.coreStatus());
    } catch (err) {
      push(ipcErrorMessage(err));
    }
  }, [push]);

  useEffect(() => {
    void refresh();
    return () => clearTimeout(progressTimer.current);
  }, [refresh]);

  useEffect(
    () =>
      launcher.onCoreProgress((p) => {
        if (p.phase === 'error') {
          setProgress(null);
          if (p.message) push(p.message);
          return;
        }
        clearTimeout(progressTimer.current);
        setProgress(p);
        if (p.phase === 'done') {
          void refresh();
          progressTimer.current = setTimeout(() => setProgress(null), 900);
        }
      }),
    [push, refresh],
  );

  const run = useCallback(
    async (action: () => Promise<void>) => {
      setBusy(true);
      try {
        await action();
      } catch (err) {
        push(ipcErrorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [push],
  );

  const check = useCallback(
    () =>
      run(async () => {
        const info = await launcher.coreCheck();
        setUpdateInfo(info);
        push(info.updateAvailable ? `发现新内核 ${info.latest}` : `已是最新版本（${info.latest}）`);
      }),
    [run, setUpdateInfo, push],
  );

  const update = useCallback(
    () =>
      run(async () => {
        const result = await launcher.coreUpdate();
        await refresh();
        if (result.updated) {
          setUpdateInfo(null);
          push(`内核已更新到 ${result.version}`);
        } else {
          push('已经是最新版本');
        }
      }),
    [run, refresh, setUpdateInfo, push],
  );

  const rollback = useCallback(
    () =>
      run(async () => {
        setStatus(await launcher.coreRollbackBundled());
        push('已回滚到自带内核');
      }),
    [run, push],
  );

  const setActive = useCallback(
    (dir: string) =>
      run(async () => {
        const result = await launcher.setActiveCore(dir);
        setStatus(result.status);
        push(result.restarted ? '已切换内核并重启服务' : '已切换激活内核');
      }),
    [run, push],
  );

  return { status, progress, busy, refresh, check, update, rollback, setActive };
}
