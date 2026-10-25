import { useEffect, useState } from 'react';
import type { AppState } from '../../../shared/types';
import { launcher } from '../launcher';

/**
 * The single source of truth for AppState: initial fetch + state:changed
 * pushes from main + server:state patches (server events carry only
 * ServerState, so merge them into the cached AppState).
 */
export function useAppState(): {
  state: AppState | null;
  setState: (s: AppState) => void;
} {
  const [state, setState] = useState<AppState | null>(null);

  useEffect(() => {
    let alive = true;
    launcher
      .getState()
      .then((s) => {
        if (alive) setState(s);
      })
      .catch(() => {});
    const offState = launcher.onStateChanged((s) => setState(s));
    const offServer = launcher.onServerState((server) =>
      setState((prev) => (prev ? { ...prev, server } : prev)),
    );
    return () => {
      alive = false;
      offState();
      offServer();
    };
  }, []);

  return { state, setState };
}
