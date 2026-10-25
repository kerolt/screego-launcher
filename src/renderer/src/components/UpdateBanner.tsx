import { ArrowUpCircle } from 'lucide-react';
import type { UpdateInfo } from '../../../shared/types';

interface Props {
  info: UpdateInfo;
  busy: boolean;
  onUpdate(): void;
  onDismiss(): void;
}

export function UpdateBanner({ info, busy, onUpdate, onDismiss }: Props) {
  return (
    <div className="card update-banner">
      <span className="sec-icon" style={{ color: 'var(--foreground)' }}>
        <ArrowUpCircle size={16} />
      </span>
      <span className="msg">
        发现新内核 <code>{info.latest}</code>（当前 {info.current ?? '无'}）
      </span>
      <button className="btn small primary" onClick={onUpdate} disabled={busy}>
        立即更新
      </button>
      <button className="btn small ghost" onClick={onDismiss}>
        稍后
      </button>
    </div>
  );
}
