import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getTournament,
  getTeams,
  getFixtures,
  getStandings,
  createTeam,
  deleteTeam,
  generateFixtures,
} from '../api';

const STATUS_LABEL = { upcoming: 'Upcoming', active: 'Active', completed: 'Completed' };
const STATUS_CLASS = { upcoming: 'badge-upcoming', active: 'badge-active', completed: 'badge-completed' };

/** Returns the initials of a team name for the avatar circle */
function initials(name) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
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

/** Renders the Teams tab — list of teams plus the add-team form */
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
          {teams.map((team) => (
            <div key={team._id} className="team-row">
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
            <button
              type="submit"
              className="btn btn-primary"
              disabled={adding || !newName.trim()}
              style={{ marginTop: '1.4rem' }}
            >
              {adding ? 'Adding…' : 'Add'}
            </button>
          </form>
        </>
      )}

      {tournament.fixturesGenerated && (
        <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '1rem' }}>
          Teams cannot be modified after fixtures are generated.
        </p>
      )}
    </div>
  );
}

/** Renders the Fixtures tab — grouped by round with generate button and result links */
function FixturesTab({ tournament, fixtures, teams, onFixturesGenerated }) {
  const navigate = useNavigate();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  /** Generates round-robin fixtures for the tournament */
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

  /** Returns the display score string for a completed innings */
  function scoreStr(innings) {
    if (!innings || innings.runs === undefined) return '—';
    return `${innings.runs}/${innings.wickets} (${innings.overs})`;
  }

  const rounds = groupByRound(fixtures);

  return (
    <div>
      {!tournament.fixturesGenerated && (
        <div style={{ marginBottom: '1.5rem' }}>
          {error && <div className="error-banner">{error}</div>}
          <div className="card" style={{ background: 'var(--bg-secondary)', borderStyle: 'dashed' }}>
            <div className="card-body" style={{ textAlign: 'center', padding: '2rem' }}>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                {teams.length < 2
                  ? `Add at least 2 teams to generate fixtures (${teams.length} added)`
                  : `Ready to generate ${teams.length} × ${teams.length - 1} / 2 = ${(teams.length * (teams.length - 1)) / 2} matches`}
              </p>
              <button
                className="btn btn-primary btn-lg"
                onClick={handleGenerate}
                disabled={generating || teams.length < 2}
              >
                {generating ? 'Generating…' : 'Generate Round-Robin Fixtures'}
              </button>
            </div>
          </div>
        </div>
      )}

      {fixtures.length === 0 && tournament.fixturesGenerated && (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-title">No fixtures found</div>
        </div>
      )}

      {Object.keys(rounds)
        .map(Number)
        .sort((a, b) => a - b)
        .map((round) => (
          <div key={round} className="round-group">
            <div className="round-label">Round {round}</div>
            <div className="fixtures-list">
              {rounds[round].map((f) => (
                <div key={f._id} className={`fixture-card ${f.status}`}>
                  <div className="fixture-teams">
                    <span className={`fixture-team-name${f.winner?._id === f.homeTeam._id ? ' winner' : ''}`}>
                      {f.homeTeam.name}
                    </span>
                    <span className="vs-badge">vs</span>
                    <span className={`fixture-team-name${f.winner?._id === f.awayTeam._id ? ' winner' : ''}`}>
                      {f.awayTeam.name}
                    </span>
                  </div>

                  {f.status === 'completed' && (
                    <div className="fixture-result">
                      <div className="fixture-score">
                        <span>{scoreStr(f.homeInnings)}</span>
                        <span className="fixture-score-sep">|</span>
                        <span>{scoreStr(f.awayInnings)}</span>
                      </div>
                      {f.resultNote && (
                        <div className="fixture-result-note">{f.resultNote}</div>
                      )}
                    </div>
                  )}

                  <div className="fixture-actions">
                    <span className={`badge badge-${f.status}`}>{f.status}</span>
                    {f.status === 'scheduled' && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => navigate(`/match/${f._id}`)}
                      >
                        Enter Result
                      </button>
                    )}
                    {f.status === 'completed' && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => navigate(`/match/${f._id}`)}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

/** Renders the Standings tab — points table sorted by pts then NRR */
function StandingsTab({ standings, loading }) {
  if (loading) {
    return (
      <div className="loading-wrap">
        <div className="spinner" />
        Calculating standings…
      </div>
    );
  }

  if (standings.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📊</div>
        <div className="empty-state-title">No standings yet</div>
        <div className="empty-state-desc">Standings will appear once matches are played.</div>
      </div>
    );
  }

  return (
    <div className="standings-table-wrap">
      <table className="standings-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>P</th>
            <th>W</th>
            <th>L</th>
            <th>T</th>
            <th className="col-pts">Pts</th>
            <th>NRR</th>
            <th>RS</th>
            <th>RC</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row, idx) => (
            <tr key={row.team._id}>
              <td className="col-pos">
                <span className={`position-indicator${idx < 2 ? ' top' : ''}`}>{idx + 1}</span>
              </td>
              <td className="col-team">{row.team.name}</td>
              <td>{row.played}</td>
              <td>{row.won}</td>
              <td>{row.lost}</td>
              <td>{row.tied}</td>
              <td className="col-pts">{row.points}</td>
              <td className={`col-nrr ${row.nrr >= 0 ? 'positive' : 'negative'}`}>
                {formatNrr(row.nrr)}
              </td>
              <td>{row.runsScored}</td>
              <td>{row.runsConceded}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Tournament Detail page — shows hero banner with tournament info, then tabbed content */
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

  /** Loads tournament, teams, and fixtures in parallel */
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
    } catch {
      setError('Failed to load tournament data.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  /** Loads the standings data separately (computed server-side) */
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

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load standings when the standings tab is opened
  useEffect(() => {
    if (activeTab === 'standings') loadStandings();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Handles newly generated fixtures by reloading all data */
  async function handleFixturesGenerated() {
    await loadData();
  }

  if (loading) {
    return (
      <div className="container">
        <div className="loading-wrap">
          <div className="spinner" />
          Loading tournament…
        </div>
      </div>
    );
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

  return (
    <div className="container page">
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')} style={{ marginBottom: '1.5rem' }}>
        ← All Tournaments
      </button>

      {/* Hero banner */}
      <div className="tournament-hero">
        <div className="tournament-hero-top">
          <div>
            <h1 className="tournament-hero-title">{tournament.name}</h1>
            {tournament.description && (
              <p className="tournament-hero-desc">{tournament.description}</p>
            )}
          </div>
          <span className={`badge ${STATUS_CLASS[tournament.status]}`}>
            {STATUS_LABEL[tournament.status]}
          </span>
        </div>

        <div className="tournament-hero-stats">
          <div className="hero-stat">
            <span className="hero-stat-value">{tournament.overs}</span>
            <span className="hero-stat-label">Overs</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-value">{teams.length}</span>
            <span className="hero-stat-label">Teams</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-value">{totalMatches}</span>
            <span className="hero-stat-label">Matches</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-value">{completedMatches}</span>
            <span className="hero-stat-label">Played</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-value">{totalMatches - completedMatches}</span>
            <span className="hero-stat-label">Remaining</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <div className="tab-list" role="tablist">
          {['teams', 'fixtures', 'standings'].map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              className={`tab-btn${activeTab === tab ? ' active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="tab-content">
          {activeTab === 'teams' && (
            <TeamsTab
              tournament={tournament}
              teams={teams}
              onTeamAdded={(team) => setTeams((prev) => [...prev, team])}
              onTeamDeleted={(teamId) => setTeams((prev) => prev.filter((t) => t._id !== teamId))}
            />
          )}
          {activeTab === 'fixtures' && (
            <FixturesTab
              tournament={tournament}
              fixtures={fixtures}
              teams={teams}
              onFixturesGenerated={handleFixturesGenerated}
            />
          )}
          {activeTab === 'standings' && (
            <StandingsTab standings={standings} loading={standingsLoading} />
          )}
        </div>
      </div>
    </div>
  );
}
