import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { fetchAllOrders } from '../../lib/api';
import { downloadOrderSheet } from '../../lib/exportSheet';
import { cedis, prettyDate } from '../../lib/format';
import { NETWORKS } from '../../lib/data';
import { useToast } from '../../components/Toast.jsx';
import AdminTopbar from './AdminTopbar.jsx';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'processing', label: 'To Load' },
  { key: 'done', label: 'Loaded' },
  { key: 'failed', label: 'Failed' },
  { key: 'pending', label: 'Awaiting payment' },
];

const STATUS = {
  pending: { text: 'Awaiting payment', cls: 'pending' },
  paid: { text: 'Paid', cls: 'processing' },
  processing: { text: 'To load', cls: 'processing' },
  exported: { text: 'Supplying', cls: 'processing' },
  done: { text: 'Loaded', cls: 'success' },
  failed: { text: 'Failed', cls: 'expired' },
};
const PAID = new Set(['paid', 'processing', 'exported', 'done']);

export default function AdminTransactions() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchAllOrders({ status: filter });
    setLoading(false);
    if (!res.ok) return toast(`⚠️ ${res.error}`, 'error');
    setRows(res.orders);
  }, [filter, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = supabase
      .channel('txn-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [load]);

  const paidRevenue = rows.filter((o) => PAID.has(o.status)).reduce((s, o) => s + Number(o.price), 0);

  return (
    <div className="admin-shell">
      <AdminTopbar onRefresh={load} />
      <div className="admin-body">
        <h2 style={{ margin: '0 0 14px' }}>Transactions</h2>

        <div className="admin-stats">
          <div className="admin-stat"><div className="admin-stat-value">{rows.length}</div><div className="admin-stat-label">Transactions ({filter})</div></div>
          <div className="admin-stat accent"><div className="admin-stat-value">{cedis(paidRevenue)}</div><div className="admin-stat-label">Paid revenue (shown)</div></div>
        </div>

        <div className="admin-toolbar">
          <div className="admin-filters">
            {FILTERS.map((f) => (
              <button key={f.key} className={`chip ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
                {f.label}
              </button>
            ))}
          </div>
          <button
            className="btn-secondary"
            onClick={() => {
              if (rows.length === 0) return toast('Nothing to download', 'info');
              downloadOrderSheet(rows, `transactions-${filter}-${new Date().toISOString().slice(0, 10)}.csv`);
              toast(`⬇️ ${rows.length} rows downloaded`, 'success');
            }}
          >
            ⬇️ Download shown
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: 60 }}><span className="spinner" /></div>
        ) : rows.length === 0 ? (
          <div className="muted small" style={{ padding: '12px 4px' }}>No transactions here.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th><th>Via</th><th>Phone</th><th>Package</th>
                  <th>Network</th><th>Amount</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const net = NETWORKS[o.network];
                  const s = STATUS[o.status] || STATUS.pending;
                  return (
                    <tr key={o.id}>
                      <td className="muted small">{prettyDate(o.created_at)}</td>
                      <td title={o.channel === 'ussd' ? 'USSD' : 'Website'}>{o.channel === 'ussd' ? '📟' : '🌐'}</td>
                      <td className="mono strong">{o.phone}</td>
                      <td>{o.bundle_name}</td>
                      <td><span className={`history-network-pill ${o.network}`}>{net ? net.name : o.network}</span></td>
                      <td className="strong">{cedis(o.price)}</td>
                      <td><span className={`history-status-badge ${s.cls}`}>{s.text}</span></td>
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
