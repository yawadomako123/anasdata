import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const LINKS = [
  { to: '/admin', label: 'Orders' },
  { to: '/admin/load', label: 'Load Queue' },
  { to: '/admin/customers', label: 'Customers' },
  { to: '/admin/bundles', label: 'Bundles' },
];

export default function AdminTopbar({ onRefresh }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();

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
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {LINKS.map((l) => (
          <Link key={l.to} className={`nav-link ${pathname === l.to ? 'active' : ''}`} to={l.to}>
            {l.label}
          </Link>
        ))}
        {onRefresh && <button className="btn-secondary" onClick={onRefresh}>↻ Refresh</button>}
        <button className="btn-secondary" onClick={signOut}>Sign out</button>
      </div>
    </header>
  );
}
