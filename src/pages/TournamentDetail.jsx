import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getTournament,
  getTeams,
  getFixtures,
  getStandings,
  getTournamentStats,
  createTeam,
  deleteTeam,
  generateFixtures,
  generatePlayoffs,
} from '../api';

const STATUS_LABEL = { upcoming: 'Upcoming', active: 'Active', completed: 'Completed' };
const STATUS_CLASS = { upcoming: 'badge-upcoming', active: 'badge-active', completed: 'badge-completed' };

const RANK_MEDAL = ['🥇', '🥈', '🥉'];
const RANK_CLASS = ['rank-1', 'rank-2', 'rank-3'];

/** Returns the initials of a team name for the avatar circle */
function initials(name) {
  return name.split(' ').slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

/** Formats an NRR number with a leading + or – sign */
function formatNrr(nrr) {
  if (typeof nrr !== 'number') return '0.000';
  return (nrr >= 0 ? '+' : '') + nrr.toFixed(3);
}

/** Groups an array of fixtures by their round number */
function groupByRound(fixtures) {
  const groups = {};
  fixtures.forEach((f) => {
    if (!groups[f.round]) groups[f.round] = [];
    groups[f.round].push(f);
  });
  return groups;
}

/** Returns the display score string for a completed innings */
function scoreStr(innings) {
  if (!innings || innings.runs === undefined) return '—';
  return `${innings.runs}/${innings.wickets} (${innings.overs})`;
}

/**
 * Single fixture card — handles null awayTeam for the Final before Eliminator is played.
 * Final fixtures navigate to /final/:id; others go to /match/:id.
 */
function FixtureCard({ f, isPlayoff }) {
  const navigate = useNavigate();
  const homeTeamName = f.homeTeam?.name ?? 'TBD';
  const awayTeamName = f.awayTeam?.name ?? 'TBD';
  const isAwayTbd = !f.awayTeam;
  const matchPath = f.type === 'final' ? `/final/${f._id}` : `/match/${f._id}`;

  return (
    <div className={`fixture-card ${f.status}${isPlayoff ? ' playoff' : ''}`}>
      <div className="fixture-teams">
        <span className={`fixture-team-name${f.winner?._id === f.homeTeam?._id ? ' winner' : ''}`}>
          {homeTeamName}
        </span>
        <span className="vs-badge">vs</span>
        <span className={`fixture-team-name${!isAwayTbd && f.winner?._id === f.awayTeam?._id ? ' winner' : ''}`}>
          {awayTeamName}
        </span>
      </div>

      {f.status === 'completed' && (
        <div className="fixture-result">
          <div className="fixture-score">
            <span>{scoreStr(f.homeInnings)}</span>
            <span className="fixture-score-sep">|</span>
            <span>{scoreStr(f.awayInnings)}</span>
          </div>
          {f.resultNote && <div className="fixture-result-note">{f.resultNote}</div>}
        </div>
      )}

      <div className="fixture-actions">
        <span className={`badge badge-${f.status}`}>{f.status}</span>
        {f.status === 'scheduled' && !isAwayTbd && (
          <button className="btn btn-primary btn-sm" onClick={() => navigate(matchPath)}>
            Enter Result
          </button>
        )}
        {f.status === 'scheduled' && isAwayTbd && (
          <span className="tbd-label">Awaiting Eliminator result</span>
        )}
        {f.status === 'completed' && (
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(matchPath)}>
            Edit
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Visual bracket showing Eliminator → Final flow.
 */
function BracketView({ eliminatorFixture: ef, finalFixture: ff }) {
  const eliminatorWinner = ef?.status === 'completed' ? ef.winner?.name : null;
  const finalWinner = ff?.status === 'completed' ? ff.winner?.name : null;

  return (
    <div className="bracket-wrap">
      <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-gold)', marginBottom: '1.25rem' }}>
        Playoff Bracket
      </div>
      <div className="bracket-inner">
        {/* Left column: 2nd and 3rd */}
        <div className="bracket-col" style={{ gap: '0.6rem' }}>
          <div className={`bracket-team-node rank-2`}>
            <span className="bracket-rank-badge">🥈</span>
            <span>{ef?.homeTeam?.name ?? '—'}</span>
          </div>
          <div style={{ textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-muted)', padding: '0.15rem 0' }}>vs</div>
          <div className={`bracket-team-node rank-3`}>
            <span className="bracket-rank-badge">🥉</span>
            <span>{ef?.awayTeam?.name ?? '—'}</span>
          </div>
        </div>

        {/* Connector + Eliminator box */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', width: 24 }}>
            <div style={{ width: '100%', height: 1, background: 'rgba(16,185,129,0.35)', marginTop: 22 }} />
            <div style={{ width: 1, height: 36, background: 'rgba(16,185,129,0.25)', marginRight: 0 }} />
            <div style={{ width: '100%', height: 1, background: 'rgba(16,185,129,0.35)', marginBottom: 22 }} />
          </div>
          <div className="bracket-match-box" style={{ marginLeft: 0 }}>
            <div className="bracket-match-title">Eliminator</div>
            <div className="bracket-match-teams" style={{ marginTop: 4 }}>
              {eliminatorWinner
                ? <span style={{ color: 'var(--color-green)', fontWeight: 700 }}>Winner: {eliminatorWinner}</span>
                : <span>TBD</span>}
            </div>
          </div>
        </div>

        {/* Arrow to Final */}
        <div className="bracket-arrow">→</div>

        {/* Final box with 1st place joining */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', alignItems: 'flex-start' }}>
          <div className="bracket-team-node rank-1" style={{ marginBottom: '0.25rem' }}>
            <span className="bracket-rank-badge">🥇</span>
            <span>{ff?.homeTeam?.name ?? '—'}</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--color-gold)', marginLeft: 4 }}>Direct</span>
          </div>
          <div className="bracket-match-box final-box">
            <div className="bracket-match-title">Final</div>
            <div className="bracket-match-teams" style={{ marginTop: 4 }}>
              {finalWinner
                ? <span style={{ color: 'var(--color-gold)', fontWeight: 800 }}>🏆 {finalWinner}</span>
                : <span>vs {eliminatorWinner ?? 'Elim. Winner'}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Renders the Teams tab */
function TeamsTab({ tournament, teams, onTeamAdded, onTeamDeleted }) {
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  /** Submits the add-team form */
  async function handleAdd(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setError('');
    try {
      setAdding(true);
      const { data } = await createTeam({ name, tournamentId: tournament._id });
      onTeamAdded(data);
      setNewName('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add team.');
    } finally {
      setAdding(false);
    }
  }

  /** Deletes a team after confirmation */
  async function handleDelete(id) {
    if (!confirm('Remove this team?')) return;
    try {
      await deleteTeam(id);
      onTeamDeleted(id);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete team.');
    }
  }

  return (
    <div>
      {teams.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">👥</div>
          <div className="empty-state-title">No teams yet</div>
          <div className="empty-state-desc">Add teams below to set up the tournament.</div>
        </div>
      ) : (
        <div className="teams-list">
          {teams.map((team, idx) => (
            <div key={team._id} className="team-row" style={{ animationDelay: `${idx * 0.05}s` }}>
              <div className="team-name">
                <div className="team-avatar">{initials(team.name)}</div>
                {team.name}
              </div>
              {!tournament.fixturesGenerated && (
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(team._id)}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!tournament.fixturesGenerated && (
        <>
          {error && <div className="error-banner">{error}</div>}
          <form className="add-team-form" onSubmit={handleAdd}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label" htmlFor="team-name-input">Add Team</label>
              <input
                id="team-name-input"
                className="form-input"
                placeholder="Enter team / player name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={adding || !newName.trim()} style={{ marginTop: '1.4rem' }}>
              {adding ? 'Adding…' : 'Add'}
            </button>
          </form>
        </>
      )}

      {tournament.fixturesGenerated && (
        <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '1rem' }}>
          Teams are locked after fixtures are generated.
        </p>
      )}
    </div>
  );
}

/** Renders the Group Stage Fixtures tab */
function FixturesTab({ tournament, fixtures, teams, onFixturesGenerated }) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const groupFixtures = fixtures.filter((f) => (f.type ?? 'group') === 'group');

  /** Generates round-robin fixtures */
  async function handleGenerate() {
    setError('');
    try {
      setGenerating(true);
      await generateFixtures(tournament._id);
      await onFixturesGenerated();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate fixtures.');
    } finally {
      setGenerating(false);
    }
  }

  const rounds = groupByRound(groupFixtures);

  return (
    <div>
      {!tournament.fixturesGenerated && (
        <div style={{ marginBottom: '1.5rem' }}>
          {error && <div className="error-banner">{error}</div>}
          <div className="card" style={{ background: 'var(--bg-secondary)', borderStyle: 'dashed' }}>
            <div className="card-body" style={{ textAlign: 'center', padding: '2.5rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📋</div>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                {teams.length < 2
                  ? `Add at least 2 teams to generate fixtures (${teams.length} added)`
                  : `Ready to generate ${(teams.length * (teams.length - 1)) / 2} matches across ${teams.length} teams`}
              </p>
              <button className="btn btn-primary btn-lg" onClick={handleGenerate} disabled={generating || teams.length < 2}>
                {generating ? 'Generating…' : 'Generate Round-Robin Fixtures'}
              </button>
            </div>
          </div>
        </div>
      )}

      {groupFixtures.length === 0 && tournament.fixturesGenerated && (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-title">No fixtures found</div>
        </div>
      )}

      {Object.keys(rounds).map(Number).sort((a, b) => a - b).map((round) => (
        <div key={round} className="round-group">
          <div className="round-label">Round {round}</div>
          <div className="fixtures-list">
            {rounds[round].map((f) => <FixtureCard key={f._id} f={f} isPlayoff={false} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Playoffs tab — shown only when playoffGenerated is true.
 * Shows qualifier cards, bracket, then actual match entries.
 */
function PlayoffsTab({ tournament, fixtures, standings, onPlayoffsGenerated }) {
  const [generatingPlayoffs, setGeneratingPlayoffs] = useState(false);
  const [error, setError] = useState('');

  const groupFixtures = fixtures.filter((f) => (f.type ?? 'group') === 'group');
  const eliminatorFixture = fixtures.find((f) => f.type === 'eliminator') ?? null;
  const finalFixture = fixtures.find((f) => f.type === 'final') ?? null;

  const allGroupDone = groupFixtures.length > 0 && groupFixtures.every(
    (f) => f.status === 'completed' || f.status === 'abandoned'
  );

  const canGenerate = tournament.fixturesGenerated && !tournament.playoffGenerated && allGroupDone;

  /** Generates playoff fixtures */
  async function handleGeneratePlayoffs() {
    setError('');
    try {
      setGeneratingPlayoffs(true);
      await generatePlayoffs(tournament._id);
      await onPlayoffsGenerated();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate playoffs.');
    } finally {
      setGeneratingPlayoffs(false);
    }
  }

  if (!tournament.fixturesGenerated) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🏆</div>
        <div className="empty-state-title">Playoffs not available yet</div>
        <div className="empty-state-desc">Generate group stage fixtures first.</div>
      </div>
    );
  }

  if (!tournament.playoffGenerated) {
    return (
      <div>
        {error && <div className="error-banner">{error}</div>}

        {!allGroupDone && (
          <div className="empty-state">
            <div className="empty-state-icon">⏳</div>
            <div className="empty-state-title">Group stage in progress</div>
            <div className="empty-state-desc">Complete all group stage matches to unlock playoffs.</div>
          </div>
        )}

        {allGroupDone && standings.length >= 3 && (
          <div>
            {/* Qualifying teams preview */}
            <div style={{ marginBottom: '2rem' }}>
              <div className="playoff-section-label" style={{ marginBottom: '1.25rem' }}>🏆 Qualifiers</div>
              <div className="qualifiers-section">
                {standings.slice(0, 3).map((row, idx) => (
                  <div key={row.team._id} className={`qualifier-card ${RANK_CLASS[idx]}`} style={{ animationDelay: `${idx * 0.12}s` }}>
                    <span className="qualifier-medal">{RANK_MEDAL[idx]}</span>
                    <div className="qualifier-rank">{idx === 0 ? '1st — Direct Final' : idx === 1 ? '2nd — Eliminator' : '3rd — Eliminator'}</div>
                    <div className="qualifier-name">{row.team.name}</div>
                    <div className="qualifier-stats">{row.points} pts · NRR {formatNrr(row.nrr)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Generate button */}
            <div className="card" style={{ background: 'var(--bg-secondary)', borderStyle: 'dashed', borderColor: 'rgba(245,158,11,0.4)' }}>
              <div className="card-body" style={{ textAlign: 'center', padding: '2.5rem' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🏟️</div>
                <p style={{ color: 'var(--color-gold)', fontWeight: 700, marginBottom: '0.5rem', fontSize: '1.05rem' }}>
                  Group Stage Complete!
                </p>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.92rem' }}>
                  1st place enters the Final directly. 2nd vs 3rd play the Eliminator.
                </p>
                <button className="btn btn-gold btn-lg" onClick={handleGeneratePlayoffs} disabled={generatingPlayoffs}>
                  {generatingPlayoffs ? 'Generating…' : '🚀 Generate Playoffs'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* Playoffs are generated — show full bracket + matches */
  return (
    <div>
      {/* Top 3 qualifier cards */}
      {standings.length >= 3 && (
        <div style={{ marginBottom: '2rem' }}>
          <div className="playoff-section-label" style={{ marginBottom: '1.25rem' }}>🏆 Qualifiers</div>
          <div className="qualifiers-section">
            {standings.slice(0, 3).map((row, idx) => (
              <div key={row.team._id} className={`qualifier-card ${RANK_CLASS[idx]}`} style={{ animationDelay: `${idx * 0.1}s` }}>
                <span className="qualifier-medal">{RANK_MEDAL[idx]}</span>
                <div className="qualifier-rank">{idx === 0 ? '1st Place' : idx === 1 ? '2nd Place' : '3rd Place'}</div>
                <div className="qualifier-name">{row.team.name}</div>
                <div className="qualifier-stats">{row.points} pts · NRR {formatNrr(row.nrr)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bracket visualization */}
      <BracketView eliminatorFixture={eliminatorFixture} finalFixture={finalFixture} />

      {/* Eliminator match */}
      {eliminatorFixture && (
        <div className="round-group">
          <div className="round-label playoff-round-label">Eliminator · 2nd vs 3rd</div>
          <div className="fixtures-list">
            <FixtureCard f={eliminatorFixture} isPlayoff />
          </div>
        </div>
      )}

      {/* Final match */}
      {finalFixture && (
        <div className="round-group" style={{ marginTop: '1.5rem' }}>
          <div className="round-label playoff-round-label">Final · 1st vs Winner of Eliminator</div>
          <div className="fixtures-list">
            <FixtureCard f={finalFixture} isPlayoff />
          </div>
        </div>
      )}
    </div>
  );
}

/** Renders the Standings tab */
function StandingsTab({ standings, tournament, loading }) {
  if (loading) {
    return <div className="loading-wrap"><div className="spinner" />Calculating standings…</div>;
  }
  if (standings.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📊</div>
        <div className="empty-state-title">No standings yet</div>
        <div className="empty-state-desc">Standings appear once matches are played.</div>
      </div>
    );
  }

  const showQualifiers = standings.length >= 3 && !tournament?.playoffGenerated;

  return (
    <div>
      {showQualifiers && (
        <p className="qualifier-note">
          Top 3 teams will qualify for playoffs after all group matches are played.
        </p>
      )}
      <div className="standings-table-wrap">
        <table className="standings-table">
          <thead>
            <tr>
              <th>#</th><th>Team</th><th>P</th><th>W</th><th>L</th><th>T</th>
              <th className="col-pts">Pts</th><th>NRR</th><th>RS</th><th>RC</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row, idx) => (
              <tr key={row.team._id} className={idx < 3 ? 'qualifier-row' : ''}>
                <td className="col-pos">
                  <span className={`position-indicator${idx < 3 ? ' top' : ''}`}>{idx + 1}</span>
                </td>
                <td className="col-team">{row.team.name}</td>
                <td>{row.played}</td><td>{row.won}</td><td>{row.lost}</td><td>{row.tied}</td>
                <td className="col-pts">{row.points}</td>
                <td className={`col-nrr ${row.nrr >= 0 ? 'positive' : 'negative'}`}>{formatNrr(row.nrr)}</td>
                <td>{row.runsScored}</td><td>{row.runsConceded}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Renders a single highlight stat card */
function StatCard({ icon, label, value, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-card-icon">{icon}</div>
      <div className="stat-card-label">{label}</div>
      {value
        ? <div className="stat-card-value">{value}</div>
        : <div className="stat-card-empty">No data yet</div>}
      {sub && value && <div className="stat-card-sub">{sub}</div>}
    </div>
  );
}

/** Renders the Highlights tab — fun tournament stats */
function HighlightsTab({ tournamentId }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await getTournamentStats(tournamentId);
        setStats(data);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tournamentId]);

  if (loading) {
    return <div className="loading-wrap"><div className="spinner" />Computing stats…</div>;
  }

  const { biggestWin, highestScore, winStreaks } = stats ?? {};

  return (
    <div>
      <div className="stat-cards-grid">
        <StatCard
          icon="💥"
          label="Biggest Win"
          value={biggestWin?.resultNote || (biggestWin ? `${biggestWin.winnerName} won by ${biggestWin.margin} runs` : null)}
          sub={biggestWin ? `${biggestWin.winnerName} vs ${biggestWin.loserName}` : null}
        />
        <StatCard
          icon="🏏"
          label="Highest Score"
          value={highestScore ? `${highestScore.runs}/${highestScore.wickets}` : null}
          sub={highestScore ? `${highestScore.teamName} vs ${highestScore.againstName}` : null}
        />
        <div className="stat-card">
          <div className="stat-card-icon">🔥</div>
          <div className="stat-card-label">Win Streaks</div>
          {winStreaks && winStreaks.length > 0 ? (
            <div className="stat-card-streaks">
              {winStreaks.map(({ teamName, streak }) => (
                <div key={teamName} className="stat-card-streak-row">
                  <span className="stat-card-streak-name">{teamName}</span>
                  <span className="stat-card-streak-count">{streak} in a row</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="stat-card-empty">No streaks yet</div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Tournament Detail page */
export default function TournamentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [tournament, setTournament] = useState(null);
  const [teams, setTeams] = useState([]);
  const [fixtures, setFixtures] = useState([]);
  const [standings, setStandings] = useState([]);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('teams');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /** Loads tournament, teams, fixtures (and standings if playoffs generated) */
  const loadData = useCallback(async () => {
    try {
      const [tRes, teRes, fRes] = await Promise.all([
        getTournament(id),
        getTeams(id),
        getFixtures(id),
      ]);
      setTournament(tRes.data);
      setTeams(teRes.data);
      setFixtures(fRes.data);

      if (tRes.data.playoffGenerated || tRes.data.fixturesGenerated) {
        const { data: sData } = await getStandings(id);
        setStandings(sData);
      }
    } catch {
      setError('Failed to load tournament data.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  /** Loads standings for the standings tab */
  async function loadStandings() {
    setStandingsLoading(true);
    try {
      const { data } = await getStandings(id);
      setStandings(data);
    } catch {
      setStandings([]);
    } finally {
      setStandingsLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (activeTab === 'standings') loadStandings();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFixturesGenerated() { await loadData(); }

  async function handlePlayoffsGenerated() {
    await loadData();
    setActiveTab('playoffs');
  }

  if (loading) {
    return <div className="container"><div className="loading-wrap"><div className="spinner" />Loading tournament…</div></div>;
  }

  if (error || !tournament) {
    return (
      <div className="container page">
        <div className="error-banner">{error || 'Tournament not found.'}</div>
        <button className="btn btn-ghost" onClick={() => navigate('/')}>← Back</button>
      </div>
    );
  }

  const totalMatches = fixtures.length;
  const completedMatches = fixtures.filter((f) => f.status === 'completed').length;

  /* Tabs: always show Teams, Fixtures, Standings.
     Show Playoffs tab when fixtures are generated (it handles its own empty state). */
  const tabs = [
    { key: 'teams', label: 'Teams' },
    { key: 'fixtures', label: 'Group Stage' },
    ...(tournament.fixturesGenerated ? [{ key: 'playoffs', label: tournament.playoffGenerated ? '🏆 Playoffs' : 'Playoffs' }] : []),
    { key: 'standings', label: 'Standings' },
    ...(completedMatches > 0 ? [{ key: 'highlights', label: '⭐ Highlights' }] : []),
  ];

  return (
    <div className="container page">
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')} style={{ marginBottom: '1.5rem' }}>
        ← All Tournaments
      </button>

      {/* Hero */}
      <div className="tournament-hero">
        <div className="tournament-hero-top">
          <div>
            <h1 className="tournament-hero-title">{tournament.name}</h1>
            {tournament.description && <p className="tournament-hero-desc">{tournament.description}</p>}
          </div>
          <span className={`badge ${STATUS_CLASS[tournament.status]}`}>{STATUS_LABEL[tournament.status]}</span>
        </div>

        <div className="tournament-hero-stats">
          {[
            { value: tournament.overs, label: 'Overs' },
            { value: teams.length, label: 'Teams' },
            { value: totalMatches, label: 'Matches' },
            { value: completedMatches, label: 'Played' },
            { value: totalMatches - completedMatches, label: 'Remaining' },
          ].map(({ value, label }) => (
            <div key={label} className="hero-stat">
              <span className="hero-stat-value">{value}</span>
              <span className="hero-stat-label">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <div className="tab-list" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`tab-btn${activeTab === tab.key ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="tab-content">
          {activeTab === 'teams' && (
            <TeamsTab
              tournament={tournament} teams={teams}
              onTeamAdded={(team) => setTeams((prev) => [...prev, team])}
              onTeamDeleted={(teamId) => setTeams((prev) => prev.filter((t) => t._id !== teamId))}
            />
          )}
          {activeTab === 'fixtures' && (
            <FixturesTab
              tournament={tournament} fixtures={fixtures} teams={teams}
              onFixturesGenerated={handleFixturesGenerated}
            />
          )}
          {activeTab === 'playoffs' && (
            <PlayoffsTab
              tournament={tournament} fixtures={fixtures} standings={standings}
              onPlayoffsGenerated={handlePlayoffsGenerated}
            />
          )}
          {activeTab === 'standings' && (
            <StandingsTab standings={standings} tournament={tournament} loading={standingsLoading} />
          )}
          {activeTab === 'highlights' && (
            <HighlightsTab tournamentId={id} />
          )}
        </div>
      </div>
    </div>
  );
}
