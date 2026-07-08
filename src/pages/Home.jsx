import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTournaments, deleteTournament } from '../api';

/** Returns a CSS class name for the given tournament status badge */
function statusClass(status) {
  const map = { upcoming: 'badge-upcoming', active: 'badge-active', completed: 'badge-completed' };
  return map[status] || 'badge-upcoming';
}

/** Status display labels */
const STATUS_LABEL = { upcoming: 'Upcoming', active: 'Active', completed: 'Completed' };

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

  const activeTournaments = tournaments.filter((t) => t.status === 'active').length;
  const completedTournaments = tournaments.filter((t) => t.status === 'completed').length;

  return (
    <div className="container page">
      {/* Hero banner */}
      <div className="home-hero">
        <div className="home-hero-content">
          <div className="home-hero-text">
            <h1>Real Cricket</h1>
            <p>Manage tournaments, track scores, and settle the rivalry.</p>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap', width: '100%' }}>
              <button className="btn btn-primary btn-lg" onClick={() => navigate('/create')}>
                + New Tournament
              </button>
              <button className="btn btn-ghost btn-lg" onClick={() => navigate('/hall-of-fame')}>
                🏆 Hall of Fame
              </button>
              {tournaments.length > 0 && (
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginLeft: '0.5rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-green)', lineHeight: 1 }}>
                      {activeTournaments}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Active
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-secondary)', lineHeight: 1 }}>
                      {completedTournaments}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Completed
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="home-hero-ball" aria-hidden="true">🏏</div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {tournaments.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">🏟️</span>
          <div className="empty-state-title">No tournaments yet</div>
          <div className="empty-state-desc">Hit New Tournament above to get started.</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              All Tournaments
            </h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {tournaments.length} total
            </span>
          </div>
          <div className="tournament-grid">
            {tournaments.map((t, idx) => (
              <div
                key={t._id}
                className="tournament-card"
                onClick={() => navigate(`/tournament/${t._id}`)}
                style={{ animationDelay: `${idx * 0.05}s` }}
              >
                <div className="tournament-card-header">
                  <h2 className="tournament-name">{t.name}</h2>
                  <span className={`badge ${statusClass(t.status)}`}>{STATUS_LABEL[t.status] ?? t.status}</span>
                </div>
                {t.description && (
                  <p className="tournament-description">{t.description}</p>
                )}
                <div className="tournament-meta">
                  <span>🎯 {t.overs} overs</span>
                  {t.format === 'bilateral' && (
                    <span className="bilateral-badge">🤝 Series ({t.numberOfMatches}M)</span>
                  )}
                </div>
                <div className="divider" style={{ margin: '0.85rem 0' }} />
                {t.status !== 'completed' && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={(e) => handleDelete(e, t._id)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
