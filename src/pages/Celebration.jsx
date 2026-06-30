import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTournament, getFixtures } from '../api';

const CONFETTI_COLORS = [
  '#f59e0b', '#10b981', '#3b82f6', '#ef4444',
  '#8b5cf6', '#f472b6', '#fcd34d', '#34d399',
];

/**
 * Generates N confetti pieces with randomised positions and timings.
 * Each piece is a styled div animated via CSS custom properties.
 */
function Confetti({ count }) {
  const pieces = useRef(
    Array.from({ length: count }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      width: `${5 + Math.random() * 8}px`,
      height: `${6 + Math.random() * 10}px`,
      dur: `${2.8 + Math.random() * 2.5}s`,
      delay: `${Math.random() * 3.5}s`,
      borderRadius: Math.random() > 0.4 ? '50%' : '2px',
    }))
  ).current;

  return (
    <div className="confetti-container" aria-hidden="true">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: p.left,
            width: p.width,
            height: p.height,
            backgroundColor: p.color,
            borderRadius: p.borderRadius,
            '--dur': p.dur,
            '--delay': p.delay,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Printable championship certificate.
 * The outer component is always rendered but only visible when shown.
 */
function Certificate({ tournament, winnerName }) {
  const year = new Date().getFullYear();

  return (
    <div className="certificate">
      <div className="cert-outer">
        <div className="cert-inner">
          <span className="cert-corner tl">❧</span>
          <span className="cert-corner tr">❧</span>
          <span className="cert-corner bl">❧</span>
          <span className="cert-corner br">❧</span>

          <span className="cert-logo">🏏</span>
          <div className="cert-org-name">RealCricket</div>

          <div className="cert-title">Certificate of Championship</div>
          <div className="cert-divider" />

          <div className="cert-certifies">This certifies that</div>
          <div className="cert-team">{winnerName}</div>

          <div className="cert-for">are the Champions of</div>
          <div className="cert-tournament">{tournament?.name}</div>
          <div className="cert-details">{tournament?.overs}-over format · {year}</div>

          <div className="cert-divider" />

          <div className="cert-footer">
            <div className="cert-seal">🏆</div>
            <div className="cert-year">Awarded {year}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Celebration page — shown after the Final is decided */
export default function Celebration() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();

  const [tournament, setTournament] = useState(null);
  const [winner, setWinner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCert, setShowCert] = useState(false);

  /** Loads tournament + final fixture to find the winner */
  useEffect(() => {
    async function load() {
      try {
        const [tRes, fRes] = await Promise.all([
          getTournament(tournamentId),
          getFixtures(tournamentId),
        ]);
        setTournament(tRes.data);

        const finalFixture = fRes.data.find((f) => f.type === 'final');
        if (finalFixture?.winner) {
          setWinner(finalFixture.winner);
        }
      } catch {
        /* silently handle */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tournamentId]);

  /** Opens the browser print dialog showing only the certificate */
  function handlePrint() {
    setShowCert(true);
    setTimeout(() => window.print(), 300);
  }

  if (loading) {
    return <div className="container"><div className="loading-wrap"><div className="spinner" />Loading…</div></div>;
  }

  if (!winner) {
    return (
      <div className="container page">
        <div className="error-banner">No champion found for this tournament yet.</div>
        <button className="btn btn-ghost" onClick={() => navigate(`/tournament/${tournamentId}`)}>← Back to Tournament</button>
      </div>
    );
  }

  return (
    <>
      {/* Confetti rain */}
      <Confetti count={80} />

      {/* Main celebration overlay */}
      <div className="celebration-page">
        <div className="celebration-content">
          {/* Trophy */}
          <span className="celebration-trophy" role="img" aria-label="Trophy">🏆</span>

          {/* Label */}
          <div className="celebration-label">🎉 Tournament Champion 🎉</div>

          {/* "Champions" headline */}
          <div className="celebration-champions">Champions!</div>

          {/* Winner name */}
          <div className="celebration-team-name">{winner.name}</div>

          {/* Subtitle */}
          {tournament && (
            <div className="celebration-subtitle">{tournament.name} · {tournament.overs}-over format</div>
          )}

          {/* Stars */}
          <div className="celebration-stars">
            {['⭐', '🌟', '🏅', '🌟', '⭐'].map((s, i) => (
              <span key={i}>{s}</span>
            ))}
          </div>

          {/* Actions */}
          <div className="celebration-actions">
            <button className="btn btn-gold btn-lg" onClick={() => setShowCert((v) => !v)}>
              {showCert ? 'Hide Certificate' : '🎓 View Certificate'}
            </button>
            <button className="btn btn-primary btn-lg" onClick={handlePrint}>
              🖨️ Print Certificate
            </button>
            <button className="btn btn-ghost" onClick={() => navigate(`/tournament/${tournamentId}`)}>
              ← Back to Tournament
            </button>
          </div>

          {/* Certificate */}
          {showCert && (
            <div className="cert-preview-wrap" style={{ marginTop: '2rem', width: '100%', animation: 'fadeInUp 0.4s ease both' }}>
              <Certificate tournament={tournament} winnerName={winner.name} />
            </div>
          )}
        </div>
      </div>

      {/* Print-only certificate */}
      <div className="print-only" style={{ display: 'none' }}>
        <Certificate tournament={tournament} winnerName={winner.name} />
      </div>
    </>
  );
}
