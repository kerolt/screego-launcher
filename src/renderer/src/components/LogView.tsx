import { useEffect, useRef, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { useServerLog } from '../hooks/useServerLog';
import { Section } from './Section';

/**
 * Live screego log (collapsible). Auto-expands once the server starts
 * running; the user can still collapse it manually afterwards.
 */
export function LogView({ running }: { running: boolean }) {
  const { log, clear } = useServerLog();
  const ref = useRef<HTMLPreElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (running) setOpen(true);
  }, [running]);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  return (
    <Section
      icon={<ScrollText size={14} />}
      title="运行日志"
      open={open}
      onToggle={setOpen}
    >
      <div className="log-head">
        <h2>screego stdout / stderr</h2>
        <button className="btn small ghost" onClick={clear}>
          清空
        </button>
      </div>
      <pre className="log" ref={ref}>
        {log}
      </pre>
    </Section>
  );
}
