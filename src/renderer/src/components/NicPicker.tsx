import { RefreshCw, Wifi } from 'lucide-react';
import type { NicInfo } from '../../../shared/types';

interface Props {
  interfaces: NicInfo[];
  selectedId: string | null;
  onSelect(id: string): void;
  onRefresh(): void;
}

/** NIC list card; picking one writes SCREEGO_EXTERNAL_IP. */
export function NicPicker({ interfaces, selectedId, onSelect, onRefresh }: Props) {
  return (
    <section className="card">
      <div className="card-head">
        <span className="sec-icon">
          <Wifi size={14} />
        </span>
        <h2>网络</h2>
        <span className="spacer" />
        <button className="icon-btn" title="刷新网卡列表" onClick={onRefresh}>
          <RefreshCw size={13} />
        </button>
      </div>
      <div className="card-content">
        <div className="nic-list">
          {interfaces.length === 0 && (
            <p className="hint" style={{ margin: 0 }}>
              未发现可用的 IPv4 网卡。
            </p>
          )}
          {interfaces.map((nic) => (
            <button
              key={nic.id}
              className={`nic${nic.id === selectedId ? ' selected' : ''}`}
              onClick={() => onSelect(nic.id)}
            >
              <span className="nic-radio" />
              <span>
                <div className="nic-name">
                  {nic.name}
                  {nic.recommended && <span className="nic-badge">推荐</span>}
                </div>
                <div className="nic-ip">{nic.address}</div>
              </span>
              <span className="nic-meta">{nic.netmask}</span>
            </button>
          ))}
        </div>
        <p className="hint">局域网内其他设备将通过选中的 IP 访问你的屏幕共享。</p>
      </div>
    </section>
  );
}
