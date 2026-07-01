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

const RANK_MEDAL = ['🥇', '🥈', '🥉', '4️⃣'];
const RANK_CLASS = ['rank-1', 'rank-2', 'rank-3', 'rank-4'];

/**
 * Returns a Set of team-ID strings that have mathematically guaranteed a
 * top-qualifyCount finish in the group stage.
 * A team qualifies when fewer than qualifyCount other teams can still earn
 * strictly more points (current points + remaining matches × 2).
 *
 * @param {object[]} standings
 * @param {object[]} scheduledGroupFixtures
 * @param {number}   qualifyCount
 * @returns {Set<string>}
 */
function computeQualifiedIds(standings, scheduledGroupFixtures, qualifyCount) {
  const qualifiedIds = new Set();
  if (standings.length < qualifyCount) return qualifiedIds;

  standings.forEach((row) => {
    const teamId = (row.team._id ?? row.team).toString();

    let potentiallyAbove = 0;
    standings.forEach((other) => {
      const otherId = (other.team._id ?? other.team).toString();
      if (otherId === teamId) return;

      const remaining = scheduledGroupFixtures.filter((f) => {
        const hId = (f.homeTeam?._id ?? f.homeTeam)?.toString();
        const aId = (f.awayTeam?._id ?? f.awayTeam)?.toString();
        return hId === otherId || aId === otherId;
      }).length;

      // Use >= so we only show Q when truly certain (ties on points are uncertain)
      if (other.points + remaining * 2 >= row.points) potentiallyAbove++;
    });

    if (potentiallyAbove < qualifyCount) qualifiedIds.add(teamId);
  });

  return qualifiedIds;
}

/** Pool of emoji avatars — each team always gets the same one based on its name */
const TEAM_EMOJIS = [
  '🦁', '🐯', '🦊', '🦅', '🐉', '🦈', '⚡', '🔥',
  '🌟', '🦋', '🌊', '🎯', '💎', '🌪️', '🐺', '🐆',
  '🦏', '🦬', '🦩', '🦚', '🐊', '🦁', '🌈', '🎪',
];

/**
 * Derives a stable hash from a team name (used for colour and emoji selection).
 *
 * @param {string} name
 * @returns {number} non-negative integer
 */
function nameHash(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h) + name.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** Returns a hue (0–359) stable per team name, used for gradient colour */
function nameToHue(name) { return nameHash(name) % 360; }

/** Returns the emoji avatar for a team name — deterministic, no letters */
function teamEmoji(name) {
  return TEAM_EMOJIS[nameHash(name) % TEAM_EMOJIS.length];
}

/**
 * Returns an inline style object that gives each team a unique gradient
 * avatar background derived from its name.
 *
 * @param {string} name
 * @returns {React.CSSProperties}
 */
