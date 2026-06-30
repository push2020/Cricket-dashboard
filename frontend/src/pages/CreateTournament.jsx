import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTournament } from '../api';

const INITIAL_FORM = { name: '', description: '', overs: '' };

/** Create Tournament page — form to configure a new tournament */
export default function CreateTournament() {
  const navigate = useNavigate();
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  /** Updates a single form field by key */
  function handleChange(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /** Validates form fields and submits to the API */
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

      {/* Hero header */}
      <div style={{
        background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 50%, #ecfdf5 100%)',
        border: '1px solid rgba(22,163,74,0.2)',
        borderRadius: 'var(--radius-xl)',
        padding: '2rem 2.5rem',
        marginBottom: '2rem',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(22,163,74,0.1)',
      }}>
        <div style={{
          position: 'absolute', right: '1.5rem', top: '50%', transform: 'translateY(-50%)',
          fontSize: '5rem', opacity: 0.12, pointerEvents: 'none', lineHeight: 1,
        }}>🏆</div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1 className="page-title" style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #15803d 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            New Tournament
          </h1>
          <p className="page-subtitle">Configure your round-robin cricket tournament</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card-body">
          {error && <div className="error-banner">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="t-name">Tournament Name *</label>
                <input
                  id="t-name"
                  className="form-input"
                  placeholder="e.g. Office T20 League 2025"
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
                  rows={3}
                  value={form.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div className="form-group" style={{ maxWidth: 200 }}>
                <label className="form-label" htmlFor="t-overs">Overs Per Innings *</label>
                <input
                  id="t-overs"
                  className="form-input"
                  type="number"
                  min="1"
                  placeholder="e.g. 20"
                  value={form.overs}
                  onChange={(e) => handleChange('overs', e.target.value)}
                />
                <span className="form-hint">Whole number (e.g. 10, 20, 50)</span>
              </div>

              <div className="form-actions" style={{ marginTop: '0.25rem' }}>
                <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
                  {submitting ? 'Creating…' : 'Create Tournament'}
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
