import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getHallOfFame } from '../api';
import TeamAvatar from '../components/TeamAvatar';

const MEDALS      = ['🥇', '🥈', '🥉'];
const RANK_MEDALS = MEDALS;
const STAND_H     = ['64px', '44px', '28px'];

const SORT_OPTS = [
  { key: 'default', label: '⭐ Overall'   },
  { key: 'wins',    label: '🏏 Most Wins' },
  { key: 'winPct',  label: '📈 Win Rate'  },
  { key: 'runs',    label: '💥 Most Runs' },
];

function sortRows(rows, key) {
  const s = [...rows];
  if (key === 'wins')   return s.sort((a, b) => b.wins - a.wins || b.winPct - a.winPct);
  if (key === 'winPct') return s.sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
  if (key === 'runs')   return s.sort((a, b) => b.runsScored - a.runsScored);
  return s;
}

function CountUp({ to, duration = 800 }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!to) return;
    let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setVal(Math.floor(p * to));
      if (p < 1) requestAnimationFrame(step);
      else setVal(to);
    };
    requestAnimationFrame(step);
  }, [to, duration]);
  return <>{val.toLocaleString()}</>;
}

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

function Podium({ rows }) {
  if (!rows.length) return null;
  const slots = [rows[1] ?? null, rows[0], rows[2] ?? null];
  const rankIndex = [1, 0, 2];
  return (
    <div className="hof-podium">
      {slots.map((row, si) => {
        if (!row) return <div key={si} className="hof-podium-slot" />;
        const rank = rankIndex[si];
        return (
          <div key={row.name} className="hof-podium-slot" style={{ animationDelay: `${si * 0.12}s` }}>
            <div className={`hof-podium-card rank-${rank + 1}`}>
              <div className="hof-podium-medal">{MEDALS[rank]}</div>
              <TeamAvatar name={row.name} size={56} style={{ margin: '0 auto 0.6rem' }} />
              <div className="hof-podium-name">{row.name}</div>
              {row.titles > 0 && <div className="hof-podium-titles">🏆 {row.titles} Title{row.titles !== 1 ? 's' : ''}</div>}
              <div className="hof-podium-meta">{row.wins}W · {row.winPct}% · {row.played}M</div>
            </div>
            <div className={`hof-podium-stand stand-${rank + 1}`} style={{ height: STAND_H[rank] }}>
              <span>{rank + 1}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Head-to-head card for a player pair */
function H2HCard({ h }) {
  const p1Leads = h.p1SeriesWins > h.p2SeriesWins;
  const p2Leads = h.p2SeriesWins > h.p1SeriesWins;
  return (
    <div className="h2h-card">
      <div className="h2h-player">
        <TeamAvatar name={h.player1} size={40} style={{ margin: '0 auto 0.35rem' }} />
        <div className="h2h-name">{h.player1}</div>
        <div className={`h2h-series-score${p1Leads ? ' h2h-leader' : ''}`}>{h.p1SeriesWins}</div>
        <div className="h2h-match-rec">{h.p1MatchWins} matches</div>
      </div>

      <div className="h2h-mid">
        <div className="h2h-label">🤝 Series</div>
        <div className="h2h-total">{h.totalSeries} played</div>
        {h.seriesTied > 0 && <div className="h2h-tied">{h.seriesTied} tied</div>}
      </div>

      <div className="h2h-player">
        <TeamAvatar name={h.player2} size={40} style={{ margin: '0 auto 0.35rem' }} />
        <div className="h2h-name">{h.player2}</div>
        <div className={`h2h-series-score${p2Leads ? ' h2h-leader' : ''}`}>{h.p2SeriesWins}</div>
        <div className="h2h-match-rec">{h.p2MatchWins} matches</div>
      </div>
    </div>
  );
}

/** Bilateral series section */
function BilateralSection({ bilateral }) {
  const { leaderboard = [], headToHead = [] } = bilateral;
  if (!leaderboard.length && !headToHead.length) return null;

  return (
    <div className="bilateral-hof-section">
      {/* Section header */}
      <div className="bilateral-hof-header">
        <span className="bilateral-hof-icon">🤝</span>
        <div>
          <h2 className="bilateral-hof-title">Bilateral Series Records</h2>
          <p className="bilateral-hof-sub">Head-to-head series between players</p>
        </div>
      </div>

      {/* Head-to-head cards */}
      {headToHead.length > 0 && (
        <>
          <div className="hof-section-header" style={{ marginBottom: '0.85rem' }}>
            <h3 className="hof-section-title" style={{ fontSize: '0.85rem' }}>Head to Head</h3>
          </div>
          <div className="h2h-grid">
            {headToHead.map((h) => (
              <H2HCard key={`${h.player1}|||${h.player2}`} h={h} />
            ))}
          </div>
        </>
      )}

      {/* Series leaderboard */}
      {leaderboard.length > 0 && (
        <>
          <div className="hof-section-header" style={{ margin: '1.5rem 0 0.85rem' }}>
            <h3 className="hof-section-title" style={{ fontSize: '0.85rem' }}>Series Leaderboard</h3>
          </div>
          <div className="standings-table-wrap">
            <table className="standings-table hof-table">
              <thead>
                <tr>
                  <th>#</th><th>Player</th>
                  <th>Series W</th><th>Series L</th><th>Series T</th>
                  <th>Match W</th><th>Match L</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row, idx) => (
                  <tr key={row.name} className={`hof-table-row${idx === 0 ? ' hof-row-gold' : ''}`} style={{ animationDelay: `${idx * 0.05}s` }}>
                    <td className="col-pos">
                      <span className={`position-indicator${idx < 3 ? ' top' : ''}`}>
                        {idx < 3 ? MEDALS[idx] : idx + 1}
                      </span>
                    </td>
                    <td className="col-team">
                      <div className="hof-team-cell">
                        <TeamAvatar name={row.name} size={24} />
                        <span>{row.name}</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--color-gold)', fontWeight: 800 }}>{row.seriesWon}</td>
                    <td>{row.seriesLost}</td>
                    <td>{row.seriesTied}</td>
                    <td style={{ color: 'var(--color-green)', fontWeight: 700 }}>{row.matchesWon}</td>
                    <td>{row.matchesLost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/** All-Time Hall of Fame */
export default function HallOfFame() {
  const navigate = useNavigate();
  const [regular,   setRegular]   = useState([]);
  const [bilateral, setBilateral] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [sortKey,   setSortKey]   = useState('default');

  useEffect(() => {
    async function load() {
      try {
        const { data } = await getHallOfFame();
        // Support both old array shape and new { regular, bilateral } shape
        if (Array.isArray(data)) {
          setRegular(data);
        } else {
          setRegular(data.regular ?? []);
          setBilateral(data.bilateral ?? null);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const sorted = useMemo(() => sortRows(regular, sortKey), [regular, sortKey]);

  const totalMatches = useMemo(() => Math.round(regular.reduce((s, r) => s + r.played, 0) / 2), [regular]);
  const totalRuns    = useMemo(() =>              regular.reduce((s, r) => s + r.runsScored, 0), [regular]);
  const mostTitles   = regular[0]?.titles ?? 0;
  const bestWinPct   = useMemo(() => Math.max(0, ...regular.map(r => r.winPct)), [regular]);

  const hasBilateral = bilateral && (bilateral.leaderboard?.length > 0 || bilateral.headToHead?.length > 0);

  return (
    <div className="container page">
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')} style={{ marginBottom: '1.5rem' }}>
        ← Back
      </button>

      <div className="hof-hero">
        <div className="hof-hero-icon">🏆</div>
        <div>
          <h1 className="hof-hero-title">Hall of Fame</h1>
          <p className="hof-hero-sub">All-time records across every match ever played</p>
        </div>
      </div>

      {loading && <div className="loading-wrap"><div className="spinner" />Loading records…</div>}

      {!loading && !regular.length && !hasBilateral && (
        <div className="empty-state">
          <span className="empty-state-icon">🏏</span>
          <div className="empty-state-title">No records yet</div>
          <div className="empty-state-desc">Play matches to build the Hall of Fame.</div>
        </div>
      )}

      {!loading && regular.length > 0 && (
        <>
          <div className="hof-stats-bar">
            <StatCard icon="🏏" value={totalMatches} label="Matches Played"  delay={0}    accent="var(--color-green)" />
            <StatCard icon="💥" value={totalRuns}    label="Total Runs"      delay={0.08} accent="var(--color-blue)" />
            <StatCard icon="🏆" value={mostTitles}   label="Most Titles"     delay={0.16} accent="var(--color-gold)" />
            <StatCard icon="📈" value={bestWinPct}   label="Best Win %"      delay={0.24} accent="var(--color-green)" />
          </div>

          <Podium rows={regular} />

          <div className="hof-section-header">
            <h2 className="hof-section-title">Tournament Leaderboard</h2>
            <div className="hof-sort-tabs">
              {SORT_OPTS.map(opt => (
                <button key={opt.key} className={`hof-sort-btn${sortKey === opt.key ? ' active' : ''}`} onClick={() => setSortKey(opt.key)}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="standings-table-wrap">
            <table className="standings-table hof-table">
              <thead>
                <tr><th>#</th><th>Team</th><th>🏆</th><th>P</th><th>W</th><th>L</th><th>T</th><th>Win %</th><th>Runs</th></tr>
              </thead>
              <tbody>
                {sorted.map((row, idx) => (
                  <tr key={row.name} className={`hof-table-row${idx === 0 ? ' hof-row-gold' : idx < 3 ? ' qualifier-row' : ''}`} style={{ animationDelay: `${idx * 0.04}s` }}>
                    <td className="col-pos"><span className={`position-indicator${idx < 3 ? ' top' : ''}`}>{idx < 3 ? RANK_MEDALS[idx] : idx + 1}</span></td>
                    <td className="col-team">
                      <div className="hof-team-cell">
                        <TeamAvatar name={row.name} size={26} />
                        <span>{row.name}</span>
                        {row.titles > 0 && <span className="hof-title-chip">{row.titles}×🏆</span>}
                      </div>
                    </td>
                    <td style={{ fontWeight: 800, color: row.titles > 0 ? 'var(--color-gold)' : 'var(--text-muted)' }}>{row.titles > 0 ? row.titles : '—'}</td>
                    <td>{row.played}</td>
                    <td style={{ color: 'var(--color-green)', fontWeight: 700 }}>{row.wins}</td>
                    <td>{row.losses}</td><td>{row.ties}</td>
                    <td>
                      <div className="hof-winpct-cell">
                        <span style={{ fontWeight: 700 }}>{row.winPct}%</span>
                        <div className="hof-winpct-bar"><div className="hof-winpct-fill" style={{ width: `${row.winPct}%` }} /></div>
                      </div>
                    </td>
                    <td>{row.runsScored.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="hof-footnote">
            🏏 Records include all completed matches — group stage, playoffs &amp; finals &nbsp;·&nbsp;
            🏆 Titles awarded to Grand Final champions
          </p>
        </>
      )}

      {/* ── Bilateral series section ── */}
      {!loading && hasBilateral && <BilateralSection bilateral={bilateral} />}
    </div>
  );
}
