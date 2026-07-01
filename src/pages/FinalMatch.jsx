import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getFixture, enterResult } from '../api';

const INITIAL_INNINGS = { runs: '', wickets: '', overs: '' };

/** Returns true if the home team batted first based on toss */
function homeTeamBattedFirst(tossWinnerId, tossDecision, homeTeamId) {
  if (!tossWinnerId || !tossDecision) return true;
  const tossWinnerIsHome = tossWinnerId === homeTeamId;
  return tossDecision === 'bat' ? tossWinnerIsHome : !tossWinnerIsHome;
}

/**
 * Generates result note based on batting order (not home/away).
 * firstInnTeam batted first (set target); secondInnTeam chased.
 */
function buildResultNote(firstInnTeam, secondInnTeam, firstInn, secondInn, winnerId) {
  if (!firstInnTeam || !secondInnTeam || !winnerId) return '';
  const firstRuns     = Number(firstInn.runs);
  const secondRuns    = Number(secondInn.runs);
  const secondWickets = Number(secondInn.wickets);
  if (winnerId === firstInnTeam._id) {
    const margin = firstRuns - secondRuns;
    return `${firstInnTeam.name} won by ${margin} run${margin !== 1 ? 's' : ''}`;
  }
  if (winnerId === secondInnTeam._id) {
    const wicketsLeft = 10 - secondWickets;
    return `${secondInnTeam.name} won by ${wicketsLeft} wicket${wicketsLeft !== 1 ? 's' : ''}`;
  }
  return '';
}

