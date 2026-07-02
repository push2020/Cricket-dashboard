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

  /** Opens a fresh print window containing only the certificate — avoids CSS conflicts */
  function handlePrint() {
    if (!winner || !tournament) return;
    const year = new Date().getFullYear();

    const styles = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: Georgia, serif; }
      .certificate { background: #fdfaf0; color: #1a1200; border-radius: 8px; max-width: 640px; width: 100%; }
      .cert-outer  { border: 8px solid #c9973a; }
      .cert-inner  { border: 2px solid #e6b96a; margin: 6px; padding: 2.5rem 3rem; text-align: center; background: linear-gradient(180deg,#fffef5,#fdfaf0); position: relative; }
      .cert-corner { position: absolute; font-size: 1.6rem; color: #c9973a; opacity: 0.6; }
      .cert-corner.tl { top:8px;  left:10px;  }
      .cert-corner.tr { top:8px;  right:10px; }
      .cert-corner.bl { bottom:8px; left:10px;  }
      .cert-corner.br { bottom:8px; right:10px; }
      .cert-logo     { font-size:3rem; display:block; margin-bottom:0.25rem; }
      .cert-org-name { font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.2em; color:#8b6914; margin-bottom:1.5rem; }
      .cert-title    { font-size:1.05rem; font-weight:700; text-transform:uppercase; letter-spacing:0.18em; color:#6b4c00; margin-bottom:0.4rem; }
      .cert-divider  { width:80px; height:2px; background:linear-gradient(90deg,transparent,#c9973a,transparent); margin:0.75rem auto; }
      .cert-certifies{ font-size:0.85rem; color:#555; margin-bottom:0.25rem; font-style:italic; }
      .cert-team     { font-size:1.8rem; font-weight:900; color:#2c1a00; letter-spacing:-0.02em; margin:0.3rem 0; }
      .cert-for      { font-size:0.85rem; color:#555; margin-bottom:0.25rem; font-style:italic; }
      .cert-tournament{ font-size:1.15rem; font-weight:800; color:#8b4500; margin-bottom:0.25rem; }
      .cert-details  { font-size:0.75rem; color:#888; margin-bottom:1.25rem; }
      .cert-footer   { display:flex; align-items:center; justify-content:center; gap:1rem; margin-top:1rem; }
      .cert-seal     { font-size:2rem; }
      .cert-year     { font-size:0.75rem; color:#888; font-style:italic; }
      @media print { body { min-height: unset; } }
    `;

    const html = `
      <div class="certificate">
        <div class="cert-outer"><div class="cert-inner">
          <span class="cert-corner tl">❧</span>
          <span class="cert-corner tr">❧</span>
          <span class="cert-corner bl">❧</span>
          <span class="cert-corner br">❧</span>
          <span class="cert-logo">🏏</span>
          <div class="cert-org-name">RealCricket</div>
          <div class="cert-title">Certificate of Championship</div>
          <div class="cert-divider"></div>
          <div class="cert-certifies">This certifies that</div>
          <div class="cert-team">${winner.name}</div>
          <div class="cert-for">are the Champions of</div>
          <div class="cert-tournament">${tournament.name}</div>
          <div class="cert-details">${tournament.overs}-over format &middot; ${year}</div>
          <div class="cert-divider"></div>
          <div class="cert-footer">
            <div class="cert-seal">🏆</div>
            <div class="cert-year">Awarded ${year}</div>
          </div>
        </div></div>
      </div>
    `;

    const win = window.open('', '_blank');
    if (!win) { alert('Allow pop-ups for this site to print the certificate.'); return; }
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="UTF-8">
      <title>Certificate of Championship — ${winner.name}</title>
      <style>${styles}</style>
    </head><body>${html}
      <script>window.onload = function () { window.print(); };<\/script>
    </body></html>`);
    win.document.close();
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

      {/* Certificate is printed via a fresh window — no print-only div needed */}
    </>
  );
}
