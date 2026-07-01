import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getHallOfFame } from '../api';
import TeamAvatar from '../components/TeamAvatar';

const MEDALS      = ['🥇', '🥈', '🥉'];
const RANK_MEDALS = MEDALS;
const STAND_H = ['64px', '44px', '28px'];      // podium step heights: 1st, 2nd, 3rd

const SORT_OPTS = [
  { key: 'default', label: '⭐ Overall'   },
  { key: 'wins',    label: '🏏 Most Wins' },
  { key: 'winPct',  label: '📈 Win Rate'  },
  { key: 'runs',    label: '💥 Most Runs' },
];

function sortRows(rows, key) {
  const s = [...rows];
  if (key === 'wins')    return s.sort((a, b) => b.wins - a.wins    || b.winPct - a.winPct);
  if (key === 'winPct')  return s.sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
  if (key === 'runs')    return s.sort((a, b) => b.runsScored - a.runsScored);
  return s; // default: already sorted by backend (titles → wins → winPct)
}

/** Animated counter that counts up to the target value on mount */
function CountUp({ to, suffix = '', duration = 800 }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!to) return;
    let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      setVal(Math.floor(progress * to));
      if (progress < 1) requestAnimationFrame(step);
      else setVal(to);
    };
    requestAnimationFrame(step);
  }, [to, duration]);
  return <>{val.toLocaleString()}{suffix}</>;
}

/** One summary stat card */
function StatCard({ icon, value, label, delay = 0, accent }) {
  return (
    <div className="hof-stat-card" style={{ animationDelay: `${delay}s` }}>
      <span className="hof-stat-icon">{icon}</span>
      <span className="hof-stat-val" style={accent ? { color: accent } : {}}>
        <CountUp to={value} />
      </span>
      <span className="hof-stat-label">{label}</span>
    </div>
  );
}