/** Single innings input: runs, wickets, and actual overs played */
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
            <input
              className="form-input" type="number" min="0" placeholder="0"
              value={value.runs}
              onChange={(e) => handleField('runs', e.target.value)}
            />
          </div>
          <div>
            <div className="innings-stat-label">Wickets</div>
            <input
              className="form-input" type="number" min="0" max="10" placeholder="0"
              value={value.wickets}
              onChange={(e) => handleField('wickets', e.target.value)}
            />
          </div>
          <div>
            <div className="innings-stat-label">Overs</div>
            <input
              className="form-input" type="number" min="0" step="0.1" placeholder={maxOvers ?? '0'}
              value={value.overs}
              onChange={(e) => handleField('overs', e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Dedicated Final match entry page — navigates to /celebration after saving */
export default function FinalMatch() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [fixture, setFixture] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [homeInn, setHomeInn] = useState(INITIAL_INNINGS);
  const [awayInn, setAwayInn] = useState(INITIAL_INNINGS);
  const [winnerId, setWinnerId] = useState('');
  const [tossWinnerId, setTossWinnerId] = useState('');
  const [tossDecision, setTossDecision] = useState('bat');
  const [status, setStatus] = useState('completed');

  /** Loads fixture and pre-fills if already completed */
  useEffect(() => {
    async function load() {
      try {
        const { data } = await getFixture(id);
        if (data.type !== 'final') {
          navigate(`/match/${id}`, { replace: true });
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
        setError('Failed to load Final match details.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, navigate]);

  // ── Derive batting order from toss ──────────────────────────────────
  const battingFirstIsHome = homeTeamBattedFirst(tossWinnerId, tossDecision, fixture?.homeTeam?._id);
  const firstInnTeam  = battingFirstIsHome ? fixture?.homeTeam : fixture?.awayTeam;
  const secondInnTeam = battingFirstIsHome ? fixture?.awayTeam : fixture?.homeTeam;
  const firstInn      = battingFirstIsHome ? homeInn  : awayInn;
  const secondInn     = battingFirstIsHome ? awayInn  : homeInn;
  const setFirstInn   = battingFirstIsHome ? setHomeInn  : setAwayInn;
  const setSecondInn  = battingFirstIsHome ? setAwayInn  : setHomeInn;

  /** Auto-sets winner from batting-order run comparison */
  function handleAutoResult() {
    if (!fixture) return;
    const first  = Number(firstInn.runs);
    const second = Number(secondInn.runs);
    if (first > second)      setWinnerId(firstInnTeam._id);
    else if (second > first) setWinnerId(secondInnTeam._id);
    else                     setWinnerId('');
  }

  /** Validates and submits the final result */
  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (status === 'completed' && (homeInn.runs === '' || awayInn.runs === '')) {
      return setError('Please enter runs for both teams.');
    }
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
        resultNote, tossWinner: tossWinnerId || null, tossDecision: tossDecision || null, matchDate: null, status,
      });

      const tournamentId = fixture.tournamentId._id;
      if (status === 'completed' && winnerId) {
        navigate(`/celebration/${tournamentId}`);
      } else {
        navigate(`/tournament/${tournamentId}?tab=playoffs`);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save result.');
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="container"><div className="loading-wrap"><div className="spinner" />Loading Final match…</div></div>;
  }

  if (error && !fixture) {
    return (
      <div className="container page">
        <div className="error-banner">{error}</div>
        <button className="btn btn-ghost" onClick={() => navigate(-1)}>← Back</button>
      </div>
    );
  }

  if (fixture && (!fixture.homeTeam || !fixture.awayTeam)) {
    return (
      <div className="container page">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: '1.5rem' }}>← Back</button>
        <div className="error-banner">The Final cannot be played yet — complete all preceding playoff matches first.</div>
      </div>
    );
  }

  const autoResultNote = status === 'completed' ? buildResultNote(firstInnTeam, secondInnTeam, firstInn, secondInn, winnerId) : '';

  return (
    <div className="container page">
      <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: '1.5rem' }}>
        ← Back
      </button>

      {/* Final hero */}
      <div className="final-hero">
        <div className="final-trophy-icon">🏆</div>
        <div className="final-badge">The Grand Final</div>
        <h1 className="final-title">{fixture.tournamentId?.name}</h1>
        <div className="final-teams-display">
          <div className="final-team-name">{fixture.homeTeam.name}</div>
          <div className="final-vs">⚡ vs ⚡</div>
          <div className="final-team-name">{fixture.awayTeam.name}</div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={handleSubmit}>
        {/* Toss details */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header"><span className="card-title">Match Details</span></div>
          <div className="card-body">
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="toss-winner">Toss Won By</label>
                <select id="toss-winner" className="form-select" value={tossWinnerId} onChange={(e) => setTossWinnerId(e.target.value)}>
                  <option value="">— Select —</option>
                  <option value={fixture.homeTeam._id}>{fixture.homeTeam.name}</option>
                  <option value={fixture.awayTeam._id}>{fixture.awayTeam.name}</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="toss-decision">Elected To</label>
                <select id="toss-decision" className="form-select" value={tossDecision} onChange={(e) => setTossDecision(e.target.value)}>
                  <option value="bat">Bat</option>
                  <option value="field">Field</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="match-status">Result Status</label>
                <select id="match-status" className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="completed">Completed</option>
                  <option value="abandoned">Abandoned / No Result</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Innings scores */}
        {status === 'completed' && (
          <>
            <div className="match-entry-layout" style={{ marginBottom: '1.5rem' }}>
              <InningsInput label="1st Innings" teamName={firstInnTeam.name}  value={firstInn}  onChange={setFirstInn}  maxOvers={fixture.tournamentId?.overs} />
              <InningsInput label="2nd Innings" teamName={secondInnTeam.name} value={secondInn} onChange={setSecondInn} maxOvers={fixture.tournamentId?.overs} />
            </div>

            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="card-header">
                <span className="card-title">🏆 Declare the Champion</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleAutoResult}>
                  Auto-detect Winner
                </button>
              </div>
              <div className="card-body">
                <div className="form-group" style={{ maxWidth: 300 }}>
                  <label className="form-label" htmlFor="winner">Winner</label>
                  <select id="winner" className="form-select" value={winnerId} onChange={(e) => setWinnerId(e.target.value)}>
                    <option value="">Tie / No Result</option>
                    <option value={fixture.homeTeam._id}>{fixture.homeTeam.name}</option>
                    <option value={fixture.awayTeam._id}>{fixture.awayTeam.name}</option>
                  </select>
                </div>
                {autoResultNote && (
                  <div className="result-preview" style={{ marginTop: '1rem' }}>{autoResultNote}</div>
                )}
              </div>
            </div>
          </>
        )}

        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-gold btn-lg"
            disabled={submitting}
          >
            {submitting ? 'Saving…' : status === 'completed' && winnerId ? '🏆 Declare Champion' : 'Save Result'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
