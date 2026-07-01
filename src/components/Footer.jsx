const VERSION = "1.0.1";
const BUILD_YEAR = new Date().getFullYear();

/** App-wide footer — version, branch info, and links */
export default function Footer() {
  return (
    <footer className="app-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <span className="footer-cricket">🏏</span>
          <span className="footer-name">Real Cricket</span>
          <span className="footer-version">v{VERSION}</span>
        </div>

        <div className="footer-links">
          <a className="footer-link" href="/" aria-label="Home">
            Home
          </a>
          <span className="footer-sep" aria-hidden="true" />
          <a
            className="footer-link"
            href="/hall-of-fame"
            aria-label="Hall of Fame"
          >
            Hall of Fame
          </a>
          <span className="footer-sep" aria-hidden="true" />
          <a className="footer-link" href="/create" aria-label="New Tournament">
            New Tournament
          </a>
        </div>

        <div className="footer-copy">
          &copy; {BUILD_YEAR} Real Cricket · Built for the rivalry
        </div>
      </div>
    </footer>
  );
}