/** Olympic-style podium with 2nd–1st–3rd ordering */
function Podium({ rows }) {
  if (rows.length === 0) return null;

  // Olympic order: 2nd | 1st | 3rd
  const slots = [
    rows[1] ?? null,  // left  — 2nd
    rows[0],          // center — 1st
    rows[2] ?? null,  // right  — 3rd
  ];
  const rankIndex = [1, 0, 2]; // which medal to use for each slot

  return (
    <div className="hof-podium">
      {slots.map((row, slotIdx) => {
        if (!row) return <div key={slotIdx} className="hof-podium-slot" />;
        const rank = rankIndex[slotIdx];
        return (
          <div key={row.name} className={`hof-podium-slot`} style={{ animationDelay: `${slotIdx * 0.12}s` }}>
            <div className={`hof-podium-card rank-${rank + 1}`}>
              <div className="hof-podium-medal">{MEDALS[rank]}</div>
              <TeamAvatar name={row.name} size={56} style={{ margin: '0 auto 0.6rem' }} />
              <div className="hof-podium-name">{row.name}</div>
              {row.titles > 0 && (
                <div className="hof-podium-titles">🏆 {row.titles} Title{row.titles !== 1 ? 's' : ''}</div>
              )}
              <div className="hof-podium-meta">
                {row.wins}W · {row.winPct}% · {row.played}M
              </div>
            </div>
            <div
              className={`hof-podium-stand stand-${rank + 1}`}
              style={{ height: STAND_H[rank] }}
            >
              <span>{rank + 1}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** All-Time Hall of Fame */
export default function HallOfFame() {
  const navigate = useNavigate();
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState('default');

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

  const sorted = useMemo(() => sortRows(rows, sortKey), [rows, sortKey]);

  // Summary stats derived from raw rows
  const totalMatches = useMemo(() => Math.round(rows.reduce((s, r) => s + r.played,     0) / 2), [rows]);
  const totalRuns    = useMemo(() =>              rows.reduce((s, r) => s + r.runsScored, 0),     [rows]);
  const mostTitles   = rows[0]?.titles ?? 0;
  const bestWinPct   = useMemo(() => Math.max(0, ...rows.map(r => r.winPct)), [rows]);

  return (
    <div className="container page">
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')} style={{ marginBottom: '1.5rem' }}>
        ← Back
      </button>

      {/* ── Hero ── */}
      <div className="hof-hero">
        <div className="hof-hero-icon">🏆</div>
        <div>
          <h1 className="hof-hero-title">Hall of Fame</h1>
          <p className="hof-hero-sub">All-time records across every match ever played</p>
        </div>
      </div>

      {loading && <div className="loading-wrap"><div className="spinner" />Loading records…</div>}

      {!loading && rows.length === 0 && (
        <div className="empty-state">
          <span className="empty-state-icon">🏏</span>
          <div className="empty-state-title">No records yet</div>
          <div className="empty-state-desc">Play matches to build the Hall of Fame.</div>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          {/* ── Summary stats ── */}
          <div className="hof-stats-bar">
            <StatCard icon="🏏" value={totalMatches} label="Matches Played"  delay={0}    accent="var(--color-green)" />
            <StatCard icon="💥" value={totalRuns}    label="Total Runs"      delay={0.08} accent="var(--color-blue)" />
            <StatCard icon="🏆" value={mostTitles}   label="Most Titles"     delay={0.16} accent="var(--color-gold)" />
            <StatCard icon="📈" value={bestWinPct}   label="Best Win %"      delay={0.24} accent="var(--color-green)" />
          </div>

          {/* ── Olympic podium ── */}
          <Podium rows={rows} />

          {/* ── Full leaderboard with sort tabs ── */}
          <div className="hof-section-header">
            <h2 className="hof-section-title">Full Leaderboard</h2>
            <div className="hof-sort-tabs">
              {SORT_OPTS.map(opt => (
                <button
                  key={opt.key}
                  className={`hof-sort-btn${sortKey === opt.key ? ' active' : ''}`}
                  onClick={() => setSortKey(opt.key)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="standings-table-wrap">
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
                {sorted.map((row, idx) => {
                  const isGold   = row.name === rows[0]?.name;
                  const isSilver = row.name === rows[1]?.name;
                  const isBronze = row.name === rows[2]?.name;
                  return (
                    <tr
                      key={row.name}
                      className={`hof-table-row${isGold ? ' hof-row-gold' : isSilver || isBronze ? ' qualifier-row' : ''}`}
                      style={{ animationDelay: `${idx * 0.04}s` }}
                    >
                      <td className="col-pos">
                        <span className={`position-indicator${idx < 3 ? ' top' : ''}`}>
                          {idx < 3 ? RANK_MEDALS[idx] : idx + 1}
                        </span>
                      </td>
                      <td className="col-team">
                        <div className="hof-team-cell">
                          <TeamAvatar name={row.name} size={26} />
                          <span>{row.name}</span>
                          {row.titles > 0 && (
                            <span className="hof-title-chip">{row.titles}×🏆</span>
                          )}
                        </div>
                      </td>
                      <td style={{ fontWeight: 800, color: row.titles > 0 ? 'var(--color-gold)' : 'var(--text-muted)' }}>
                        {row.titles > 0 ? row.titles : '—'}
                      </td>
                      <td>{row.played}</td>
                      <td style={{ color: 'var(--color-green)', fontWeight: 700 }}>{row.wins}</td>
                      <td>{row.losses}</td>
                      <td>{row.ties}</td>
                      <td>
                        <div className="hof-winpct-cell">
                          <span style={{ fontWeight: 700 }}>{row.winPct}%</span>
                          <div className="hof-winpct-bar">
                            <div className="hof-winpct-fill" style={{ width: `${row.winPct}%` }} />
                          </div>
                        </div>
                      </td>
                      <td>{row.runsScored.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="hof-footnote">
            🏏 Records include all completed matches — group stage, playoffs &amp; finals &nbsp;·&nbsp;
            🏆 Titles awarded to Grand Final champions
          </p>
        </>
      )}
    </div>
  );
}
