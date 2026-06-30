import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getFixture, enterResult } from '../api';

const INITIAL_INNINGS = { runs: '', wickets: '' };

/**
 * Auto-generates a result note string from innings data and winner info.
 * Returns an empty string if not enough data is available.
 *
 * @param {object} fixture - The populated fixture document
 * @param {object} homeInn - Home innings form state
 * @param {object} awayInn - Away innings form state
 * @param {string} winnerId - The _id of the winning team (or '' for tie)
 * @returns {string}
 */
function buildResultNote(fixture, homeInn, awayInn, winnerId) {
  if (!fixture || !winnerId) return '';

  const homeRuns = Number(homeInn.runs);
  const awayRuns = Number(awayInn.runs);
  const awayWickets = Number(awayInn.wickets);

  if (winnerId === fixture.homeTeam._id) {
    const margin = homeRuns - awayRuns;
    return `${fixture.homeTeam.name} won by ${margin} run${margin !== 1 ? 's' : ''}`;
  }
  if (winnerId === fixture.awayTeam._id) {
    if (awayRuns > homeRuns) {
      const wicketsLeft = 10 - awayWickets;
      return `${fixture.awayTeam.name} won by ${wicketsLeft} wicket${wicketsLeft !== 1 ? 's' : ''}`;
    }
    const margin = awayRuns - homeRuns;
    return `${fixture.awayTeam.name} won by ${margin} run${margin !== 1 ? 's' : ''}`;
  }
  return '';
}

