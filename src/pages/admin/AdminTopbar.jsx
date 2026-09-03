import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const LINKS = [
  { to: '/admin', label: 'Orders' },
  { to: '/admin/transactions', label: 'Transactions' },
  { to: '/admin/customers', label: 'Numbers' },
  { to: '/admin/bundles', label: 'Bundles' },
];

export default function AdminTopbar({ onRefresh }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // Close the drawer whenever the route changes.
  useEffect(() => setOpen(false), [pathname]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate('/admin/login', { replace: true });
  }

  return (
    <header className="admin-topbar">
      <div className="nav-logo">
        <span className="nav-logo-icon">A</span>
        <span className="nav-logo-text">Anasdata Admin</span>
      </div>

      {/* Desktop: inline links */}
      <div className="admin-nav-desktop">
        {LINKS.map((l) => (
          <Link key={l.to} className={`nav-link ${pathname === l.to ? 'active' : ''}`} to={l.to}>
            {l.label}
          </Link>
        ))}
        {onRefresh && <button className="btn-secondary" onClick={onRefresh}>↻ Refresh</button>}
        <button className="btn-secondary" onClick={signOut}>Sign out</button>
      </div>

      {/* Mobile: hamburger → slide-out drawer */}
      <button
        type="button"
        className={`nav-hamburger admin-burger ${open ? 'active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu"
        aria-expanded={open}
      >
        <span></span><span></span><span></span>
      </button>

      {open && <div className="nav-overlay" onClick={() => setOpen(false)} />}

      <nav className={`admin-drawer ${open ? 'open' : ''}`}>
        {LINKS.map((l) => (
          <Link
            key={l.to}
            className={`admin-drawer-link ${pathname === l.to ? 'active' : ''}`}
            to={l.to}
          >
            {l.label}
          </Link>
        ))}
        {onRefresh && (
          <button className="admin-drawer-link" onClick={() => { onRefresh(); setOpen(false); }}>
            ↻ Refresh
          </button>
        )}
        <button className="admin-drawer-link danger" onClick={signOut}>Sign out</button>
      </nav>
    </header>
  );
}
