import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase, isSupabaseReady } from '../../lib/supabase';

export default function RequireAuth({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still checking

  useEffect(() => {
    if (!isSupabaseReady) {
      setSession(null);
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!isSupabaseReady) {
    return (
      <div className="admin-shell">
        <div className="admin-card" style={{ maxWidth: 520, margin: '80px auto' }}>
          <h2>Backend not configured</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: 10 }}>
            Add <code>VITE_PUBLIC_SUPABASE_URL</code> and{' '}
            <code>VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to your <code>.env</code> file, then
            restart the dev server. See the README.
          </p>
        </div>
      </div>
    );
  }

  if (session === undefined) {
    return (
      <div className="admin-shell" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <span className="spinner" />
      </div>
    );
  }

  if (!session) return <Navigate to="/admin/login" replace />;

  return children;
}
