import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTournaments, deleteTournament } from '../api';

/** Returns a CSS class name for the given tournament status badge */
function statusClass(status) {
  const map = { upcoming: 'badge-upcoming', active: 'badge-active', completed: 'badge-completed' };
  return map[status] || 'badge-upcoming';
}

/** Formats an ISO date string into a readable short date */
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Home page — lists all tournaments and lets the user navigate to create or view one */
export default function Home() {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /** Loads all tournaments from the API */
  async function loadTournaments() {
    try {
      setLoading(true);
      const { data } = await getTournaments();
      setTournaments(data);
    } catch {
      setError('Failed to load tournaments.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTournaments();
  }, []);

  /** Asks for confirmation then deletes a tournament */
  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!confirm('Delete this tournament and all its data?')) return;
    try {
      await deleteTournament(id);
      setTournaments((prev) => prev.filter((t) => t._id !== id));
    } catch {
      alert('Failed to delete tournament.');
    }
  }

  if (loading) {
    return (
      <div className="container">
        <div className="loading-wrap">
          <div className="spinner" />
          Loading tournaments…
        </div>
      </div>
    );
  }

  return (
    <div className="container page">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1 className="page-title">Tournaments</h1>
            <p className="page-subtitle">{tournaments.length} tournament{tournaments.length !== 1 ? 's' : ''} found</p>
          </div>
          <button className="btn btn-primary btn-lg" onClick={() => navigate('/create')}>
            + New Tournament
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {tournaments.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🏏</div>
          <div className="empty-state-title">No tournaments yet</div>
          <div className="empty-state-desc">Create your first tournament to get started.</div>
        </div>
      ) : (
        <div className="tournament-grid">
          {tournaments.map((t) => (
            <div
              key={t._id}
              className="tournament-card"
              onClick={() => navigate(`/tournament/${t._id}`)}
            >
              <div className="tournament-card-header">
                <h2 className="tournament-name">{t.name}</h2>
                <span className={`badge ${statusClass(t.status)}`}>{t.status}</span>
              </div>
              {t.description && (
                <p className="tournament-description">{t.description}</p>
              )}
              <div className="tournament-meta">
                <span>🎯 {t.overs} overs</span>
                {t.startDate && <span>📅 {formatDate(t.startDate)}</span>}
              </div>
              <div className="divider" style={{ margin: '0.85rem 0' }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={(e) => handleDelete(e, t._id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
