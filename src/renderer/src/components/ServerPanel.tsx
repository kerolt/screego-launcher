import { useState } from 'react';
import { Copy, ExternalLink, Loader2, Play, Square } from 'lucide-react';
import type { AppState } from '../../../shared/types';
import { launcher, ipcErrorMessage } from '../launcher';
import { StatusPill } from './StatusPill';

interface Props {
  state: AppState;
  push(message: string): void;
}

/** Primary card: start/stop control + LAN access link (copy / open in browser). */
export function ServerPanel({ state, push }: Props) {
  const [pending, setPending] = useState(false);
  const { running, url } = state.server;

  async function toggle() {
    setPending(true);
    try {
      if (running) {
        await launcher.stopServer();
      } else {
        const result = await launcher.startServer();
        push(`服务已启动：${result.url}`);
      }
    } catch (err) {
      push(ipcErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function copyLink(target: string) {
    try {
      await navigator.clipboard.writeText(target);
      push('链接已复制');
    } catch {
      push('复制失败，请手动选择复制');
    }
  }

  /**
   * Browsers only allow screen capture (getDisplayMedia) in secure contexts:
   * HTTPS or localhost. The machine that presents must therefore enter via
   * localhost over plain HTTP; viewers on the LAN don't need mediaDevices.
   */
  const port = state.configPreview.serverAddress?.split(':').pop() ?? '5050';
  const localUrl = `http://localhost:${port}`;

  return (
    <section className="card">
      <div className="card-head">
        <h2>服务器</h2>
        <span className="spacer" />
        <StatusPill running={running} />
      </div>
      <div className="card-content">
        <button
          className={`btn big ${running ? 'danger-outline' : 'primary'}`}
          onClick={() => void toggle()}
          disabled={pending}
        >
          {pending ? (
            <Loader2 size={15} className="spin" />
          ) : running ? (
            <Square size={14} strokeWidth={2.5} />
          ) : (
            <Play size={15} strokeWidth={2.5} style={{ marginLeft: -2 }} />
          )}
          {pending ? (running ? '停止中…' : '启动中…') : running ? '停止服务' : '启动 Screego'}
        </button>

        {running && url ? (
          <>
            <div className="link-box">
              <span className="link-label">本机发起共享（屏幕采集需要 localhost 或 HTTPS）</span>
              <div className="link-row">
                <code className="link">{localUrl}</code>
                <button className="icon-btn" title="复制链接" onClick={() => void copyLink(localUrl)}>
                  <Copy size={14} />
                </button>
                <button
                  className="icon-btn"
                  title="在浏览器中打开"
                  onClick={() => void launcher.openLink(localUrl)}
                >
                  <ExternalLink size={14} />
                </button>
              </div>
            </div>
            <div className="link-box">
              <span className="link-label">分享给局域网观看者</span>
              <div className="link-row">
                <code className="link">{url}</code>
                <button className="icon-btn" title="复制链接" onClick={() => void copyLink(url)}>
                  <Copy size={14} />
                </button>
                <button
                  className="icon-btn"
                  title="在浏览器中打开"
                  onClick={() => void launcher.openLink(url)}
                >
                  <ExternalLink size={14} />
                </button>
              </div>
            </div>
          </>
        ) : (
          !pending && <p className="hint">启动后生成局域网访问链接，局域网内设备可直接访问。</p>
        )}
      </div>
    </section>
  );
}