function teamAvatarStyle(name) {
  const h = nameToHue(name);
  return {
    background: `linear-gradient(135deg, hsl(${h},72%,58%), hsl(${(h + 35) % 360},65%,44%))`,
    border: 'none',
    boxShadow: `0 2px 8px hsla(${h},60%,45%,0.35)`,
  };
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

/** Returns the waiting label shown on a scheduled playoff fixture with TBD participants */
function tbdLabel(type) {
  if (type === 'qualifier2') return 'Awaiting Q1 & Eliminator results';
  if (type === 'final')      return 'Awaiting Qualifier 2 result';
  return 'Awaiting previous results';
}

/**
 * Single fixture card — handles null homeTeam/awayTeam for playoff matches
 * whose participants aren't yet known.
 * Final fixtures navigate to /final/:id; others go to /match/:id.
 */
function FixtureCard({ f, isPlayoff }) {
  const navigate = useNavigate();
  const homeTeamName = f.homeTeam?.name ?? 'TBD';
  const awayTeamName = f.awayTeam?.name ?? 'TBD';
  const isTbd    = !f.homeTeam || !f.awayTeam;
  const matchPath = f.type === 'final' ? `/final/${f._id}` : `/match/${f._id}`;

  return (
    <div className={`fixture-card ${f.status}${isPlayoff ? ' playoff' : ''}`}>
      <div className="fixture-teams">
        <span className={`fixture-team-name${f.winner?._id === f.homeTeam?._id ? ' winner' : ''}`}>
          {homeTeamName}
        </span>
        <span className="vs-badge">vs</span>
        <span className={`fixture-team-name${!isTbd && f.winner?._id === f.awayTeam?._id ? ' winner' : ''}`}>
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
        {f.status === 'scheduled' && !isTbd && (
          <button className="btn btn-primary btn-sm" onClick={() => navigate(matchPath)}>
            Enter Result
          </button>
        )}
        {f.status === 'scheduled' && isTbd && (
          <span className="tbd-label">{tbdLabel(f.type)}</span>
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
 * Compact match card used inside every bracket column.
 * Shows each team as a row; highlights the winner; shows score when completed.
 * When a team is null (TBD), the placeholder label is shown instead.
 *
 * @param {{ title, team1, team2, winnerId, isDone, isFinal, placeholder1, placeholder2 }} props
 */
function BracketMatchCard({ title, team1, team2, winnerId, isDone, isFinal, placeholder1, placeholder2 }) {
  const t1Id  = team1?._id?.toString();
  const t2Id  = team2?._id?.toString();
  const wId   = winnerId?.toString?.() ?? winnerId;
  const t1Won = isDone && !!wId && wId === t1Id;
  const t2Won = isDone && !!wId && wId === t2Id;

  function teamDot(name) {
    if (!name) return null;
    const h = nameToHue(name);
    return (
      <span style={{
        width: 9, height: 9, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
        background: `hsl(${h},62%,55%)`,
        boxShadow: `0 0 5px hsla(${h},58%,45%,0.45)`,
      }} />
    );
  }

  return (
    <div className={`bkt-card${isFinal ? ' bkt-final' : ''}${isDone ? ' bkt-done' : ''}`}>
      <div className="bkt-head">
        <span className="bkt-title">{title}</span>
        <span className={`bkt-dot ${isDone ? 'done' : 'pending'}`} />
      </div>
      <div className={`bkt-team${t1Won ? ' bkt-won' : ''}`}>
        {teamDot(team1?.name)}
        <span className="bkt-name">
          {team1?.name ?? <span className="bkt-tbd">{placeholder1 ?? 'TBD'}</span>}
        </span>
        {t1Won && <span className="bkt-check">✓</span>}
      </div>
      <div className="bkt-divider" />
      <div className={`bkt-team${t2Won ? ' bkt-won' : ''}`}>
        {teamDot(team2?.name)}
        <span className="bkt-name">
          {team2?.name ?? <span className="bkt-tbd">{placeholder2 ?? 'TBD'}</span>}
        </span>
        {t2Won && <span className="bkt-check">✓</span>}
      </div>
    </div>
  );
}

/**
 * Bracket for the 3-team Direct Final (1st vs 2nd, no elimination round).
 *
 * @param {{ finalFixture: object }} props
 */
function DirectFinalBracket({ finalFixture: ff }) {
  const isDone = ff?.status === 'completed';
  const winner = ff?.winner?.name;

  return (
    <div className="bkt-wrap">
      <div className="bkt-wrap-label">Playoff Bracket · Direct Final</div>
      <div className="bkt-direct-body">
        <BracketMatchCard
          title="Final"
          team1={ff?.homeTeam}
          team2={ff?.awayTeam}
          winnerId={ff?.winner?._id}
          isDone={isDone}
          isFinal
        />
        {isDone && winner && (
          <div className="bkt-champion">🏆 {winner}</div>
        )}
      </div>
    </div>
  );
}

/**
 * Proper 3-column IPL playoff bracket:
 *   Round 1: Q1 (1st vs 2nd) and Eliminator (3rd vs 4th)
 *   Round 2: Q2 (Q1 loser vs Eliminator winner)
 *   Final:   Q1 winner vs Q2 winner
 *
 * CSS bracket arms connect Round-1 outputs to Q2,
 * and a direct path label shows Q1 winner bypasses Q2.
 *
 * @param {{ q1Fixture, eliminatorFixture, qualifier2Fixture, finalFixture }} props
 */
function IplBracket({ q1Fixture: q1, eliminatorFixture: ef, qualifier2Fixture: q2, finalFixture: ff }) {
  const finalWinner = ff?.status === 'completed' ? ff.winner?.name : null;

  return (
    <div className="bkt-wrap">
      <div className="bkt-wrap-label">Playoff Bracket · IPL Format</div>

      {/* Round column headers */}
      <div className="bkt-col-headers">
        <div>Round 1</div>
        <div />
        <div>Round 2</div>
        <div />
        <div>Final</div>
      </div>

      {/* Bracket body — 5-section flex row */}
      <div className="bkt-body">

        {/* ── Round 1: Q1 (top) + Eliminator (bottom) ── */}
        <div className="bkt-r1">
          <BracketMatchCard
            title="Qualifier 1"
            team1={q1?.homeTeam}    team2={q1?.awayTeam}
            winnerId={q1?.winner?._id}
            isDone={q1?.status === 'completed'}
          />
          <div className="bkt-r1-gap" />
          <BracketMatchCard
            title="Eliminator"
            team1={ef?.homeTeam}    team2={ef?.awayTeam}
            winnerId={ef?.winner?._id}
            isDone={ef?.status === 'completed'}
          />
        </div>

        {/* ── Bracket arms: R1 → Q2 ── */}
        <div className="bkt-arms">
          <div className="bkt-arm-top" />
          <div className="bkt-arm-bottom" />
        </div>

        {/* ── Round 2: Q2 ── */}
        <div className="bkt-r2">
          <BracketMatchCard
            title="Qualifier 2"
            team1={q2?.homeTeam}    team2={q2?.awayTeam}
            winnerId={q2?.winner?._id}
            isDone={q2?.status === 'completed'}
            placeholder1="Q1 Loser"
            placeholder2="Elim Winner"
          />
        </div>

        {/* ── Arrow to Final ── */}
        <div className="bkt-to-final">
          <div className="bkt-to-final-line" />
        </div>

        {/* ── Final ── */}
        <div className="bkt-final-col">
          {/* Q1 winner direct path badge */}
          <div className="bkt-direct-badge">Q1 Winner enters directly ↓</div>
          <BracketMatchCard
            title="🏆 Final"
            team1={ff?.homeTeam}    team2={ff?.awayTeam}
            winnerId={ff?.winner?._id}
            isDone={ff?.status === 'completed'}
            isFinal
            placeholder1="Q1 Winner"
            placeholder2="Q2 Winner"
          />
          {finalWinner && (
            <div className="bkt-champion">🏆 {finalWinner}</div>
          )}
        </div>

      </div>
    </div>
  );
}

/** Renders the Teams tab */
function TeamsTab({ tournament, teams, onTeamAdded, onTeamDeleted }) {
  const [newName, setNewName] = useState('');
  const [adding,  setAdding]  = useState(false);
  const [error,   setError]   = useState('');
  const locked = tournament.fixturesGenerated;

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
      {/* Header row */}
      <div className="teams-header">
        <div className="teams-header-left">
          <span className="teams-count-badge">{teams.length}</span>
          <span className="teams-header-label">
            {teams.length === 1 ? 'Team' : 'Teams'}
          </span>
        </div>
        {locked && (
          <span className="teams-locked-pill">🔒 Locked</span>
        )}
      </div>

      {/* Team list */}
      {teams.length === 0 ? (
        <div className="empty-state" style={{ padding: '3rem 1rem' }}>
          <span className="empty-state-icon">👥</span>
          <div className="empty-state-title">No teams yet</div>
          <div className="empty-state-desc">Add your first team below.</div>
        </div>
      ) : (
        <div className="teams-list">
          {teams.map((team, idx) => {
            const avatarStyle = teamAvatarStyle(team.name);
            return (
              <div
                key={team._id}
                className={`team-row${locked ? ' team-row-locked' : ''}`}
                style={{ animationDelay: `${idx * 0.04}s` }}
              >
                {/* Number badge */}
                <span className="team-seq">#{idx + 1}</span>

                {/* Avatar */}
                <div className="team-avatar" style={avatarStyle}>
                  {teamEmoji(team.name)}
                </div>

                {/* Name */}
                <span className="team-name-text">{team.name}</span>

                {/* Remove or lock icon */}
                {!locked ? (
                  <button
                    className="team-remove-btn"
                    onClick={() => handleDelete(team._id)}
                    aria-label={`Remove ${team.name}`}
                    title="Remove team"
                  >
                    ✕
                  </button>
                ) : (
                  <span className="team-lock-icon" title="Locked">🔒</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add team form */}
      {!locked && (
        <div className="add-team-card">
          {error && <div className="error-banner" style={{ marginBottom: '1rem' }}>{error}</div>}
          <form className="add-team-form" onSubmit={handleAdd}>
            <input
              id="team-name-input"
              className="form-input add-team-input"
              placeholder="Enter team or player name…"
              value={newName}
              autoComplete="off"
              onChange={(e) => setNewName(e.target.value)}
            />
            <button
              type="submit"
              className="btn btn-primary add-team-btn"
              disabled={adding || !newName.trim()}
            >
              {adding ? '…' : '+ Add'}
            </button>
          </form>
        </div>
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
function PlayoffsTab({ tournament, fixtures, standings, teamsCount, onPlayoffsGenerated }) {
  const [generatingPlayoffs, setGeneratingPlayoffs] = useState(false);
  const [error, setError] = useState('');

  const groupFixtures      = fixtures.filter((f) => (f.type ?? 'group') === 'group');
  const qualifier1Fixture  = fixtures.find((f) => f.type === 'qualifier1')  ?? null;
  const eliminatorFixture  = fixtures.find((f) => f.type === 'eliminator')  ?? null;
  const qualifier2Fixture  = fixtures.find((f) => f.type === 'qualifier2')  ?? null;
  const finalFixture       = fixtures.find((f) => f.type === 'final')       ?? null;

  const isIpl      = teamsCount >= 4;
  const isDirect   = teamsCount === 3;
  // How many teams qualify: 4 for IPL, 2 for direct final, 0 otherwise
  const qualifyCount = isIpl ? 4 : isDirect ? 2 : 0;

  const rankLabels = isIpl
    ? ['1st — Qualifier 1', '2nd — Qualifier 1', '3rd — Eliminator', '4th — Eliminator']
    : ['1st — Direct Final', '2nd — Direct Final'];

  const rankLabelsFinal = isIpl
    ? ['1st Place', '2nd Place', '3rd Place', '4th Place']
    : ['1st Place', '2nd Place'];

  const allGroupDone = groupFixtures.length > 0 && groupFixtures.every(
    (f) => f.status === 'completed' || f.status === 'abandoned'
  );

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

        {allGroupDone && standings.length >= qualifyCount && (
          <div>
            {/* Qualifying teams preview */}
            <div style={{ marginBottom: '2rem' }}>
              <div className="playoff-section-label" style={{ marginBottom: '1.25rem' }}>🏆 Qualifiers</div>
              <div className="qualifiers-section">
                {standings.slice(0, qualifyCount).map((row, idx) => (
                  <div key={row.team._id} className={`qualifier-card ${RANK_CLASS[idx]}`} style={{ animationDelay: `${idx * 0.12}s` }}>
                    <span className="qualifier-medal">{RANK_MEDAL[idx]}</span>
                    <div className="qualifier-rank">{rankLabels[idx]}</div>
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
                  {isDirect
                    ? 'Top 2 teams qualify — they play directly in the Final.'
                    : 'Top 4 qualify. 1st vs 2nd in Q1; 3rd vs 4th in the Eliminator. Winners meet in Q2 and the Final.'}
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

  /* Playoffs are generated — show bracket + matches */
  return (
    <div>
      {/* Qualifier cards */}
      {standings.length >= qualifyCount && (
        <div style={{ marginBottom: '2rem' }}>
          <div className="playoff-section-label" style={{ marginBottom: '1.25rem' }}>🏆 Qualifiers</div>
          <div className="qualifiers-section">
            {standings.slice(0, qualifyCount).map((row, idx) => (
              <div key={row.team._id} className={`qualifier-card ${RANK_CLASS[idx]}`} style={{ animationDelay: `${idx * 0.1}s` }}>
                <span className="qualifier-medal">{RANK_MEDAL[idx]}</span>
                <div className="qualifier-rank">{rankLabelsFinal[idx]}</div>
                <div className="qualifier-name">{row.team.name}</div>
                <div className="qualifier-stats">{row.points} pts · NRR {formatNrr(row.nrr)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bracket */}
      {isDirect
        ? <DirectFinalBracket finalFixture={finalFixture} />
        : <IplBracket q1Fixture={qualifier1Fixture} eliminatorFixture={eliminatorFixture} qualifier2Fixture={qualifier2Fixture} finalFixture={finalFixture} />}

      {/* Match cards — IPL format */}
      {isIpl && (
        <>
          <div className="round-group" style={{ marginTop: '2rem' }}>
            <div className="round-label playoff-round-label">Qualifier 1 · 1st vs 2nd</div>
            <div className="fixtures-list">
              {qualifier1Fixture && <FixtureCard f={qualifier1Fixture} isPlayoff />}
            </div>
          </div>

          <div className="round-group" style={{ marginTop: '1.5rem' }}>
            <div className="round-label playoff-round-label">Eliminator · 3rd vs 4th</div>
            <div className="fixtures-list">
              {eliminatorFixture && <FixtureCard f={eliminatorFixture} isPlayoff />}
            </div>
          </div>

          <div className="round-group" style={{ marginTop: '1.5rem' }}>
            <div className="round-label playoff-round-label">Qualifier 2 · Q1 Loser vs Eliminator Winner</div>
            <div className="fixtures-list">
              {qualifier2Fixture && <FixtureCard f={qualifier2Fixture} isPlayoff />}
            </div>
          </div>

          <div className="round-group" style={{ marginTop: '1.5rem' }}>
            <div className="round-label playoff-round-label">Final · Q1 Winner vs Q2 Winner</div>
            <div className="fixtures-list">
              {finalFixture && <FixtureCard f={finalFixture} isPlayoff />}
            </div>
          </div>
        </>
      )}

      {/* Match cards — Direct Final (3 teams) */}
      {isDirect && finalFixture && (
        <div className="round-group" style={{ marginTop: '2rem' }}>
          <div className="round-label playoff-round-label">Final · 1st vs 2nd</div>
          <div className="fixtures-list">
            <FixtureCard f={finalFixture} isPlayoff />
          </div>
        </div>
      )}
    </div>
  );
}

/** Renders the Standings tab with live Q (qualified) badges */
function StandingsTab({ standings, tournament, fixtures, teamsCount, loading }) {
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

  // qualifyCount: top 4 for IPL format, top 2 for 3-team direct final
  const qualifyCount = teamsCount >= 4 ? 4 : teamsCount === 3 ? 2 : 0;
  const hasPlayoffs  = teamsCount >= 3;

  // Compute which teams have mathematically qualified (only before playoffs are generated)
  const scheduledGroupFixtures = !tournament?.playoffGenerated && fixtures
    ? fixtures.filter((f) => f.status === 'scheduled' && (f.type ?? 'group') === 'group')
    : [];
  // After playoffs are generated every top-N team has definitively qualified.
  // Before that, only show Q when a spot is mathematically clinched.
  const qualifiedIds = hasPlayoffs
    ? tournament?.playoffGenerated
      ? new Set(standings.slice(0, qualifyCount).map((r) => (r.team._id ?? r.team).toString()))
      : computeQualifiedIds(standings, scheduledGroupFixtures, qualifyCount)
    : new Set();

  return (
    <div>
      {/* Header bar */}
      <div className="standings-header">
        <div className="standings-title">Points Table</div>
        {hasPlayoffs && (
          <div className="standings-qualify-pill">
            Top {qualifyCount} qualify
            {qualifiedIds.size > 0 && <span className="standings-qualify-count">{qualifiedIds.size} confirmed</span>}
          </div>
        )}
      </div>

      <div className="standings-table-wrap">
        <table className="standings-table">
          <thead>
            <tr>
              <th className="col-pos">#</th>
              <th className="col-team">Team</th>
              <th title="Matches played">M</th>
              <th title="Wins" className="col-won-h">W</th>
              <th title="Losses" className="col-lost-h">L</th>
              <th title="Ties">T</th>
              <th className="col-pts" title="Points">Pts</th>
              <th title="Net Run Rate">NRR</th>
              <th title="Runs scored" className="col-runs-h">RS</th>
              <th title="Runs conceded" className="col-runs-h">RC</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row, idx) => {
              const teamId         = (row.team._id ?? row.team).toString();
              const isQual         = qualifiedIds.has(teamId);
              const inTopN         = idx < qualifyCount;
              const isCutoff       = inTopN && idx === qualifyCount - 1;
              const rankPos        = idx + 1;
              const rowClass       = [
                inTopN ? 'qualifier-row' : 'non-qualifier-row',
                isCutoff ? 'qualifier-cutoff' : '',
              ].filter(Boolean).join(' ');

              return (
                <tr key={row.team._id} className={rowClass}>
                  <td className="col-pos">
                    <span className={`position-indicator pos-${Math.min(rankPos, 5)}`}>{rankPos}</span>
                  </td>
                  <td className="col-team">
                    <div className="standings-team-cell">
                      <div className="standings-avatar" style={teamAvatarStyle(row.team.name)}>🏏</div>
                      <div className="standings-team-info">
                        <span className="standings-team-name">{row.team.name}</span>
                        {isQual && <span className="qualify-badge">Q</span>}
                      </div>
                    </div>
                  </td>
                  <td>{row.played}</td>
                  <td className="col-won">{row.won}</td>
                  <td className="col-lost">{row.lost}</td>
                  <td className="col-tied">{row.tied}</td>
                  <td className="col-pts">
                    <span className="pts-badge">{row.points}</span>
                  </td>
                  <td className={`col-nrr ${row.nrr >= 0 ? 'positive' : 'negative'}`}>
                    <span className="nrr-arrow">{row.nrr >= 0 ? '▲' : '▼'}</span>
                    {Math.abs(row.nrr).toFixed(3)}
                  </td>
                  <td className="col-runs">{row.runsScored}</td>
                  <td className="col-runs">{row.runsConceded}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasPlayoffs && !tournament?.playoffGenerated && standings.length >= qualifyCount && (
        <p className="qualifier-note" style={{ marginTop: '0.75rem' }}>
          ✦ Top {qualifyCount} teams qualify for playoffs.
          {qualifiedIds.size > 0 && ' Q = mathematically confirmed.'}
        </p>
      )}
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

  const totalMatches     = fixtures.length;
  const completedMatches = fixtures.filter((f) => f.status === 'completed').length;
  const allPlayed        = totalMatches > 0 && completedMatches === totalMatches;
  const statusLabel      = allPlayed ? 'Completed' : totalMatches > 0 ? 'Ongoing' : STATUS_LABEL[tournament.status];
  const statusClass      = allPlayed ? 'badge-completed' : totalMatches > 0 ? 'badge-active' : STATUS_CLASS[tournament.status];

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
          <span className={`badge ${statusClass}`}>{statusLabel}</span>
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
              teamsCount={teams.length}
              onPlayoffsGenerated={handlePlayoffsGenerated}
            />
          )}
          {activeTab === 'standings' && (
            <StandingsTab
              standings={standings} tournament={tournament} loading={standingsLoading}
              fixtures={fixtures} teamsCount={teams.length}
            />
          )}
          {activeTab === 'highlights' && (
            <HighlightsTab tournamentId={id} />
          )}
        </div>
      </div>
    </div>
  );
}
