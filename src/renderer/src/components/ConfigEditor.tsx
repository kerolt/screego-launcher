import { useState } from 'react';
import { FolderOpen, Pencil } from 'lucide-react';
import type { AppState } from '../../../shared/types';
import { launcher, ipcErrorMessage } from '../launcher';
import { Section } from './Section';

interface Props {
  state: AppState;
  applyState(s: AppState): void;
  push(message: string): void;
}

/**
 * In-app editor for screego.config (collapsible): read-only preview by
 * default, an edit mode with validation on the main side, plus the
 * external-editor / Finder escape hatches. The SECRET line arrives redacted
 * (SECRET_PLACEHOLDER) and is restored on save as long as the user leaves
 * the placeholder untouched.
 */
export function ConfigEditor({ state, applyState, push }: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const chips: Array<[string, string | null]> = [
    ['EXTERNAL_IP', state.configPreview.externalIp],
    ['HTTP', state.configPreview.serverAddress],
    ['TLS', state.configPreview.tls ? 'on' : 'off'],
    ['AUTH', state.configPreview.authMode],
  ];

  async function startEdit() {
    setBusy(true);
    try {
      const { content } = await launcher.getConfigContent();
      setText(content);
      setEditing(true);
    } catch (err) {
      push(ipcErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const next = await launcher.saveConfig(text);
      applyState(next);
      setEditing(false);
      push(next.server.running ? '配置已保存，重启服务后生效' : '配置已保存');
    } catch (err) {
      push(ipcErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function openExternal() {
    try {
      await launcher.openConfigExternal();
    } catch (err) {
      push(ipcErrorMessage(err));
    }
  }

  async function reveal() {
    try {
      await launcher.revealConfig();
    } catch (err) {
      push(ipcErrorMessage(err));
    }
  }

  return (
    <Section icon={<Pencil size={14} />} title="配置文件" meta="screego.config">
      <div className="path-row">
        <code className="path" title={state.configPath}>
          {state.configPath}
        </code>
        <button className="icon-btn" title="在 Finder 中显示" onClick={() => void reveal()}>
          <FolderOpen size={14} />
        </button>
      </div>

      {!editing ? (
        <>
          <div className="chips">
            {chips
              .filter(([, v]) => v !== null)
              .map(([k, v]) => (
                <span className="chip" key={k}>
                  {k} <strong>{String(v)}</strong>
                </span>
              ))}
          </div>
          <div className="config-actions">
            <button className="btn" onClick={() => void startEdit()} disabled={busy}>
              编辑配置
            </button>
            <button className="btn ghost" onClick={() => void openExternal()}>
              用系统编辑器打开
            </button>
          </div>
          <p className="hint">
            仅允许 SCREEGO_* 键，注释原样保留；SECRET 显示为 __UNCHANGED__ 时保存不会改动真值。
            {state.server.running && '服务运行中，保存后需重启生效。'}
          </p>
        </>
      ) : (
        <>
          <textarea
            className="config-editor"
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            autoFocus
          />
          <div className="config-actions">
            <button className="btn primary" onClick={() => void save()} disabled={busy}>
              保存
            </button>
            <button className="btn ghost" onClick={() => setEditing(false)} disabled={busy}>
              取消
            </button>
          </div>
        </>
      )}
    </Section>
  );
}
