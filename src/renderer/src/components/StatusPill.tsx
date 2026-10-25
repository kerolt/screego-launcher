export function StatusPill({ running }: { running: boolean }) {
  return (
    <div className={`status-pill${running ? ' running' : ''}`}>
      <span className="dot" />
      <span>{running ? '运行中' : '未运行'}</span>
    </div>
  );
}
