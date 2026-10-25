import { Cpu } from 'lucide-react';
import type { AppState, CoreProgress, CoreStatus, UpdateInfo } from '../../../shared/types';
import type { CoreManagerHook } from '../hooks/useCoreManager';
import { Section } from './Section';

interface Props {
  state: AppState;
  status: CoreStatus | null;
  progress: CoreProgress | null;
  updateInfo: UpdateInfo | null;
  core: CoreManagerHook;
  onToggleAutoUpdate(value: boolean): void;
}

/**
 * Kernel management (collapsible): active kernel, bundled version, installed
 * versions with one-click switching, update check / one-click update /
 * rollback to bundled, download progress bar.
 */
export function CoreManagerPanel({ state, status, progress, updateInfo, core, onToggleAutoUpdate }: Props) {
  const activeDir = status?.active?.dir ?? null;

  function onPickInstalled(dir: string) {
    if (dir === activeDir || core.busy) return;
    if (
      state.server.running &&
      !window.confirm('服务正在运行，切换内核将自动重启服务，是否继续？')
    ) {
      return;
    }
    void core.setActive(dir);
  }

  return (
    <Section
      icon={<Cpu size={14} />}
      title="内核管理"
      meta={status?.active?.version ?? undefined}
    >
      <div className="kernel-row">
        <span>当前内核</span>
        <code>
          {status?.active
            ? `${status.active.version ?? '未知'}（${status.active.source === 'bundled' ? '自带' : '已下载'}）`
            : '不可用'}
        </code>
      </div>
      <div className="kernel-row">
        <span>自带内核</span>
        <code>{status?.bundled?.version ?? '无'}</code>
      </div>
      <div className="kernel-row">
        <span>最新版本</span>
        <code>
          {updateInfo
            ? `${updateInfo.latest}${updateInfo.updateAvailable ? '（有新版本）' : '（已是最新）'}`
            : '未检查'}
        </code>
      </div>

      {status && status.installed.length > 0 && (
        <div className="core-list">
          {status.installed.map((c) => (
            <button
              key={c.dir}
              className={`core-item${c.dir === activeDir ? ' active' : ''}`}
              onClick={() => onPickInstalled(c.dir)}
              disabled={core.busy}
              title={c.dir === activeDir ? '当前激活内核' : '点击切换到此内核'}
            >
              <span className="nic-radio" />
              <span className="core-version">{c.version ?? '未知版本'}</span>
              <span className="core-dir">{c.dir}</span>
              {c.dir === activeDir && <span className="core-badge">当前</span>}
            </button>
          ))}
        </div>
      )}

      {progress && (
        <div className="progress">
          <div
            className="bar"
            style={{ width: progress.percent === null ? '60%' : `${progress.percent}%` }}
          />
        </div>
      )}

      <div className="kernel-actions">
        <button className="btn small" onClick={() => void core.check()} disabled={core.busy}>
          检查更新
        </button>
        {updateInfo?.updateAvailable && (
          <button className="btn small primary" onClick={() => void core.update()} disabled={core.busy}>
            更新内核
          </button>
        )}
        <button className="btn small ghost" onClick={() => void core.rollback()} disabled={core.busy}>
          回滚到自带内核
        </button>
      </div>
      <label className="switch-row">
        <input
          type="checkbox"
          checked={state.autoUpdateCore}
          onChange={(e) => onToggleAutoUpdate(e.target.checked)}
        />
        <span>启动时自动检查内核更新</span>
      </label>
    </Section>
  );
}
