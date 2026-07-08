import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTournament } from '../api';

const INITIAL_FORM = { name: '', description: '', overs: '', format: 'standard', numberOfMatches: '3' };

const SERIES_OPTIONS = [
  { value: '1', label: '1 match' },
  { value: '3', label: 'Best of 3' },
  { value: '5', label: 'Best of 5' },
  { value: '7', label: 'Best of 7' },
];

/** Create Tournament page — form to configure a new tournament */
export default function CreateTournament() {
  const navigate = useNavigate();
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function handleChange(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const isBilateral = form.format === 'bilateral';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.name.trim()) return setError('Tournament name is required.');
    const oversNum = Number(form.overs);
    if (!form.overs || oversNum < 1 || !Number.isInteger(oversNum)) {
      return setError('Overs must be a whole number of 1 or more.');
    }

    try {
      setSubmitting(true);
      const { data } = await createTournament({
        name: form.name.trim(),
        description: form.description.trim(),
        overs: oversNum,
        format: form.format,
        numberOfMatches: isBilateral ? Number(form.numberOfMatches) : 1,
      });
      navigate(`/tournament/${data._id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create tournament.');
      setSubmitting(false);
    }
  }

  return (
    <div className="container page">
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')} style={{ marginBottom: '1.5rem' }}>
        ← Back
      </button>

      {/* Hero */}
      <div style={{
        background: isBilateral
          ? 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 50%, #fffbeb 100%)'
          : 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 50%, #ecfdf5 100%)',
        border: `1px solid ${isBilateral ? 'rgba(217,119,6,0.2)' : 'rgba(22,163,74,0.2)'}`,
        borderRadius: 'var(--radius-xl)',
        padding: '2rem 2.5rem',
        marginBottom: '2rem',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: isBilateral ? '0 4px 24px rgba(217,119,6,0.1)' : '0 4px 24px rgba(22,163,74,0.1)',
      }}>
        <div style={{ position: 'absolute', right: '1.5rem', top: '50%', transform: 'translateY(-50%)', fontSize: '5rem', opacity: 0.12, pointerEvents: 'none', lineHeight: 1 }}>
          {isBilateral ? '🤝' : '🏆'}
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1 className="page-title" style={{
            background: isBilateral
              ? 'linear-gradient(135deg, #0f172a 0%, #b45309 100%)'
              : 'linear-gradient(135deg, #0f172a 0%, #15803d 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            {isBilateral ? 'New Bilateral Series' : 'New Tournament'}
          </h1>
          <p className="page-subtitle">
            {isBilateral ? 'Head-to-head series between 2 players' : 'Configure your round-robin cricket tournament'}
          </p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card-body">
          {error && <div className="error-banner">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

              {/* Tournament type toggle */}
              <div className="form-group">
                <label className="form-label">Tournament Type</label>
                <div className="type-toggle">
                  <button
                    type="button"
                    className={`type-toggle-btn${form.format === 'standard' ? ' active' : ''}`}
                    onClick={() => handleChange('format', 'standard')}
                  >
                    🏆 Regular Tournament
                    <span className="type-toggle-sub">Round-robin, 2+ teams</span>
                  </button>
                  <button
                    type="button"
                    className={`type-toggle-btn${isBilateral ? ' active bilateral' : ''}`}
                    onClick={() => handleChange('format', 'bilateral')}
                  >
                    🤝 Bilateral Series
                    <span className="type-toggle-sub">1-on-1 match series</span>
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="t-name">
                  {isBilateral ? 'Series Name *' : 'Tournament Name *'}
                </label>
                <input
                  id="t-name"
                  className="form-input"
                  placeholder={isBilateral ? 'e.g. Vishal vs Mihir Series' : 'e.g. Office T20 League 2025'}
                  value={form.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="t-desc">Description</label>
                <textarea
                  id="t-desc"
                  className="form-textarea"
                  placeholder="Optional short description…"
                  rows={2}
                  value={form.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
                  <label className="form-label" htmlFor="t-overs">Overs Per Innings *</label>
                  <input
                    id="t-overs"
                    className="form-input"
                    type="number"
                    min="1"
                    placeholder="e.g. 10"
                    value={form.overs}
                    onChange={(e) => handleChange('overs', e.target.value)}
                  />
                  <span className="form-hint">Same for every match</span>
                </div>

                {/* Series length — only for bilateral */}
                {isBilateral && (
                  <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
                    <label className="form-label" htmlFor="t-matches">Number of Matches *</label>
                    <select
                      id="t-matches"
                      className="form-select"
                      value={form.numberOfMatches}
                      onChange={(e) => handleChange('numberOfMatches', e.target.value)}
                    >
                      {SERIES_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <span className="form-hint">Home/away alternates each match</span>
                  </div>
                )}
              </div>

              <div className="form-actions" style={{ marginTop: '0.25rem' }}>
                <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
                  {submitting ? 'Creating…' : isBilateral ? 'Create Series' : 'Create Tournament'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => navigate('/')}>
                  Cancel
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
