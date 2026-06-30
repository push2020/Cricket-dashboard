import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';

/** Top navigation bar — collapses to hamburger menu on mobile */
export default function Navbar() {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef(null);

  /** Close menu whenever the route changes */
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  /** Close menu when user clicks outside the navbar */
  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e) {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  return (
    <nav className="navbar" ref={navRef}>
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand">
          <span className="brand-icon">🏏</span>
          <span>Real<span className="brand-accent">Cricket</span></span>
        </Link>

        {/* Desktop links — hidden via CSS on mobile */}
        <div className="navbar-links">
          <Link to="/" className={`nav-link${pathname === '/' ? ' active' : ''}`}>
            Tournaments
          </Link>
          <Link to="/hall-of-fame" className={`nav-link${pathname === '/hall-of-fame' ? ' active' : ''}`}>
            🏆 Hall of Fame
          </Link>
          <Link to="/create" className={`nav-link${pathname === '/create' ? ' active' : ''}`}>
            + New
          </Link>
        </div>

        {/* Hamburger button — shown via CSS on mobile only */}
        <button
          className={`nav-hamburger${menuOpen ? ' open' : ''}`}
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="nav-mobile-menu">
          <Link to="/" className={`nav-mobile-link${pathname === '/' ? ' active' : ''}`}>
            Tournaments
          </Link>
          <Link to="/hall-of-fame" className={`nav-mobile-link${pathname === '/hall-of-fame' ? ' active' : ''}`}>
            🏆 Hall of Fame
          </Link>
          <Link to="/create" className={`nav-mobile-link${pathname === '/create' ? ' active' : ''}`}>
            + New Tournament
          </Link>
        </div>
      )}
    </nav>
  );
}
