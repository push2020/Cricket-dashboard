import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getFixture, enterResult } from '../api';

const INITIAL_INNINGS = { runs: '', wickets: '', overs: '' };

const CRICKET_FLAGS = {
  'India':        '🇮🇳',
  'Australia':    '🇦🇺',
  'England':      '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'South Africa': '🇿🇦',
  'New Zealand':  '🇳🇿',
};

/**
 * Determines which team batted first based on toss information.
 * Returns true if the home team batted first.
 *
 * @param {string} tossWinnerId
 * @param {string} tossDecision  'bat' | 'field'
 * @param {string} homeTeamId
 * @returns {boolean}
 */
function homeTeamBattedFirst(tossWinnerId, tossDecision, homeTeamId) {
  if (!tossWinnerId || !tossDecision) return true; // default: home bats first
  const tossWinnerIsHome = tossWinnerId === homeTeamId;
  return tossDecision === 'bat' ? tossWinnerIsHome : !tossWinnerIsHome;
}

/**
 * Generates a result note based on batting order.
 * firstInnTeam = team that batted first (set the target)
 * secondInnTeam = team that chased
 *
 * @param {object} firstInnTeam
 * @param {object} secondInnTeam
 * @param {object} firstInn  - { runs, wickets }
 * @param {object} secondInn - { runs, wickets }
 * @param {string} winnerId
 * @returns {string}
 */
function buildResultNote(firstInnTeam, secondInnTeam, firstInn, secondInn, winnerId) {
  if (!firstInnTeam || !secondInnTeam || !winnerId) return '';

  const firstRuns  = Number(firstInn.runs);
  const secondRuns = Number(secondInn.runs);
  const secondWickets = Number(secondInn.wickets);

  if (winnerId === firstInnTeam._id) {
    // Set the target and defended it → won by runs
    const margin = firstRuns - secondRuns;
    return `${firstInnTeam.name} won by ${margin} run${margin !== 1 ? 's' : ''}`;
  }
  if (winnerId === secondInnTeam._id) {
    // Chased successfully → won by wickets
    const wicketsLeft = 10 - secondWickets;
    return `${secondInnTeam.name} won by ${wicketsLeft} wicket${wicketsLeft !== 1 ? 's' : ''}`;
  }
  return '';
}

