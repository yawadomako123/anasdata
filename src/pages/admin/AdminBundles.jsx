import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { NETWORKS } from '../../lib/data';
import { fetchAllBundles, createBundle, deleteBundle, setBundleActive } from '../../lib/bundles';
import { cedis } from '../../lib/format';
import { useToast } from '../../components/Toast.jsx';

const EMPTY = { network: 'mtn', name: '', data: '', dataValue: '', price: '', badge: '' };

export default function AdminBundles() {
  const navigate = useNavigate();
  const toast = useToast();
  const [bundles, setBundles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchAllBundles();
    setLoading(false);
    if (!res.ok) return toast(`⚠️ ${res.error}`, 'error');
    setBundles(res.bundles);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function add(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.data.trim() || form.price === '') {
      return toast('⚠️ Fill in name, data size and price', 'error');
    }
    setSaving(true);
    const res = await createBundle(form);
    setSaving(false);
    if (!res.ok) return toast(`⚠️ ${res.error}`, 'error');
    toast(`✅ Added ${res.bundle.name}`, 'success');
    setForm(EMPTY);
    load();
  }

  async function remove(b) {
    if (!window.confirm(`Delete "${b.name}"? This can't be undone.`)) return;
    const res = await deleteBundle(b.id);
    if (!res.ok) return toast(`⚠️ ${res.error}`, 'error');
    toast(`🗑️ Deleted ${b.name}`, 'success');
    load();
  }

  async function toggle(b) {
    const res = await setBundleActive(b.id, !b.active);
    if (!res.ok) return toast(`⚠️ ${res.error}`, 'error');
    load();
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate('/admin/login', { replace: true });
  }

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="nav-logo">
          <span className="nav-logo-icon">A</span>
          <span className="nav-logo-text">Anasdata Admin</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link className="nav-link" to="/admin">Orders</Link>
          <Link className="nav-link active" to="/admin/bundles">Bundles</Link>
          <button className="btn-secondary" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <div className="admin-body">
        {/* Add bundle */}
        <h3 style={{ marginBottom: 12 }}>Add a bundle</h3>
        <div style={{ marginBottom: 24 }}>
          <form className="filters-bar" onSubmit={add} style={{ marginBottom: 0 }}>
            <div className="filter-group">
              <div className="filter-label">Network</div>
              <select className="filter-select" value={form.network} onChange={(e) => set('network', e.target.value)}>
                {Object.values(NETWORKS).map((n) => (
                  <option key={n.id} value={n.id}>{n.fullName}</option>
                ))}
              </select>
            </div>
            <div className="filter-group" style={{ flex: 1, minWidth: 160 }}>
              <div className="filter-label">Name</div>
              <input className="filter-select" placeholder="e.g. MTN 10GB" value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div className="filter-group">
              <div className="filter-label">Data size</div>
              <input className="filter-select" placeholder="e.g. 10GB" value={form.data} onChange={(e) => set('data', e.target.value)} />
            </div>
            <div className="filter-group">
              <div className="filter-label">GB value (sort)</div>
              <input className="filter-select" type="number" step="0.01" placeholder="10" value={form.dataValue} onChange={(e) => set('dataValue', e.target.value)} />
            </div>
            <div className="filter-group">
              <div className="filter-label">Price (GHS)</div>
              <input className="filter-select" type="number" step="0.01" placeholder="50.00" value={form.price} onChange={(e) => set('price', e.target.value)} />
            </div>
            <div className="filter-group">
              <div className="filter-label">Badge (optional)</div>
              <input className="filter-select" placeholder="Popular" value={form.badge} onChange={(e) => set('badge', e.target.value)} />
            </div>
            <div className="filter-group" style={{ justifyContent: 'flex-end' }}>
              <button className="btn-primary" type="submit" disabled={saving}>
                {saving ? <span className="spinner" /> : '+ Add bundle'}
              </button>
            </div>
          </form>
        </div>

        {/* List */}
        {loading ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: 60 }}>
            <span className="spinner" />
          </div>
        ) : bundles.length === 0 ? (
          <div className="no-bundles">
            <div className="no-bundles-icon">📦</div>
            <h3>No bundles yet</h3>
            <p>Add your first bundle using the form above.</p>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Network</th>
                  <th>Name</th>
                  <th>Data</th>
                  <th>Price</th>
                  <th>Badge</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bundles.map((b) => {
                  const net = NETWORKS[b.network];
                  return (
                    <tr key={b.id} style={{ opacity: b.active ? 1 : 0.5 }}>
                      <td>
                        <span className={`history-network-pill ${b.network}`}>{net ? net.name : b.network}</span>
                      </td>
                      <td className="strong">{b.name}</td>
                      <td>{b.data}</td>
                      <td className="strong">{cedis(b.price)}</td>
                      <td className="muted small">{b.badge || '—'}</td>
                      <td>
                        <span className={`history-status-badge ${b.active ? 'success' : 'expired'}`}>
                          {b.active ? 'Active' : 'Hidden'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn-mini" onClick={() => toggle(b)}>
                            {b.active ? 'Hide' : 'Show'}
                          </button>
                          <button
                            className="btn-mini"
                            onClick={() => remove(b)}
                            style={{ background: 'var(--error)' }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
