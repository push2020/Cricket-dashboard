import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTournament } from '../api';

const INITIAL_FORM = { name: '', description: '', overs: '', startDate: '' };

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
        startDate: form.startDate || undefined,
      });
      navigate(`/tournament/${data._id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create tournament.');
      setSubmitting(false);
    }
  }

  return (
    <div className="container page">
      <div className="page-header">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>
          ← Back
        </button>
        <div style={{ height: '1rem' }} />
        <h1 className="page-title">Create Tournament</h1>
        <p className="page-subtitle">Set up your round-robin cricket tournament</p>
      </div>

      <div className="card" style={{ maxWidth: 600 }}>
        <div className="card-body">
          {error && <div className="error-banner">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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

              <div className="form-grid">
                <div className="form-group">
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

                <div className="form-group">
                  <label className="form-label" htmlFor="t-date">Start Date</label>
                  <input
                    id="t-date"
                    className="form-input"
                    type="date"
                    value={form.startDate}
                    onChange={(e) => handleChange('startDate', e.target.value)}
                  />
                </div>
              </div>

              <div className="form-actions" style={{ marginTop: '0.5rem' }}>
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
