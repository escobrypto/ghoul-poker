// Leaderboard — live ranking from the server (Postgres in prod). Read-only; can't
// affect the authoritative game. Refreshes on mount, on an interval, and whenever
// the parent bumps `refreshKey` (e.g. after a hand result, since your rank moved).
import { useEffect, useState } from 'react';
import type { LeaderRow, ProfilePayload } from '../net/protocol';

interface Props {
  profile: ProfilePayload | null;
  fetchLeaderboard: (cb: (rows: LeaderRow[]) => void) => void;
  refreshKey?: number;
}

const MEDAL = ['🥇', '🥈', '🥉'];

export default function Leaderboard({ profile, fetchLeaderboard, refreshKey }: Props) {
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = () => fetchLeaderboard((r) => { if (alive) { setRows(r); setLoading(false); } });
    load();
    const iv = setInterval(load, 15_000); // periodic refresh
    return () => { alive = false; clearInterval(iv); };
  }, [fetchLeaderboard, refreshKey]);

  return (
    <div className="leaderboard">
      <div className="lb-head">
        <h3>💀 NIGHT OWLS · TOP 20</h3>
        <span className="lb-live">LIVE</span>
      </div>

      {loading ? (
        <div className="lb-loading"><div className="net-spinner" /></div>
      ) : !rows || rows.length === 0 ? (
        <div className="lb-empty">
          <div className="fi">👑</div>
          <p>No ranked ghouls yet. Win some hands and claim the throne.</p>
        </div>
      ) : (
        <div className="lb-list">
          {rows.map((r, i) => {
            const isYou = profile && r.name === profile.name;
            return (
              <div key={`${r.name}-${i}`} className={`lb-row${isYou ? ' you' : ''}${i < 3 ? ' top' : ''}`}>
                <span className="lb-rank">{i < 3 ? MEDAL[i] : `#${i + 1}`}</span>
                <span className="lb-name">{r.name}{r.founder && <span className="lb-founder" title={`Founder #${r.founderNumber}`}> 👑</span>}{isYou ? ' (you)' : ''}</span>
                <span className="lb-lvl">LVL {r.level}</span>
                <span className="lb-wins">{r.handsWon}W</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
