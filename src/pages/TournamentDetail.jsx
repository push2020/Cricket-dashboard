import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import TeamAvatar from '../components/TeamAvatar';
import {
  getTournament,
  getTeams,
  getFixtures,
  getStandings,
  getPoolStandings,
  getSeriesResult,
  getTournamentStats,
  createTeam,
  deleteTeam,
  generateFixtures,
  generatePlayoffs,
  getTeamSuggestions,
} from '../api';

const STATUS_LABEL = { upcoming: 'Upcoming', active: 'Active', completed: 'Completed' };
const STATUS_CLASS = { upcoming: 'badge-upcoming', active: 'badge-active', completed: 'badge-completed' };

const RANK_MEDAL = ['🥇', '🥈', '🥉', '4️⃣'];
const RANK_CLASS = ['rank-1', 'rank-2', 'rank-3', 'rank-4'];

/** Country flags for cricket team assignments */
const CRICKET_FLAGS = {
  'India':        '🇮🇳',
  'Australia':    '🇦🇺',
  'England':      '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'South Africa': '🇿🇦',
  'New Zealand':  '🇳🇿',
};

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

/** Derives a stable hue (0–359) from a team name — used for bracket colour dots */
function nameToHue(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h) + name.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) % 360;
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

/** Round group header showing round number, match count, and completion progress */
function RoundHeader({ round, total, done, isBilateral, seriesTotal }) {
  const allDone = done === total && total > 0;
  const label   = isBilateral ? `Match ${round} of ${seriesTotal}` : `Round ${round}`;
  return (
    <div className="round-header">
      <span className="round-label">{label}</span>
      <span className="round-progress">
        <span className={`round-progress-bar${allDone ? ' complete' : ''}`} style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }} />
      </span>
      <span className="round-count">{done}/{total}</span>
    </div>
  );
}

/**
 * Fixture card — horizontal scorecard layout.
 * Home team left · score/VS centre · away team right · action far right.
 * Result note appears as a footer strip only when the match is done.
 */
