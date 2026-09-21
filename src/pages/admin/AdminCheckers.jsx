import { useCallback, useEffect, useState } from 'react';
import {
  fetchCheckerStock,
  createChecker,
  updateChecker,
  uploadCheckerPins,
  fetchUndeliveredCheckers,
  revealCheckerPin,
  parsePinCsv,
} from '../../lib/checkers';
import { cedis, prettyDate } from '../../lib/format';
import { useToast } from '../../components/Toast.jsx';
import AdminTopbar from './AdminTopbar.jsx';

const LOW_STOCK = 5;
const EMPTY = { name: '', description: '', price: '', sortOrder: '' };

export default function AdminCheckers() {
  const toast = useToast();
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  // PIN upload
  const [uploadFor, setUploadFor] = useState('');
  const [csv, setCsv] = useState('');
  const [uploading, setUploading] = useState(false);

  // Paid but not yet collected by the customer
  const [uncollected, setUncollected] = useState([]);
  const [revealed, setRevealed] = useState({});

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    const [res, un] = await Promise.all([fetchCheckerStock(), fetchUndeliveredCheckers()]);
    setLoading(false);
    if (!res.ok) return toast(`⚠️ ${res.error}`, 'error');
    setTypes(res.types || []);
    if (un.ok) setUncollected(un.orders || []);
  }, [toast]);

  // Nothing is pushed to the customer, so an order nobody has opened is the
  // thing to watch: they paid and may not know how to collect.
  async function reveal(orderId) {
    const res = await revealCheckerPin(orderId);
    if (!res.ok) return toast(`⚠️ ${res.error}`, 'error');
    setRevealed((r) => ({ ...r, [orderId]: res.voucher }));
  }

  useEffect(() => { load(); }, [load]);

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return toast('⚠️ Name is required', 'error');
    if (!form.price) return toast('⚠️ Price is required', 'error');
    setSaving(true);
    const res = await createChecker({
      name: form.name,
      description: form.description,
      price: form.price,
      sortOrder: form.sortOrder,
    });
    setSaving(false);
    if (!res.ok) return toast(`⚠️ ${res.error}`, 'error');
    toast('✅ Checker added', 'success');
    setForm(EMPTY);
    load();
  }

  async function toggleActive(t) {
    const res = await updateChecker(t.id, { active: !t.active });
    if (!res.ok) return toast(`⚠️ ${res.error}`, 'error');
    toast(t.active ? 'Hidden from the shop' : 'Now on sale', 'success');
    load();
  }

  async function doUpload() {
    if (!uploadFor) return toast('⚠️ Pick a checker first', 'error');
    const { rows, errors } = parsePinCsv(csv);
    if (errors.length) toast(`⚠️ ${errors.length} line(s) skipped — ${errors[0]}`, 'error', 6000);
    if (rows.length === 0) return toast('⚠️ Nothing to upload', 'error');

    setUploading(true);
    const res = await uploadCheckerPins(uploadFor, rows);
    setUploading(false);
    if (!res.ok) return toast(`⚠️ ${res.error}`, 'error', 7000);

    const dupes = res.submitted - res.added;
    toast(
      `✅ ${res.added} PIN(s) added${dupes > 0 ? ` — ${dupes} already in stock, skipped` : ''}`,
      'success',
      6000
    );
    setCsv('');
    load();
  }

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result || ''));
    reader.readAsText(file);
  }

  const parsed = parsePinCsv(csv);

  return (
    <div className="admin-shell">
      <AdminTopbar onRefresh={load} />

      <div className="admin-body">
        <h2 style={{ margin: '0 0 6px' }}>Checkers</h2>
        <p className="muted small" style={{ margin: '0 0 22px' }}>
          Checkers sell themselves — once payment lands the customer sees their PIN on screen,
          and can look it up again via Track Order or by dialling in. Your only job is keeping
          stock topped up.
        </p>

        {/* Add a product */}
        <h3 style={{ marginBottom: 12 }}>Add a checker</h3>
        <form className="filters-bar" onSubmit={submit} style={{ marginBottom: 26 }}>
          <div className="filter-group" style={{ flex: 1, minWidth: 160 }}>
            <div className="filter-label">Name</div>
            <input className="filter-select" placeholder="e.g. BECE Results Checker"
              value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="filter-group" style={{ flex: 1, minWidth: 160 }}>
            <div className="filter-label">Description (optional)</div>
            <input className="filter-select" placeholder="e.g. 2026 BECE"
              value={form.description} onChange={(e) => set('description', e.target.value)} />
          </div>
          <div className="filter-group">
            <div className="filter-label">Price (GHS)</div>
            <input className="filter-select" type="number" step="0.01" placeholder="20.00"
              value={form.price} onChange={(e) => set('price', e.target.value)} />
          </div>
          <div className="filter-group">
            <div className="filter-label">Order</div>
            <input className="filter-select" type="number" placeholder="1"
              value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
          </div>
          <div className="filter-group" style={{ justifyContent: 'flex-end' }}>
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? <span className="spinner" /> : '+ Add checker'}
            </button>
          </div>
        </form>

        {/* Stock */}
        <h3 style={{ marginBottom: 12 }}>Stock</h3>
        {loading ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
            <span className="spinner" />
          </div>
        ) : types.length === 0 ? (
          <div className="muted small" style={{ padding: '12px 4px' }}>
            No checkers yet — add one above, then upload its PINs.
          </div>
        ) : (
          <div className="admin-table-wrap" style={{ marginBottom: 26 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Checker</th><th>Price</th><th>Available</th>
                  <th>Held</th><th>Sold</th><th>On sale</th><th></th>
                </tr>
              </thead>
              <tbody>
                {types.map((t) => {
                  const s = t.stock || { available: 0, reserved: 0, sold: 0 };
                  const low = s.available === 0 ? 'out' : s.available <= LOW_STOCK ? 'low' : '';
                  return (
                    <tr key={t.id}>
                      <td>
                        <div className="strong">{t.name}</div>
                        {t.description && <div className="muted small">{t.description}</div>}
                      </td>
                      <td className="strong">{cedis(Number(t.price))}</td>
                      <td>
                        <span className={`history-status-badge ${low === 'out' ? 'expired' : low === 'low' ? 'pending' : 'success'}`}>
                          {s.available}{low === 'out' ? ' — out' : low === 'low' ? ' — low' : ''}
                        </span>
                      </td>
                      <td className="muted">{s.reserved}</td>
                      <td className="muted">{s.sold}</td>
                      <td>{t.active ? 'Yes' : 'No'}</td>
                      <td>
                        <button className="btn-secondary" onClick={() => toggleActive(t)}>
                          {t.active ? 'Hide' : 'Show'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Not collected yet */}
        <h3 style={{ marginBottom: 6 }}>
          Not collected yet {uncollected.length > 0 && <span className="muted">({uncollected.length})</span>}
        </h3>
        <p className="muted small" style={{ margin: '0 0 12px' }}>
          Paid for, but the customer hasn't opened their PIN. They can get it from Track Order
          using the reference, or by dialling in and picking <strong>My checkers</strong>. Reveal
          it here if they call you stuck.
        </p>
        {uncollected.length === 0 ? (
          <div className="muted small" style={{ padding: '4px 4px 22px' }}>
            Nothing outstanding — every paid checker has been collected.
          </div>
        ) : (
          <div className="admin-table-wrap" style={{ marginBottom: 26 }}>
            <table className="admin-table">
              <thead>
                <tr><th>Date</th><th>Checker</th><th>Phone</th><th>Reference</th><th>PIN</th></tr>
              </thead>
              <tbody>
                {uncollected.map((o) => (
                  <tr key={o.id}>
                    <td className="muted small">{prettyDate(o.created_at)}</td>
                    <td>{o.bundle_name}</td>
                    <td className="mono strong">{o.phone}</td>
                    <td className="mono small">{o.reference}</td>
                    <td>
                      {revealed[o.id] ? (
                        <span className="mono strong">
                          {revealed[o.id].serial} / {revealed[o.id].pin}
                        </span>
                      ) : (
                        <button className="btn-secondary" onClick={() => reveal(o.id)}>Reveal</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Upload PINs */}
        <h3 style={{ marginBottom: 6 }}>Upload PINs</h3>
        <p className="muted small" style={{ margin: '0 0 12px' }}>
          One per line as <code>serial,pin</code>. A header row is ignored, and re-uploading the
          same file adds nothing — serials already in stock are skipped.
        </p>
        <div className="filters-bar" style={{ marginBottom: 12 }}>
          <div className="filter-group" style={{ flex: 1, minWidth: 200 }}>
            <div className="filter-label">Checker</div>
            <select className="filter-select" value={uploadFor} onChange={(e) => setUploadFor(e.target.value)}>
              <option value="">Select…</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="filter-group" style={{ flex: 1, minWidth: 200 }}>
            <div className="filter-label">CSV file</div>
            <input className="filter-select" type="file" accept=".csv,text/csv,text/plain" onChange={onFile} />
          </div>
        </div>
        <textarea
          className="form-input"
          style={{ width: '100%', minHeight: 140, fontFamily: 'monospace' }}
          placeholder={'serial,pin\n123456789,0987654321'}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />
        <div className="admin-toolbar" style={{ marginTop: 12 }}>
          <div className="muted small">
            {parsed.rows.length} PIN(s) ready
            {parsed.errors.length > 0 && ` · ${parsed.errors.length} line(s) will be skipped`}
          </div>
          <button className="btn-primary" onClick={doUpload} disabled={uploading || parsed.rows.length === 0}>
            {uploading ? <span className="spinner" /> : `⬆️ Upload ${parsed.rows.length} PIN(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