/** Single innings input group — runs and wickets only (overs taken from tournament setting) */
function InningsInput({ label, teamName, value, onChange }) {
  /** Propagates a field change up to the parent handler */
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
              className="form-input"
              type="number"
              min="0"
              placeholder="0"
              value={value.runs}
              onChange={(e) => handleField('runs', e.target.value)}
            />
          </div>
          <div>
            <div className="innings-stat-label">Wickets</div>
            <input
              className="form-input"
              type="number"
              min="0"
              max="10"
              placeholder="0"
              value={value.wickets}
              onChange={(e) => handleField('wickets', e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Match Entry page — lets the user record scores for a fixture */
export default function MatchEntry() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [fixture, setFixture] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [homeInn, setHomeInn] = useState(INITIAL_INNINGS);
  const [awayInn, setAwayInn] = useState(INITIAL_INNINGS);
  const [winnerId, setWinnerId] = useState('');
  const [tossWinnerId, setTossWinnerId] = useState('');
  const [tossDecision, setTossDecision] = useState('bat');
  const [status, setStatus] = useState('completed');

  /** Loads the fixture and pre-fills the form if a result already exists */
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
          setHomeInn({
            runs: String(data.homeInnings?.runs ?? ''),
            wickets: String(data.homeInnings?.wickets ?? ''),
          });
          setAwayInn({
            runs: String(data.awayInnings?.runs ?? ''),
            wickets: String(data.awayInnings?.wickets ?? ''),
          });
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

  /** Derives and sets the winner from current innings data */
  function handleAutoResult() {
    if (!fixture) return;
    const home = Number(homeInn.runs);
    const away = Number(awayInn.runs);
    if (home > away) {
      setWinnerId(fixture.homeTeam._id);
    } else if (away > home) {
      setWinnerId(fixture.awayTeam._id);
    } else {
      setWinnerId('');
    }
  }

  /** Validates and submits the result to the API */
  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (status === 'completed') {
      if (homeInn.runs === '' || awayInn.runs === '') {
        return setError('Please enter runs for both teams.');
      }
    }

    const tournamentOvers = fixture.tournamentId?.overs ?? 0;
    const resultNote = status === 'abandoned'
      ? 'Match abandoned'
      : buildResultNote(fixture, homeInn, awayInn, winnerId);

    try {
      setSubmitting(true);
      await enterResult(id, {
        homeInnings: {
          runs: Number(homeInn.runs) || 0,
          wickets: Number(homeInn.wickets) || 0,
          overs: tournamentOvers,
        },
        awayInnings: {
          runs: Number(awayInn.runs) || 0,
          wickets: Number(awayInn.wickets) || 0,
          overs: tournamentOvers,
        },
        winner: status === 'completed' ? winnerId || null : null,
        resultNote,
        tossWinner: tossWinnerId || null,
        tossDecision: tossDecision || null,
        matchDate: null,
        status,
      });
      setSuccess('Result saved successfully!');
      setTimeout(() => {
        navigate(`/tournament/${fixture.tournamentId._id}?tab=fixtures`);
      }, 1200);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save result.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="container">
        <div className="loading-wrap">
          <div className="spinner" />
          Loading match…
        </div>
      </div>
    );
  }

  if (error && !fixture) {
    return (
      <div className="container page">
        <div className="error-banner">{error}</div>
        <button className="btn btn-ghost" onClick={() => navigate(-1)}>← Back</button>
      </div>
    );
  }

  if (fixture && fixture.type === 'final' && !fixture.awayTeam) {
    return (
      <div className="container page">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: '1.5rem' }}>
          ← Back
        </button>
        <div className="error-banner">
          The Final cannot be played yet — complete the Eliminator match first.
        </div>
      </div>
    );
  }

  const fixtureTypeLabel = (() => {
    if (fixture.type === 'eliminator') return 'Eliminator';
    if (fixture.type === 'final') return 'Final';
    return `Round ${fixture.round}`;
  })();

  const autoResultNote = status === 'completed'
    ? buildResultNote(fixture, homeInn, awayInn, winnerId)
    : '';

  return (
    <div className="container page">
      <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: '1.5rem' }}>
        ← Back
      </button>

      <div className="page-header">
        <h1 className="page-title">
          {fixture.homeTeam.name} <span className="text-muted" style={{ fontWeight: 400 }}>vs</span> {fixture.awayTeam.name}
        </h1>
        <p className="page-subtitle">
          {fixtureTypeLabel} · {fixture.tournamentId?.name}
        </p>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      <form onSubmit={handleSubmit}>
        {/* Toss row */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header">
            <span className="card-title">Match Details</span>
          </div>
          <div className="card-body">
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="toss-winner">Toss Won By</label>
                <select
                  id="toss-winner"
                  className="form-select"
                  value={tossWinnerId}
                  onChange={(e) => setTossWinnerId(e.target.value)}
                >
                  <option value="">— Select —</option>
                  <option value={fixture.homeTeam._id}>{fixture.homeTeam.name}</option>
                  <option value={fixture.awayTeam._id}>{fixture.awayTeam.name}</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="toss-decision">Elected To</label>
                <select
                  id="toss-decision"
                  className="form-select"
                  value={tossDecision}
                  onChange={(e) => setTossDecision(e.target.value)}
                >
                  <option value="bat">Bat</option>
                  <option value="field">Field</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="match-status">Result Status</label>
                <select
                  id="match-status"
                  className="form-select"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="completed">Completed</option>
                  <option value="abandoned">Abandoned / No Result</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Innings */}
        {status === 'completed' && (
          <>
            <div className="match-entry-layout" style={{ marginBottom: '1.5rem' }}>
              <InningsInput
                label="Innings"
                teamName={fixture.homeTeam.name}
                value={homeInn}
                onChange={setHomeInn}
              />
              <InningsInput
                label="Innings"
                teamName={fixture.awayTeam.name}
                value={awayInn}
                onChange={setAwayInn}
              />
            </div>

            {/* Winner */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="card-header">
                <span className="card-title">Result</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleAutoResult}
                >
                  Auto-detect Winner
                </button>
              </div>
              <div className="card-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label" htmlFor="winner">Winner</label>
                    <select
                      id="winner"
                      className="form-select"
                      value={winnerId}
                      onChange={(e) => setWinnerId(e.target.value)}
                    >
                      <option value="">Tie / No Result</option>
                      <option value={fixture.homeTeam._id}>{fixture.homeTeam.name}</option>
                      <option value={fixture.awayTeam._id}>{fixture.awayTeam.name}</option>
                    </select>
                  </div>
                </div>

                {autoResultNote && (
                  <div className="result-preview" style={{ marginTop: '1rem' }}>
                    {autoResultNote}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        <div className="form-actions">
          <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save Result'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
