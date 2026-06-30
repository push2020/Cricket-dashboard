import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getHallOfFame } from '../api';

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

/** Returns the initials of a team name for the avatar */
function initials(name) {
  return name.split(' ').slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

/** All-Time Hall of Fame — aggregates stats across every tournament by team name */
export default function HallOfFame() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await getHallOfFame();
        setRows(data);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="container page">
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')} style={{ marginBottom: '1.5rem' }}>
        ← Back
      </button>

      {/* Hero */}
      <div className="hof-hero">
        <div className="hof-hero-icon">🏆</div>
        <div>
          <h1 className="hof-hero-title">Hall of Fame</h1>
          <p className="hof-hero-sub">All-time records across every tournament</p>
        </div>
      </div>

      {loading && (
        <div className="loading-wrap"><div className="spinner" />Loading records…</div>
      )}

      {!loading && rows.length === 0 && (
        <div className="empty-state">
          <span className="empty-state-icon">🏏</span>
          <div className="empty-state-title">No records yet</div>
          <div className="empty-state-desc">Complete a tournament to start building the Hall of Fame.</div>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          {/* Top 3 podium cards */}
          <div className="hof-podium">
            {rows.slice(0, 3).map((row, idx) => (
              <div key={row.name} className={`hof-podium-card rank-${idx + 1}`} style={{ animationDelay: `${idx * 0.1}s` }}>
                <div className="hof-podium-medal">{RANK_MEDALS[idx]}</div>
                <div className="team-avatar" style={{ width: 44, height: 44, fontSize: '1rem', margin: '0 auto 0.5rem' }}>
                  {initials(row.name)}
                </div>
                <div className="hof-podium-name">{row.name}</div>
                <div className="hof-podium-titles">
                  {row.titles > 0
                    ? `${row.titles} 🏆 title${row.titles !== 1 ? 's' : ''}`
                    : `${row.wins} win${row.wins !== 1 ? 's' : ''}`}
                </div>
                <div className="hof-podium-stats">{row.played} matches · {row.winPct}% win rate</div>
              </div>
            ))}
          </div>

          {/* Full table */}
          <div className="standings-table-wrap" style={{ marginTop: '2rem' }}>
            <table className="standings-table hof-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Team</th>
                  <th>🏆</th>
                  <th>P</th>
                  <th>W</th>
                  <th>L</th>
                  <th>T</th>
                  <th>Win %</th>
                  <th>Runs</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.name} className={idx === 0 ? 'hof-row-gold' : idx < 3 ? 'qualifier-row' : ''}>
                    <td className="col-pos">
                      <span className={`position-indicator${idx < 3 ? ' top' : ''}`}>
                        {idx < 3 ? RANK_MEDALS[idx] : idx + 1}
                      </span>
                    </td>
                    <td className="col-team">{row.name}</td>
                    <td style={{ fontWeight: 800, color: row.titles > 0 ? 'var(--color-gold)' : 'var(--text-muted)' }}>
                      {row.titles > 0 ? row.titles : '—'}
                    </td>
                    <td>{row.played}</td>
                    <td style={{ color: 'var(--color-green)', fontWeight: 700 }}>{row.wins}</td>
                    <td>{row.losses}</td>
                    <td>{row.ties}</td>
                    <td style={{ fontWeight: 700 }}>{row.winPct}%</td>
                    <td>{row.runsScored}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '1rem', textAlign: 'center' }}>
            Records based on completed group-stage matches. Titles awarded for winning the Final.
          </p>
        </>
      )}
    </div>
  );
}
