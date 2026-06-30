import { Link, useLocation } from 'react-router-dom';

/** Top navigation bar with brand logo and nav links */
export default function Navbar() {
  const { pathname } = useLocation();

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand">
          <span className="brand-icon">🏏</span>
          <span>
            Real<span className="brand-accent">Cricket</span>
          </span>
        </Link>
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
      </div>
    </nav>
  );
}
