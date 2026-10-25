import { useEffect, useState } from 'react';
import { launcher } from '../launcher';

const MAX_LOG_CHARS = 200 * 1024; // mirror the main-process ring buffer bound

/**
 * Live screego log: replays the buffered backlog on mount, then appends
 * server:log chunks. "Clear" only clears the visible text (same semantics
 * as the old DOM UI — the main-side ring buffer is untouched).
 */
export function useServerLog(): { log: string; clear: () => void } {
  const [log, setLog] = useState('');

  useEffect(() => {
    let alive = true;
    launcher
      .getLogs()
      .then((backlog) => {
        if (alive) setLog(backlog);
      })
      .catch(() => {});
    return launcher.onServerLog((chunk) => {
      setLog((prev) => {
        const next = prev + chunk;
        return next.length > MAX_LOG_CHARS ? next.slice(-MAX_LOG_CHARS) : next;
      });
    });
  }, []);

  return { log, clear: () => setLog('') };
}
