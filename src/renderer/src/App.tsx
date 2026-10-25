import { useCallback, useEffect, useRef, useState } from 'react';
import type { UpdateInfo } from '../../shared/types';
import { launcher, ipcErrorMessage } from './launcher';
import { useAppState } from './hooks/useAppState';
import { useCoreManager } from './hooks/useCoreManager';
import { useToasts } from './hooks/useToasts';
import { UpdateBanner } from './components/UpdateBanner';
import { ConfigEditor } from './components/ConfigEditor';
import { NicPicker } from './components/NicPicker';
import { ServerPanel } from './components/ServerPanel';
import { LogView } from './components/LogView';
import { CoreManagerPanel } from './components/CoreManagerPanel';
import { Toasts } from './components/Toasts';

export default function App() {
  const { state, setState } = useAppState();
  const { toasts, push } = useToasts();
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const core = useCoreManager({ push, setUpdateInfo });

  // Seed the banner from AppState (auto check at boot) and from the
  // core:update-available event; a manual check feeds setUpdateInfo too.
  useEffect(() => {
    if (state?.update?.updateAvailable) setUpdateInfo(state.update);
  }, [state?.update]);
  useEffect(
    () =>
      launcher.onUpdateAvailable((info) => {
        setUpdateInfo(info);
        setBannerDismissed(false);
      }),
    [],
  );

  // Toast on unexpected screego exit (deduped by exit timestamp).
  const seenExitAt = useRef(0);
  const lastExit = state?.server.lastExit;
  useEffect(() => {
    if (lastExit && !lastExit.intentional && lastExit.code !== 0 && lastExit.at > seenExitAt.current) {
      seenExitAt.current = lastExit.at;
      push(`screego 意外退出（code=${lastExit.code ?? 'null'}），请查看日志`);
    }
  }, [lastExit, push]);

  const selectNic = useCallback(
    async (id: string) => {
      try {
        const next = await launcher.selectNic(id);
        setState(next);
        push(
          next.server.running
            ? '网卡已切换，重启服务后生效'
            : `External IP 已切换为 ${next.selectedIp ?? id}`,
        );
      } catch (err) {
        push(ipcErrorMessage(err));
      }
    },
    [setState, push],
  );

  const refreshInterfaces = useCallback(async () => {
    try {
      setState(await launcher.refreshInterfaces());
    } catch (err) {
      push(ipcErrorMessage(err));
    }
  }, [setState, push]);

  const toggleAutoUpdate = useCallback(
    async (value: boolean) => {
      try {
        setState(await launcher.setAutoUpdate(value));
      } catch (err) {
        push(ipcErrorMessage(err));
      }
    },
    [setState, push],
  );

  if (!state) {
    return <div className="loading">加载中…</div>;
  }

  return (
    <>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <div className="logo">S</div>
            <div>
              <h1>Screego Launcher</h1>
              <p className="tagline">局域网屏幕共享</p>
            </div>
          </div>
        </header>

        <main className="stack">
          {updateInfo?.updateAvailable && !bannerDismissed && (
            <UpdateBanner
              info={updateInfo}
              busy={core.busy}
              onUpdate={() => void core.update()}
              onDismiss={() => setBannerDismissed(true)}
            />
          )}

          <ServerPanel state={state} push={push} />
          <NicPicker
            interfaces={state.interfaces}
            selectedId={state.selectedNicId}
            onSelect={(id) => void selectNic(id)}
            onRefresh={() => void refreshInterfaces()}
          />
          <ConfigEditor state={state} applyState={setState} push={push} />
          <CoreManagerPanel
            state={state}
            status={core.status}
            progress={core.progress}
            updateInfo={updateInfo}
            core={core}
            onToggleAutoUpdate={(v) => void toggleAutoUpdate(v)}
          />
          <LogView running={state.server.running} />
        </main>
      </div>

      <Toasts toasts={toasts} />
    </>
  );
}