/** Single innings input group — runs, wickets, and actual overs played */
function InningsInput({ label, teamName, value, onChange, maxOvers }) {
  function handleField(field, raw) {
    onChange({ ...value, [field]: raw });
  }
  return (
    <div className="innings-card">
      <div className="innings-header">
        <span>🏏</span>
        <span>{label}: {teamName}</span>
      </div>
      <div className="innings-body">
        <div className="innings-row">
          <div>
            <div className="innings-stat-label">Runs</div>
            <input className="form-input" type="number" min="0" placeholder="0"
              value={value.runs} onChange={(e) => handleField('runs', e.target.value)} />
          </div>
          <div>
            <div className="innings-stat-label">Wickets</div>
            <input className="form-input" type="number" min="0" max="10" placeholder="0"
              value={value.wickets} onChange={(e) => handleField('wickets', e.target.value)} />
          </div>
          <div>
            <div className="innings-stat-label">Overs</div>
            <input className="form-input" type="number" min="0" step="0.1" placeholder={maxOvers ?? '0'}
              value={value.overs} onChange={(e) => handleField('overs', e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Match Entry page */
export default function MatchEntry() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [fixture,     setFixture]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState('');
  const [submitting,  setSubmitting]  = useState(false);

  const [homeInn,      setHomeInn]      = useState(INITIAL_INNINGS);
  const [awayInn,      setAwayInn]      = useState(INITIAL_INNINGS);
  const [winnerId,     setWinnerId]     = useState('');
  const [tossWinnerId, setTossWinnerId] = useState('');
  const [tossDecision, setTossDecision] = useState('bat');
  const [status,       setStatus]       = useState('completed');

  useEffect(() => {
    async function load() {
      try {
        const { data } = await getFixture(id);
        if (data.type === 'final') {
          navigate(`/final/${id}`, { replace: true });
          return;
        }
        setFixture(data);
        if (data.status !== 'scheduled') {
          setHomeInn({ runs: String(data.homeInnings?.runs ?? ''), wickets: String(data.homeInnings?.wickets ?? ''), overs: String(data.homeInnings?.overs ?? '') });
          setAwayInn({ runs: String(data.awayInnings?.runs ?? ''), wickets: String(data.awayInnings?.wickets ?? ''), overs: String(data.awayInnings?.overs ?? '') });
          setWinnerId(data.winner?._id ?? '');
          setTossWinnerId(data.tossWinner?._id ?? '');
          setTossDecision(data.tossDecision ?? 'bat');
          setStatus(data.status);
        }
      } catch {
        setError('Failed to load match details.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) return <div className="container"><div className="loading-wrap"><div className="spinner" />Loading match…</div></div>;
  if (error && !fixture) return (
    <div className="container page">
      <div className="error-banner">{error}</div>
      <button className="btn btn-ghost" onClick={() => navigate(-1)}>← Back</button>
    </div>
  );

  // Teams not yet determined (e.g. Q2 before Q1 and Eliminator are played)
  if (fixture && (!fixture.homeTeam || !fixture.awayTeam)) {
    return (
      <div className="container page">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: '1.5rem' }}>← Back</button>
        <div className="error-banner">Teams for this match haven't been determined yet — complete the preceding playoff matches first.</div>
      </div>
    );
  }

  // ── Derive batting order from toss ──────────────────────────────────────
  const battingFirstIsHome = homeTeamBattedFirst(tossWinnerId, tossDecision, fixture.homeTeam._id);
  const firstInnTeam  = battingFirstIsHome ? fixture.homeTeam : fixture.awayTeam;
  const secondInnTeam = battingFirstIsHome ? fixture.awayTeam : fixture.homeTeam;
  const firstInn      = battingFirstIsHome ? homeInn  : awayInn;
  const secondInn     = battingFirstIsHome ? awayInn  : homeInn;
  const setFirstInn   = battingFirstIsHome ? setHomeInn  : setAwayInn;
  const setSecondInn  = battingFirstIsHome ? setAwayInn  : setHomeInn;

  function handleAutoResult() {
    const first  = Number(firstInn.runs);
    const second = Number(secondInn.runs);
    if (first > second)       setWinnerId(firstInnTeam._id);
    else if (second > first)  setWinnerId(secondInnTeam._id);
    else                      setWinnerId('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (status === 'completed' && (homeInn.runs === '' || awayInn.runs === ''))
      return setError('Please enter runs for both teams.');

    const tournamentOvers = fixture.tournamentId?.overs ?? 0;
    const resultNote = status === 'abandoned'
      ? 'Match abandoned'
      : buildResultNote(firstInnTeam, secondInnTeam, firstInn, secondInn, winnerId);

    // Use actual overs played; fall back to tournament overs when left blank
    const homeOvers = homeInn.overs !== '' ? parseFloat(homeInn.overs) : tournamentOvers;
    const awayOvers = awayInn.overs !== '' ? parseFloat(awayInn.overs) : tournamentOvers;

    try {
      setSubmitting(true);
      await enterResult(id, {
        homeInnings: { runs: Number(homeInn.runs) || 0, wickets: Number(homeInn.wickets) || 0, overs: homeOvers },
        awayInnings: { runs: Number(awayInn.runs) || 0, wickets: Number(awayInn.wickets) || 0, overs: awayOvers },
        winner: status === 'completed' ? winnerId || null : null,
        resultNote,
        tossWinner: tossWinnerId || null,
        tossDecision: tossDecision || null,
        matchDate: null,
        status,
      });
      setSuccess('Result saved successfully!');
      const PLAYOFF_TYPES = ['qualifier1', 'eliminator', 'qualifier2'];
      const returnTab = PLAYOFF_TYPES.includes(fixture.type) ? 'playoffs' : 'fixtures';
      setTimeout(() => navigate(`/tournament/${fixture.tournamentId._id}?tab=${returnTab}`), 1200);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save result.');
    } finally {
      setSubmitting(false);
    }
  }

  const TYPE_LABELS = { qualifier1: 'Qualifier 1', eliminator: 'Eliminator', qualifier2: 'Qualifier 2', final: 'Final' };
  const fixtureTypeLabel = TYPE_LABELS[fixture.type] ?? `Round ${fixture.round}`;
  const autoResultNote   = status === 'completed' ? buildResultNote(firstInnTeam, secondInnTeam, firstInn, secondInn, winnerId) : '';

  return (
    <div className="container page">
      <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: '1.5rem' }}>← Back</button>

      <div className="page-header">
        <h1 className="page-title">
          {fixture.homeTeam.name} <span className="text-muted" style={{ fontWeight: 400 }}>vs</span> {fixture.awayTeam.name}
        </h1>
        <p className="page-subtitle">{fixtureTypeLabel} · {fixture.tournamentId?.name}</p>
        {(fixture.homeTeamAssignment || fixture.awayTeamAssignment) && (
          <div className="match-team-assignments">
            {fixture.homeTeamAssignment && (
              <span className="match-assignment-tag">
                {CRICKET_FLAGS[fixture.homeTeamAssignment]} {fixture.homeTeam.name} playing as <strong>{fixture.homeTeamAssignment}</strong>
              </span>
            )}
            {fixture.awayTeamAssignment && (
              <span className="match-assignment-tag">
                {CRICKET_FLAGS[fixture.awayTeamAssignment]} {fixture.awayTeam.name} playing as <strong>{fixture.awayTeamAssignment}</strong>
              </span>
            )}
          </div>
        )}
      </div>

      {error   && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      <form onSubmit={handleSubmit}>
        {/* Toss & match details */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header"><span className="card-title">Match Details</span></div>
          <div className="card-body">
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="toss-winner">Toss Won By</label>
                <select id="toss-winner" className="form-select" value={tossWinnerId}
                  onChange={(e) => setTossWinnerId(e.target.value)}>
                  <option value="">— Select —</option>
                  <option value={fixture.homeTeam._id}>{fixture.homeTeam.name}</option>
                  <option value={fixture.awayTeam._id}>{fixture.awayTeam.name}</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="toss-decision">Elected To</label>
                <select id="toss-decision" className="form-select" value={tossDecision}
                  onChange={(e) => setTossDecision(e.target.value)}>
                  <option value="bat">Bat</option>
                  <option value="field">Field</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="match-status">Result Status</label>
                <select id="match-status" className="form-select" value={status}
                  onChange={(e) => setStatus(e.target.value)}>
                  <option value="completed">Completed</option>
                  <option value="abandoned">Abandoned / No Result</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Innings — ordered by batting order derived from toss */}
        {status === 'completed' && (
          <>
            <div className="match-entry-layout" style={{ marginBottom: '1.5rem' }}>
              <InningsInput label="1st Innings" teamName={firstInnTeam.name}  value={firstInn}  onChange={setFirstInn}  maxOvers={fixture.tournamentId?.overs} />
              <InningsInput label="2nd Innings" teamName={secondInnTeam.name} value={secondInn} onChange={setSecondInn} maxOvers={fixture.tournamentId?.overs} />
            </div>

            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="card-header">
                <span className="card-title">Result</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleAutoResult}>
                  Auto-detect Winner
                </button>
              </div>
              <div className="card-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label" htmlFor="winner">Winner</label>
                    <select id="winner" className="form-select" value={winnerId}
                      onChange={(e) => setWinnerId(e.target.value)}>
                      <option value="">Tie / No Result</option>
                      <option value={fixture.homeTeam._id}>{fixture.homeTeam.name}</option>
                      <option value={fixture.awayTeam._id}>{fixture.awayTeam.name}</option>
                    </select>
                  </div>
                </div>
                {autoResultNote && (
                  <div className="result-preview" style={{ marginTop: '1rem' }}>{autoResultNote}</div>
                )}
              </div>
            </div>
          </>
        )}

        <div className="form-actions">
          <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save Result'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