function FixtureCard({ f, isPlayoff, animIdx = 0 }) {
  const navigate = useNavigate();
  const isTbd   = !f.homeTeam || !f.awayTeam;
  const isDone  = f.status === 'completed';
  const isAband = f.status === 'abandoned';

  const homeWon = isDone && !!f.winner && f.winner?._id === f.homeTeam?._id;
  const awayWon = isDone && !isTbd && !!f.winner && f.winner?._id === f.awayTeam?._id;

  const matchPath = f.type === 'final' ? `/final/${f._id}` : `/match/${f._id}`;
  const homeName  = f.homeTeam?.name ?? 'TBD';
  const awayName  = f.awayTeam?.name ?? 'TBD';

  return (
    <div
      className={`fc${isDone ? ' fc-done' : ''}${isAband ? ' fc-abandoned' : ''}${isPlayoff ? ' fc-playoff' : ''}`}
      style={{ animationDelay: `${animIdx * 0.07}s` }}
    >
      <div className="fc-row">
        {/* ── Teams area: 3-col grid gives each team exactly 50% ── */}
        <div className="fc-teams">
          {/* Home: avatar → W → name + cricket team tag */}
          <div className={`fc-side fc-home${homeWon ? ' fc-won' : ''}`}>
            <TeamAvatar name={f.homeTeam ? homeName : 'TBD'} size={36} />
            {homeWon && <span className="fc-w-pill">W</span>}
            <div className="fc-player-info">
              <span className="fc-name">{homeName}</span>
              {f.homeTeamAssignment && (
                <span className="fc-cricket-tag">
                  {CRICKET_FLAGS[f.homeTeamAssignment]} {f.homeTeamAssignment}
                </span>
              )}
            </div>
          </div>

          {/* Centre: VS pill or scores */}
          <div className="fc-centre">
            {isDone ? (
              <div className="fc-score-block">
                <span className={`fc-sc${homeWon ? ' fc-sc-win' : ''}`}>
                  {f.homeInnings?.runs}<sup className="fc-wk">/{f.homeInnings?.wickets}</sup>
                </span>
                <span className="fc-dash">–</span>
                <span className={`fc-sc${awayWon ? ' fc-sc-win' : ''}`}>
                  {f.awayInnings?.runs}<sup className="fc-wk">/{f.awayInnings?.wickets}</sup>
                </span>
              </div>
            ) : (
              <span className="fc-vs-pill">VS</span>
            )}
          </div>

          {/* Away: avatar far-right via row-reverse */}
          <div className={`fc-side fc-away${awayWon ? ' fc-won' : ''}`}>
            <TeamAvatar name={f.awayTeam ? awayName : 'TBD'} size={36} />
            {awayWon && <span className="fc-w-pill">W</span>}
            <div className="fc-player-info fc-player-info-away">
              <span className="fc-name">{awayName}</span>
              {f.awayTeamAssignment && (
                <span className="fc-cricket-tag">
                  {CRICKET_FLAGS[f.awayTeamAssignment]} {f.awayTeamAssignment}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Action — always at right edge, outside team grid ── */}
        <div className="fc-action">
          {f.status === 'scheduled' && !isTbd && (
            <button className="btn btn-primary btn-sm fc-cta" onClick={() => navigate(matchPath)}>
              Enter Result
            </button>
          )}
          {isDone && (
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(matchPath)}>Edit</button>
          )}
          {f.status === 'scheduled' && isTbd && (
            <span className="tbd-label">{tbdLabel(f.type)}</span>
          )}
        </div>
      </div>

      {/* Result / abandon strip */}
      {(isDone && f.resultNote) || isAband ? (
        <div className="fc-result-strip">
          {isAband ? 'Match abandoned' : f.resultNote}
        </div>
      ) : null}
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
    return <TeamAvatar name={name} size={22} style={{ flexShrink: 0 }} />;
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
          {/* Q1 slot — note below card explains the direct-to-Final path */}
          <div className="bkt-r1-q1-slot">
            <BracketMatchCard
              title="Qualifier 1"
              team1={q1?.homeTeam}    team2={q1?.awayTeam}
              winnerId={q1?.winner?._id}
              isDone={q1?.status === 'completed'}
            />
            <div className="bkt-q1-direct-note">Winner → Final directly</div>
          </div>
          <div className="bkt-r1-gap" />
          <BracketMatchCard
            title="Eliminator"
            team1={ef?.homeTeam}    team2={ef?.awayTeam}
            winnerId={ef?.winner?._id}
            isDone={ef?.status === 'completed'}
          />
        </div>

        {/* ── Bracket arms: R1 loser + Elim winner → Q2 ── */}
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

        {/* ── Arrow: Q2 winner → Final ── */}
        <div className="bkt-to-final">
          <div className="bkt-to-final-line" />
        </div>

        {/* ── Final — card only, aligned with Q2 by shared centering ── */}
        <div className="bkt-final-col">
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
  const [newName,       setNewName]       = useState('');
  const [adding,        setAdding]        = useState(false);
  const [error,         setError]         = useState('');
  const [suggestions,   setSuggestions]   = useState([]);
  const [sugLoading,    setSugLoading]    = useState(false);
  const locked = tournament.fixturesGenerated;

  /** Load past team names every time the tab mounts (or unlocks) */
  useEffect(() => {
    if (locked) return;
    setSugLoading(true);
    getTeamSuggestions()
      .then(({ data }) => setSuggestions(Array.isArray(data) ? data : []))
      .catch(() => setSuggestions([]))
      .finally(() => setSugLoading(false));
  }, [locked, tournament._id]);

  /** Names already added to this tournament (case-insensitive set) */
  const addedNames = new Set(teams.map((t) => t.name.toLowerCase()));

  /** Past names not yet added to this tournament */
  const available = suggestions.filter((n) => !addedNames.has(n.toLowerCase()));

  async function addTeam(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError('');
    try {
      setAdding(true);
      const { data } = await createTeam({ name: trimmed, tournamentId: tournament._id });
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
      {/* Header */}
      <div className="teams-header">
        <div className="teams-header-left">
          <span className="teams-count-badge">{teams.length}</span>
          <span className="teams-header-label">{teams.length === 1 ? 'Team' : 'Teams'}</span>
        </div>
        {locked
          ? <span className="teams-locked-pill">🔒 Locked</span>
          : tournament.format === 'bilateral' && (
              <span className="bilateral-series-hint">
                {teams.length === 0 ? 'Add 2 players to begin' :
                 teams.length === 1 ? '⏳ Add 1 more player — series starts automatically' :
                 '⚡ Generating matches…'}
              </span>
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
          {teams.map((team, idx) => (
            <div
              key={team._id}
              className={`team-row${locked ? ' team-row-locked' : ''}`}
              style={{ animationDelay: `${idx * 0.04}s` }}
            >
              <span className="team-seq">#{idx + 1}</span>
              <TeamAvatar name={team.name} size={40} />
              <span className="team-name-text">{team.name}</span>
              {!locked ? (
                <button
                  className="team-remove-btn"
                  onClick={() => handleDelete(team._id)}
                  aria-label={`Remove ${team.name}`}
                  title="Remove team"
                >✕</button>
              ) : (
                <span className="team-lock-icon" title="Locked">🔒</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add form + suggestions */}
      {!locked && (
        <div className="add-team-card">
          {error && <div className="error-banner" style={{ marginBottom: '1rem' }}>{error}</div>}
          <form className="add-team-form" onSubmit={(e) => { e.preventDefault(); addTeam(newName); }}>
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

          {/* Previously used team chips */}
          {sugLoading && (
            <div className="team-suggestions">
              <div className="team-suggestions-label" style={{ opacity: 0.5 }}>
                Loading previous teams…
              </div>
            </div>
          )}
          {!sugLoading && available.length > 0 && (
            <div className="team-suggestions">
              <div className="team-suggestions-label">Previously used — tap to add</div>
              <div className="team-suggestions-chips">
                {available.map((name) => (
                  <button
                    key={name}
                    className="team-suggestion-chip"
                    onClick={() => addTeam(name)}
                    disabled={adding}
                    type="button"
                  >
                    <TeamAvatar name={name} size={22} />
                    <span>{name}</span>
                    <span className="chip-plus">+</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Renders the Group Stage / Matches tab */
function FixturesTab({ tournament, fixtures, teams, onFixturesGenerated }) {
  const [generating, setGenerating] = useState(false);
  const [error,      setError]      = useState('');

  const groupFixtures  = fixtures.filter((f) => (f.type ?? 'group') === 'group');
  const isPool         = tournament.format === 'pool';
  const isBilateral    = tournament.format === 'bilateral';
  const canPool        = teams.length >= 6;
  const seriesTotal    = tournament.numberOfMatches ?? 1;

  async function handleGenerate(format = 'standard') {
    setError('');
    try {
      setGenerating(true);
      await generateFixtures(tournament._id, format);
      await onFixturesGenerated();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate fixtures.');
    } finally {
      setGenerating(false);
    }
  }

  /* ── Pool format: render Pool A then Pool B sections ── */
  if (isPool && groupFixtures.length > 0) {
    const poolA = groupFixtures.filter((f) => f.pool === 'A');
    const poolB = groupFixtures.filter((f) => f.pool === 'B');
    return (
      <div>
        {[{ label: 'Pool A', fixtures: poolA, cls: 'pool-a-header' }, { label: 'Pool B', fixtures: poolB, cls: 'pool-b-header' }].map(({ label, fixtures: pf, cls }) => (
          <div key={label} className="pool-section">
            <div className={`pool-section-header ${cls}`} style={{ marginBottom: '1rem' }}>{label}</div>
            {Object.keys(groupByRound(pf)).map(Number).sort((a, b) => a - b).map((round) => {
              const rFixtures = groupByRound(pf)[round];
              const done = rFixtures.filter(f => f.status === 'completed').length;
              return (
                <div key={round} className="round-group">
                  <RoundHeader round={round} total={rFixtures.length} done={done} isBilateral={isBilateral} seriesTotal={seriesTotal} />
                  <div className="fixtures-list">
                    {rFixtures.map((f, i) => <FixtureCard key={f._id} f={f} isPlayoff={false} animIdx={i} />)}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  /* ── Standard: generate choice or round display ── */
  const rounds = groupByRound(groupFixtures);
  return (
    <div>
      {!tournament.fixturesGenerated && (
        <div style={{ marginBottom: '1.5rem' }}>
          {error && <div className="error-banner">{error}</div>}
          {isBilateral ? (
            /* Bilateral: matches auto-generate when 2nd player is added — just show a waiting hint */
            <div className="empty-state" style={{ padding: '3rem 1rem' }}>
              <span className="empty-state-icon">⏳</span>
              <div className="empty-state-title">Waiting for both players</div>
              <div className="empty-state-desc">
                Add both players in the Teams tab — matches will start automatically.
              </div>
            </div>
          ) : canPool ? (
            /* ≥ 6 teams: offer format choice */
            <div className="format-choice-wrap">
              <p className="format-choice-title">Choose fixture format for {teams.length} teams</p>
              <div className="format-choice-cards">
                <div className="format-choice-card">
                  <div className="format-choice-icon">🔄</div>
                  <div className="format-choice-name">Round Robin</div>
                  <div className="format-choice-desc">
                    Every team plays {teams.length - 1} matches.
                    Total: {(teams.length * (teams.length - 1)) / 2} matches.
                  </div>
                  <button className="btn btn-primary" onClick={() => handleGenerate('standard')} disabled={generating}>
                    {generating ? 'Generating…' : 'Use Round Robin'}
                  </button>
                </div>
                <div className="format-choice-card format-choice-card-pool">
                  <div className="format-choice-icon">🏆</div>
                  <div className="format-choice-name">Pool Format</div>
                  <div className="format-choice-desc">
                    2 pools of {Math.ceil(teams.length / 2)}/{Math.floor(teams.length / 2)}.
                    Double round-robin within pool.
                    Top 2 per pool qualify (IPL playoffs).
                  </div>
                  <button className="btn btn-gold" onClick={() => handleGenerate('pool')} disabled={generating}>
                    {generating ? 'Generating…' : 'Use Pool Format'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* < 6 teams standard */
            <div className="card" style={{ background: 'var(--bg-secondary)', borderStyle: 'dashed' }}>
              <div className="card-body" style={{ textAlign: 'center', padding: '2.5rem' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📋</div>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                  {teams.length < 2
                    ? `Add at least 2 teams to generate fixtures (${teams.length} added)`
                    : `Ready to generate ${(teams.length * (teams.length - 1)) / 2} matches across ${teams.length} teams`}
                </p>
                <button
                  className="btn btn-primary btn-lg"
                  onClick={() => handleGenerate('standard')}
                  disabled={generating || teams.length < 2}
                >
                  {generating ? 'Generating…' : 'Generate Round-Robin Fixtures'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {groupFixtures.length === 0 && tournament.fixturesGenerated && (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-title">No fixtures found</div>
        </div>
      )}

      {Object.keys(rounds).map(Number).sort((a, b) => a - b).map((round) => {
        const rFixtures = rounds[round];
        const done = rFixtures.filter(f => f.status === 'completed').length;
        return (
          <div key={round} className="round-group">
            <RoundHeader round={round} total={rFixtures.length} done={done} isBilateral={isBilateral} seriesTotal={seriesTotal} />
            <div className="fixtures-list">
              {rFixtures.map((f, i) => <FixtureCard key={f._id} f={f} isPlayoff={false} animIdx={i} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Playoffs tab — shown only when playoffGenerated is true.
 * Shows qualifier cards, bracket, then actual match entries.
 */
function PlayoffsTab({ tournament, fixtures, standings, poolStandings, teamsCount, onPlayoffsGenerated }) {
  const [generatingPlayoffs, setGeneratingPlayoffs] = useState(false);
  const [error, setError] = useState('');

  const groupFixtures      = fixtures.filter((f) => (f.type ?? 'group') === 'group');
  const qualifier1Fixture  = fixtures.find((f) => f.type === 'qualifier1')  ?? null;
  const eliminatorFixture  = fixtures.find((f) => f.type === 'eliminator')  ?? null;
  const qualifier2Fixture  = fixtures.find((f) => f.type === 'qualifier2')  ?? null;
  const finalFixture       = fixtures.find((f) => f.type === 'final')       ?? null;

  const isPool     = tournament.format === 'pool';
  const isIpl      = !isPool && teamsCount >= 4;
  const isDirect   = !isPool && teamsCount === 3;
  const qualifyCount = isPool ? 4 : isIpl ? 4 : isDirect ? 2 : 0;

  const allGroupDone = groupFixtures.length > 0 && groupFixtures.every(
    (f) => f.status === 'completed' || f.status === 'abandoned'
  );

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

  /** Renders qualifier cards for pool format (Pool A top 2 + Pool B top 2) */
  function PoolQualifierCards({ label }) {
    if (!poolStandings) return null;
    const poolATop2 = (poolStandings.poolA ?? []).slice(0, 2);
    const poolBTop2 = (poolStandings.poolB ?? []).slice(0, 2);
    return (
      <div style={{ marginBottom: '2rem' }}>
        <div className="playoff-section-label" style={{ marginBottom: '1.25rem' }}>🏆 {label}</div>
        <div className="pool-qualifiers-grid">
          <div>
            <div className="pool-section-header pool-a-header" style={{ marginBottom: '0.75rem' }}>Pool A — Top 2</div>
            <div className="qualifiers-section" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
              {poolATop2.map((row, idx) => (
                <div key={row.team._id} className={`qualifier-card ${RANK_CLASS[idx]}`}>
                  <span className="qualifier-medal">{RANK_MEDAL[idx]}</span>
                  <div className="qualifier-rank">A{idx + 1}</div>
                  <div className="qualifier-name">{row.team.name}</div>
                  <div className="qualifier-stats">{row.points} pts · NRR {formatNrr(row.nrr)}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="pool-section-header pool-b-header" style={{ marginBottom: '0.75rem' }}>Pool B — Top 2</div>
            <div className="qualifiers-section" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
              {poolBTop2.map((row, idx) => (
                <div key={row.team._id} className={`qualifier-card ${RANK_CLASS[idx]}`}>
                  <span className="qualifier-medal">{RANK_MEDAL[idx]}</span>
                  <div className="qualifier-rank">B{idx + 1}</div>
                  <div className="qualifier-name">{row.team.name}</div>
                  <div className="qualifier-stats">{row.points} pts · NRR {formatNrr(row.nrr)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
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
        {allGroupDone && (
          <div>
            {isPool ? <PoolQualifierCards label="Qualifiers" /> : (
              standings.length >= qualifyCount && (
                <div style={{ marginBottom: '2rem' }}>
                  <div className="playoff-section-label" style={{ marginBottom: '1.25rem' }}>🏆 Qualifiers</div>
                  <div className="qualifiers-section">
                    {standings.slice(0, qualifyCount).map((row, idx) => (
                      <div key={row.team._id} className={`qualifier-card ${RANK_CLASS[idx]}`} style={{ animationDelay: `${idx * 0.1}s` }}>
                        <span className="qualifier-medal">{RANK_MEDAL[idx]}</span>
                        <div className="qualifier-rank">
                          {isIpl ? ['1st — Q1', '2nd — Q1', '3rd — Elim', '4th — Elim'][idx] : ['1st — Final', '2nd — Final'][idx]}
                        </div>
                        <div className="qualifier-name">{row.team.name}</div>
                        <div className="qualifier-stats">{row.points} pts · NRR {formatNrr(row.nrr)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
            <div className="card" style={{ background: 'var(--bg-secondary)', borderStyle: 'dashed', borderColor: 'rgba(245,158,11,0.4)' }}>
              <div className="card-body" style={{ textAlign: 'center', padding: '2.5rem' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🏟️</div>
                <p style={{ color: 'var(--color-gold)', fontWeight: 700, marginBottom: '0.5rem', fontSize: '1.05rem' }}>Group Stage Complete!</p>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.92rem' }}>
                  {isPool
                    ? 'Top 2 from each pool qualify. Q1: A1 vs B1 · Eliminator: A2 vs B2 · Q2 · Final.'
                    : isDirect ? 'Top 2 qualify — direct Final.'
                    : 'Top 4 qualify. Q1: 1st vs 2nd · Eliminator: 3rd vs 4th · Q2 · Final.'}
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
  /* Playoffs generated — show qualifiers, bracket, and match cards */
  return (
    <div>
      {/* Qualifier cards */}
      {isPool
        ? <PoolQualifierCards label="Qualified Teams" />
        : standings.length >= qualifyCount && (
          <div style={{ marginBottom: '2rem' }}>
            <div className="playoff-section-label" style={{ marginBottom: '1.25rem' }}>🏆 Qualifiers</div>
            <div className="qualifiers-section">
              {standings.slice(0, qualifyCount).map((row, idx) => (
                <div key={row.team._id} className={`qualifier-card ${RANK_CLASS[idx]}`} style={{ animationDelay: `${idx * 0.1}s` }}>
                  <span className="qualifier-medal">{RANK_MEDAL[idx]}</span>
                  <div className="qualifier-rank">
                    {isIpl ? ['1st', '2nd', '3rd', '4th'][idx] + ' Place' : ['1st', '2nd'][idx] + ' Place'}
                  </div>
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

      {/* Match cards — IPL / pool format */}
      {(isIpl || isPool) && (
        <>
          {qualifier1Fixture && (
            <div className="round-group" style={{ marginTop: '2rem' }}>
              <div className="round-label playoff-round-label">
                {isPool ? 'Qualifier 1 · Pool A 1st vs Pool B 1st' : 'Qualifier 1 · 1st vs 2nd'}
              </div>
              <div className="fixtures-list"><FixtureCard f={qualifier1Fixture} isPlayoff /></div>
            </div>
          )}
          {eliminatorFixture && (
            <div className="round-group" style={{ marginTop: '1.5rem' }}>
              <div className="round-label playoff-round-label">
                {isPool ? 'Eliminator · Pool A 2nd vs Pool B 2nd' : 'Eliminator · 3rd vs 4th'}
              </div>
              <div className="fixtures-list"><FixtureCard f={eliminatorFixture} isPlayoff /></div>
            </div>
          )}
          {qualifier2Fixture && (
            <div className="round-group" style={{ marginTop: '1.5rem' }}>
              <div className="round-label playoff-round-label">Qualifier 2 · Q1 Loser vs Eliminator Winner</div>
              <div className="fixtures-list"><FixtureCard f={qualifier2Fixture} isPlayoff /></div>
            </div>
          )}
          {finalFixture && (
            <div className="round-group" style={{ marginTop: '1.5rem' }}>
              <div className="round-label playoff-round-label">Final · Q1 Winner vs Q2 Winner</div>
              <div className="fixtures-list"><FixtureCard f={finalFixture} isPlayoff /></div>
            </div>
          )}
        </>
      )}

      {/* Match cards — Direct Final (3 teams) */}
      {isDirect && finalFixture && (
        <div className="round-group" style={{ marginTop: '2rem' }}>
          <div className="round-label playoff-round-label">Final · 1st vs 2nd</div>
          <div className="fixtures-list"><FixtureCard f={finalFixture} isPlayoff /></div>
        </div>
      )}
    </div>
  );
}

/** Mini standings table shared by pool A / pool B display */
function PoolStandingsTable({ rows, qualifyCount, scheduledFixtures = [] }) {
  // Use mathematical qualification — not just position
  const qualifiedIds = computeQualifiedIds(rows, scheduledFixtures, qualifyCount);

  return (
    <div className="standings-table-wrap">
      <table className="standings-table">
        <thead>
          <tr>
            <th>#</th><th>Team</th><th>P</th><th>W</th><th>L</th>
            <th className="col-pts">Pts</th><th>NRR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const teamId = (row.team._id ?? row.team).toString();
            const isQual = qualifiedIds.has(teamId);
            return (
            <tr key={row.team._id} className={isQual ? 'qualifier-row' : ''}>
              <td className="col-pos">
                <span className={`position-indicator${isQual ? ' top' : ''}`}>{idx + 1}</span>
              </td>
              <td className="col-team">
                {row.team.name}
                {isQual && <span className="qualify-badge">Q</span>}
              </td>
              <td>{row.played}</td><td>{row.won}</td><td>{row.lost}</td>
              <td className="col-pts">{row.points}</td>
              <td className={`col-nrr ${row.nrr >= 0 ? 'positive' : 'negative'}`}>{formatNrr(row.nrr)}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Renders the Standings tab with live Q (qualified) badges */
function StandingsTab({ standings, tournament, fixtures, teamsCount, poolStandings, loading }) {
  if (loading) {
    return <div className="loading-wrap"><div className="spinner" />Calculating standings…</div>;
  }

  const isPool = tournament?.format === 'pool';

  // Pool format: show two separate tables.
  // This check MUST come before the standings.length === 0 guard because
  // standings is always [] for pool format (only poolStandings is populated).
  if (isPool && poolStandings) {
    return (
      <div>
        <p className="qualifier-note" style={{ marginBottom: '1.5rem' }}>
          Top 2 from each pool qualify for playoffs (IPL format).
        </p>
        <div className="pool-standings-grid">
          <div>
            <div className="pool-section-header pool-a-header" style={{ marginBottom: '0.75rem' }}>Pool A</div>
            <PoolStandingsTable
              rows={poolStandings.poolA ?? []}
              qualifyCount={2}
              scheduledFixtures={fixtures?.filter(f => f.status === 'scheduled' && f.pool === 'A') ?? []}
            />
          </div>
          <div>
            <div className="pool-section-header pool-b-header" style={{ marginBottom: '0.75rem' }}>Pool B</div>
            <PoolStandingsTable
              rows={poolStandings.poolB ?? []}
              qualifyCount={2}
              scheduledFixtures={fixtures?.filter(f => f.status === 'scheduled' && f.pool === 'B') ?? []}
            />
          </div>
        </div>
      </div>
    );
  }

  // Non-pool: show empty state if no group matches played yet
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
  // Always use mathematical qualification — never show Q based on position alone.
  // When all group matches are done, computeQualifiedIds still returns the correct
  // set because remaining = 0 for everyone and the points comparison holds.
  const qualifiedIds = hasPlayoffs
    ? computeQualifiedIds(standings, scheduledGroupFixtures, qualifyCount)
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
                      <TeamAvatar name={row.team.name} size={28} />
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

/** Three quick-number counters at the top of the Highlights tab */
function SummaryStrip({ summary }) {
  if (!summary) return null;
  const items = [
    { icon: '🏏', value: summary.completed, label: 'Matches Played' },
    { icon: '💥', value: summary.totalRuns.toLocaleString(), label: 'Total Runs' },
    { icon: '📊', value: summary.avgScore,  label: 'Avg Score / Innings' },
  ];
  return (
    <div className="summary-strip">
      {items.map(({ icon, value, label }) => (
        <div key={label} className="summary-strip-item">
          <span className="summary-strip-icon">{icon}</span>
          <span className="summary-strip-val">{value}</span>
          <span className="summary-strip-label">{label}</span>
        </div>
      ))}
    </div>
  );
}

/** Horizontal bar showing batting-first vs chasing win rate */
function BatFirstBar({ batFirst }) {
  if (!batFirst || batFirst.total === 0) return null;
  const pct      = Math.round((batFirst.wins / batFirst.total) * 100);
  const chasePct = 100 - pct;
  return (
    <div className="bat-first-bar">
      <div className="bat-first-title">Batting First vs Chasing</div>
      <div className="bat-first-track">
        <div className="bat-first-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="bat-first-labels">
        <span className="bat-first-bat">🏏 Bat first wins: {batFirst.wins}/{batFirst.total} ({pct}%)</span>
        <span className="bat-first-chase">Chase wins: {batFirst.total - batFirst.wins}/{batFirst.total} ({chasePct}%)</span>
      </div>
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

  const {
    biggestWin, highestScore, winStreaks,
    closestMatch, lowestScore, unbeaten, tossLuck, batFirst, summary,
  } = stats ?? {};

  return (
    <div>
      {/* Quick numbers strip */}
      <SummaryStrip summary={summary} />

      {/* Stat cards grid */}
      <div className="stat-cards-grid">
        {/* ── existing ── */}
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

        {/* ── new ── */}
        <StatCard
          icon="⚡"
          label="Closest Match"
          value={closestMatch ? `Won by ${closestMatch.margin} run${closestMatch.margin !== 1 ? 's' : ''}` : null}
          sub={closestMatch ? `${closestMatch.winnerName} beat ${closestMatch.loserName}` : null}
        />
        <StatCard
          icon="📉"
          label="Lowest Score"
          value={lowestScore ? `${lowestScore.runs}/${lowestScore.wickets}` : null}
          sub={lowestScore ? `${lowestScore.teamName} vs ${lowestScore.againstName}` : null}
        />
        <StatCard
          icon="🛡️"
          label="Unbeaten"
          value={unbeaten ? unbeaten.teamName : null}
          sub={unbeaten ? `${unbeaten.wins}W · 0L` : null}
        />
        <StatCard
          icon="🎲"
          label="Toss Luck"
          value={tossLuck ? tossLuck.teamName : null}
          sub={tossLuck ? `Won ${tossLuck.count} of ${tossLuck.total} tosses` : null}
        />
      </div>

      {/* Bat first vs chase bar */}
      <BatFirstBar batFirst={batFirst} />
    </div>
  );
}

/**
 * Series tab — shown for bilateral format tournaments.
 * Displays a live head-to-head score, match-by-match results, and series status.
 */
function SeriesTab({ tournamentId, fixtures, tournament }) {
  const [series,  setSeries]  = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSeriesResult(tournamentId)
      .then(({ data }) => setSeries(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tournamentId]);

  if (loading) return <div className="loading-wrap"><div className="spinner" />Loading series…</div>;
  if (!series)  return <div className="empty-state"><span className="empty-state-icon">🏏</span><div className="empty-state-title">No series data yet</div></div>;

  const { teamA, teamB, played, total, decided, winner, tied } = series;
  const statusText = (() => {
    if (decided && winner)   return `${winner.name} wins the series ${Math.max(teamA.wins, teamB.wins)}–${Math.min(teamA.wins, teamB.wins)}!`;
    if (decided && !winner)  return `Series tied ${teamA.wins}–${teamB.wins}`;
    if (teamA.wins === teamB.wins && played > 0) return `Series tied ${teamA.wins}–${teamA.wins}`;
    if (teamA.wins > teamB.wins) return `${teamA.name} leads ${teamA.wins}–${teamB.wins}`;
    if (teamB.wins > teamA.wins) return `${teamB.name} leads ${teamB.wins}–${teamA.wins}`;
    return `Series level — ${total - played} match${total - played !== 1 ? 'es' : ''} to go`;
  })();

  const completed = fixtures.filter((f) => f.status === 'completed' && f.type === 'group');
  const remaining = total - played;

  return (
    <div>
      {/* Big score card */}
      <div className="series-score-card">
        <div className="series-player">
          <TeamAvatar name={teamA.name} size={52} style={{ margin: '0 auto 0.5rem' }} />
          <div className="series-player-name">{teamA.name}</div>
          <div className={`series-big-score${teamA.wins > teamB.wins ? ' series-score-leading' : ''}`}>
            {teamA.wins}
          </div>
        </div>
        <div className="series-divider">
          <div className="series-vs">vs</div>
          <div className="series-played">{played}/{total} played</div>
        </div>
        <div className="series-player">
          <TeamAvatar name={teamB.name} size={52} style={{ margin: '0 auto 0.5rem' }} />
          <div className="series-player-name">{teamB.name}</div>
          <div className={`series-big-score${teamB.wins > teamA.wins ? ' series-score-leading' : ''}`}>
            {teamB.wins}
          </div>
        </div>
      </div>

      {/* Status */}
      <div className={`series-status${decided ? ' series-status-decided' : ''}`}>
        {decided && winner ? '🏆 ' : ''}{statusText}
        {remaining > 0 && !decided && <span className="series-remaining"> · {remaining} left</span>}
      </div>

      {/* Match-by-match log */}
      {completed.length > 0 && (
        <div className="series-match-log">
          <div className="series-log-label">Match Results</div>
          {completed.map((f, idx) => {
            const winnerId = f.winner?._id?.toString() ?? f.winner?.toString();
            const winnerName = winnerId === f.homeTeam?._id?.toString()
              ? f.homeTeam?.name
              : f.awayTeam?.name;
            return (
              <div key={f._id} className="series-log-row">
                <span className="series-log-num">Match {idx + 1}</span>
                <span className="series-log-result">
                  {f.resultNote || (winnerName ? `${winnerName} won` : 'No result')}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Floating star particle — purely decorative */
const CHAMP_STARS = Array.from({ length: 14 }, (_, i) => ({
  icon:  ['⭐','🌟','✨','💫'][i % 4],
  left:  `${6 + i * 6.5}%`,
  top:   `${8 + (i % 5) * 18}%`,
  size:  `${0.75 + (i % 3) * 0.35}rem`,
  dur:   `${2.2 + (i % 4) * 0.6}s`,
  delay: `${(i * 0.28).toFixed(2)}s`,
}));

/**
 * Champion showcase tab — shown once the tournament is completed.
 * Features animated trophy, floating stars, gold name gradient, stats row,
 * and a shortcut to the full celebration page.
 */
function ChampionTab({ tournament, fixtures, standings, poolStandings }) {
  const navigate  = useNavigate();
  const [burst, setBurst] = useState(false);

  const finalFixture = fixtures.find((f) => f.type === 'final' && f.status === 'completed');
  const champion  = finalFixture?.winner;
  const runnerUp  = champion?._id?.toString() === finalFixture?.homeTeam?._id?.toString()
    ? finalFixture?.awayTeam
    : finalFixture?.homeTeam;

  // Combine pool standings or use regular standings for stat lookup
  const allStandings = poolStandings
    ? [...(poolStandings.poolA ?? []), ...(poolStandings.poolB ?? [])]
    : standings;

  const champRow = champion
    ? allStandings.find((row) =>
        (row.team._id ?? row.team).toString() === (champion._id ?? champion).toString()
      )
    : null;

  function handleTrophyClick() {
    setBurst(true);
    setTimeout(() => setBurst(false), 600);
  }

  if (!champion) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon">🏆</span>
        <div className="empty-state-title">Champion not yet decided</div>
        <div className="empty-state-desc">Complete the Final to crown a champion.</div>
      </div>
    );
  }

  const winRate = champRow
    ? Math.round((champRow.won / Math.max(champRow.played, 1)) * 100)
    : null;

  return (
    <div className="champ-tab">
      {/* Floating star particles */}
      <div className="champ-stars-bg" aria-hidden="true">
        {CHAMP_STARS.map((s, i) => (
          <span
            key={i}
            className="champ-star"
            style={{ left: s.left, top: s.top, fontSize: s.size, '--dur': s.dur, '--delay': s.delay }}
          >
            {s.icon}
          </span>
        ))}
      </div>

      {/* Hero */}
      <div className="champ-hero">
        {/* Trophy */}
        <button
          className={`champ-trophy${burst ? ' champ-trophy-burst' : ''}`}
          onClick={handleTrophyClick}
          aria-label="Trophy"
          type="button"
        >
          🏆
        </button>

        {/* Champion badge */}
        <div className="champ-badge-pill">🎉 Tournament Champion 🎉</div>

        {/* Avatar */}
        <TeamAvatar name={champion.name} size={96} style={{ margin: '0 auto 0.75rem', display: 'block' }} />

        {/* Name */}
        <h1 className="champ-team-name">{champion.name}</h1>
        <p className="champ-context">{tournament.name} · {tournament.overs}-over format</p>

        {/* Final result note */}
        {finalFixture?.resultNote && (
          <div className="champ-result-note">{finalFixture.resultNote} in the Final</div>
        )}
      </div>

      {/* Stats row */}
      {champRow && (
        <div className="champ-stats-grid">
          {[
            { val: champRow.won,                         label: 'Wins' },
            { val: `${winRate}%`,                        label: 'Win Rate' },
            { val: champRow.played,                      label: 'Matches' },
            { val: champRow.runsScored.toLocaleString(), label: 'Runs Scored' },
          ].map(({ val, label }) => (
            <div key={label} className="champ-stat">
              <span className="champ-stat-val">{val}</span>
              <span className="champ-stat-label">{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Runner-up */}
      {runnerUp && (
        <div className="champ-runner-up">
          <TeamAvatar name={runnerUp.name} size={28} style={{ flexShrink: 0 }} />
          <span>Runner-up: <strong>{runnerUp.name}</strong></span>
          <span className="champ-runner-badge">🥈</span>
        </div>
      )}

      {/* Actions */}
      <div className="champ-actions">
        <button
          className="btn btn-gold btn-lg"
          onClick={() => navigate(`/celebration/${tournament._id}`)}
        >
          🎉 Full Celebration
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => navigate('/hall-of-fame')}
        >
          🏆 Hall of Fame
        </button>
      </div>
    </div>
  );
}

/** Tournament Detail page */
export default function TournamentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [tournament,       setTournament]       = useState(null);
  const [teams,            setTeams]            = useState([]);
  const [fixtures,         setFixtures]         = useState([]);
  const [standings,        setStandings]        = useState([]);
  const [poolStandings,    setPoolStandings]    = useState(null);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [activeTab,        setActiveTab]        = useState('teams');
  const [autoTabSet,       setAutoTabSet]       = useState(false);
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState('');

  /** Loads tournament, teams, fixtures and standings in one shot */
  const loadData = useCallback(async () => {
    try {
      const [tRes, teRes, fRes] = await Promise.all([
        getTournament(id),
        getTeams(id),
        getFixtures(id),
      ]);
      const t = tRes.data;
      setTournament(t);
      setTeams(teRes.data);
      setFixtures(fRes.data);

      if (t.fixturesGenerated) {
        if (t.format === 'pool') {
          const { data: ps } = await getPoolStandings(id);
          setPoolStandings(ps);
        } else {
          const { data: sData } = await getStandings(id);
          setStandings(sData);
        }
      }
    } catch {
      setError('Failed to load tournament data.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Auto-switch to Champion tab once on first load when tournament is complete
  useEffect(() => {
    if (!autoTabSet && tournament?.status === 'completed') {
      setActiveTab('champion');
      setAutoTabSet(true);
    }
  }, [tournament?.status, autoTabSet]);

  /** Reloads standings when the Standings tab is opened */
  async function loadStandings() {
    setStandingsLoading(true);
    try {
      if (tournament?.format === 'pool') {
        const { data } = await getPoolStandings(id);
        setPoolStandings(data);
      } else {
        const { data } = await getStandings(id);
        setStandings(data);
      }
    } catch {
      setStandings([]);
    } finally {
      setStandingsLoading(false);
    }
  }

  // Re-run loadData on every navigation to this page (location.key changes on each visit).
  // This ensures standings & fixtures are always fresh after editing a match and coming back.
  useEffect(() => { loadData(); }, [loadData, location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === 'standings') loadStandings();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  /** For bilateral series: auto-generate fixtures the moment the 2nd player is added */
  useEffect(() => {
    if (
      tournament?.format === 'bilateral' &&
      teams.length === 2 &&
      !tournament?.fixturesGenerated
    ) {
      generateFixtures(tournament._id, 'bilateral')
        .then(() => loadData())
        .catch(() => {});
    }
  }, [teams.length]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const isBilateral = tournament.format === 'bilateral';

  /* Bilateral series has different tab set — no playoffs, Standings → Series */
  const tabs = isBilateral ? [
    ...(tournament.status === 'completed' ? [{ key: 'champion', label: '🏆 Champion' }] : []),
    { key: 'teams',     label: 'Teams' },
    { key: 'fixtures',  label: 'Matches' },
    { key: 'series',    label: '📊 Series' },
    ...(completedMatches > 0 ? [{ key: 'highlights', label: '⭐ Highlights' }] : []),
  ] : [
    ...(tournament.status === 'completed' ? [{ key: 'champion', label: '🏆 Champion' }] : []),
    { key: 'teams',     label: 'Teams' },
    { key: 'fixtures',  label: 'Group Stage' },
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
              poolStandings={poolStandings} teamsCount={teams.length}
              onPlayoffsGenerated={handlePlayoffsGenerated}
            />
          )}
          {activeTab === 'standings' && (
            <StandingsTab
              standings={standings} tournament={tournament} loading={standingsLoading}
              poolStandings={poolStandings}
              fixtures={fixtures} teamsCount={teams.length}
            />
          )}
          {activeTab === 'highlights' && (
            <HighlightsTab tournamentId={id} />
          )}
          {activeTab === 'series' && (
            <SeriesTab tournamentId={id} fixtures={fixtures} tournament={tournament} />
          )}
          {activeTab === 'champion' && (
            <ChampionTab
              tournament={tournament}
              fixtures={fixtures}
              standings={standings}
              poolStandings={poolStandings}
            />
          )}
        </div>
      </div>
    </div>
  );
}
