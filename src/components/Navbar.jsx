import { useState, useEffect } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Always close the menu when the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const close = () => setMenuOpen(false);

  return (
    <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
      <Link to="/" className="nav-logo" onClick={close}>
        <span className="nav-logo-icon">A</span>
        <span className="nav-logo-text">Anasdata</span>
      </Link>

      {/* Tap-anywhere backdrop to dismiss the open mobile menu. */}
      {menuOpen && <div className="nav-overlay" onClick={close} />}

      <div className={`nav-links ${menuOpen ? 'open' : ''}`}>
        <NavLink to="/" end className="nav-link" onClick={close}>Home</NavLink>
        <NavLink to="/bundles" className="nav-link" onClick={close}>Buy Bundles</NavLink>
        <NavLink to="/track" className="nav-link" onClick={close}>Track Order</NavLink>
        <button className="nav-cta" onClick={() => { navigate('/bundles'); close(); }}>
          Get Data Now
        </button>
      </div>

      <button
        type="button"
        className={`nav-hamburger ${menuOpen ? 'active' : ''}`}
        onClick={() => setMenuOpen((o) => !o)}
        aria-label="Toggle menu"
        aria-expanded={menuOpen}
      >
        <span></span><span></span><span></span>
      </button>
    </nav>
  );
}
