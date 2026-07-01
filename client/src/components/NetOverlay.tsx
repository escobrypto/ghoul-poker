// Reconnect loading screen + persistent latency indicator. Production UX so the
// player always knows their connection state; never a frozen, silent table.
import type { ConnStatus } from '../net/socket';

export function ReconnectScreen({ conn }: { conn: ConnStatus }) {
  if (conn === 'online') return null;
  const msg = conn === 'reconnecting' ? 'Reconnecting to the trenches…'
    : conn === 'offline' ? 'Connection lost. Clawing our way back…'
    : 'Entering the trenches…';
  return (
    <div className="net-veil">
      <div className="net-box">
        <div className="net-skull">👻</div>
        <div className="net-msg">{msg}</div>
        <div className="net-spinner" />
      </div>
    </div>
  );
}

export function LatencyBadge({ conn, latency }: { conn: ConnStatus; latency: number }) {
  const bars = latency < 80 ? 3 : latency < 180 ? 2 : 1;
  const cls = conn !== 'online' ? 'bad' : latency < 80 ? 'good' : latency < 180 ? 'ok' : 'bad';
  return (
    <div className={`lat-badge ${cls}`} title={`${latency}ms`}>
      <span className={`bar${bars >= 1 ? ' on' : ''}`} />
      <span className={`bar${bars >= 2 ? ' on' : ''}`} />
      <span className={`bar${bars >= 3 ? ' on' : ''}`} />
      <span className="ms">{conn === 'online' ? `${latency}ms` : 'offline'}</span>
    </div>
  );
}
