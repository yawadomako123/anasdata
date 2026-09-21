import { useCallback, useEffect, useState } from 'react';
import {
  fetchCheckerStock,
  createChecker,
  updateChecker,
  uploadCheckerPins,
  parsePinCsv,
} from '../../lib/checkers';
import { cedis } from '../../lib/format';
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

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchCheckerStock();
    setLoading(false);
    if (!res.ok) return toast(`⚠️ ${res.error}`, 'error');
    setTypes(res.types || []);
  }, [toast]);

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
          Checkers sell themselves — once payment lands the PIN is texted automatically. Your only
          job is keeping stock topped up.
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
