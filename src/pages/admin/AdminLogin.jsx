import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, isSupabaseReady } from '../../lib/supabase';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSupabaseReady) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate('/admin', { replace: true });
    });
  }, [navigate]);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError(error.message);
    navigate('/admin', { replace: true });
  }

  return (
    <div className="admin-shell" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <form className="admin-card admin-login" onSubmit={handleLogin}>
        <div className="nav-logo" style={{ justifyContent: 'center', marginBottom: 4 }}>
          <span className="nav-logo-icon">A</span>
          <span className="nav-logo-text">Anasdata</span>
        </div>
        <h2 style={{ textAlign: 'center' }}>Admin Login</h2>
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: 20 }}>
          Owner access only.
        </p>

        {!isSupabaseReady && (
          <div className="banner-warn">Backend not configured — see README.</div>
        )}

        <label className="form-label">Email</label>
        <input
          className="form-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label className="form-label" style={{ marginTop: 14 }}>Password</label>
        <input
          className="form-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <div className="form-error show" style={{ marginTop: 12 }}>{error}</div>}

        <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 20 }} disabled={busy}>
          {busy ? <span className="spinner" /> : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
