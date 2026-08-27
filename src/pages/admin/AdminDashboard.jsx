import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { fetchOrders, setOrderStatus, deleteOrder } from '../../lib/api';
import { downloadOrderSheet } from '../../lib/exportSheet';
import { cedis, prettyDate } from '../../lib/format';
import { NETWORKS } from '../../lib/data';
import { useToast } from '../../components/Toast.jsx';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'paid', label: 'New / Paid' },
  { key: 'processing', label: 'Processing' },
  { key: 'done', label: 'Loaded' },
  { key: 'pending', label: 'Awaiting payment' },
];

const NEXT_ACTION = {
  paid: { to: 'processing', label: 'Start' },
  processing: { to: 'done', label: 'Mark Loaded' },
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('paid');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchOrders({ status: filter });
    setLoading(false);
    if (!res.ok) return toast(`⚠️ ${res.error}`, 'error');
    setOrders(res.orders);
  }, [filter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: refresh when a new order is inserted.
  useEffect(() => {
    const channel = supabase
      .channel('orders-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [load]);

  async function advance(order) {
    const next = NEXT_ACTION[order.status];
    if (!next) return;
    const res = await setOrderStatus(order.id, next.to);
    if (!res.ok) return toast(`⚠️ ${res.error}`, 'error');
    toast(`✅ ${order.phone} → ${next.to}`, 'success');
    load();
  }

  // Manually set an order to ANY status — including reverting a mistake
  // (e.g. Loaded → Processing). Confirms first to avoid accidental changes.
  async function changeStatus(order, newStatus) {
    if (!newStatus || newStatus === order.status) return;
    const label = STATUS[newStatus]?.text || newStatus;
    if (!window.confirm(`Change ${order.phone} (${order.data}) status to “${label}”?`)) return;
    const res = await setOrderStatus(order.id, newStatus);
    if (!res.ok) return toast(`⚠️ ${res.error}`, 'error');
    toast(`✅ ${order.phone} → ${label}`, 'success');
    load();
  }

  async function removeOrder(order) {
    if (!window.confirm(`Delete order ${order.reference} (${order.phone})? This cannot be undone.`)) return;
    const res = await deleteOrder(order.id);
    if (!res.ok) return toast(`⚠️ ${res.error}`, 'error');
    toast('🗑 Order deleted', 'success');
    load();
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate('/admin/login', { replace: true });
  }

  const pendingCount = orders.filter((o) => o.status === 'paid').length;
  const revenue = orders.reduce((s, o) => s + Number(o.price), 0);

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="nav-logo">
          <span className="nav-logo-icon">A</span>
          <span className="nav-logo-text">Anasdata Admin</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link className="nav-link active" to="/admin">Orders</Link>
          <Link className="nav-link" to="/admin/bundles">Bundles</Link>
          <button className="btn-secondary" onClick={load}>↻ Refresh</button>
          <button className="btn-secondary" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <div className="admin-body">
        <div className="admin-stats">
          <StatCard value={orders.length} label={`Orders (${filter})`} />
          <StatCard value={pendingCount} label="Awaiting loading" accent />
          <StatCard value={cedis(revenue)} label="Revenue (shown)" />
        </div>

        <div className="admin-toolbar">
          <div className="admin-filters">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={`chip ${filter === f.key ? 'active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            className="btn-primary"
            onClick={() => {
              // Export only orders that have actually been paid for — never
              // pending (unpaid) or failed ones.
              const paid = orders.filter(
                (o) => o.status === 'paid' || o.status === 'processing' || o.status === 'done'
              );
              if (paid.length === 0) return toast('No paid orders to export', 'info');
              downloadOrderSheet(paid, `paid-orders-${new Date().toISOString().slice(0, 10)}.csv`);
              toast(`⬇️ Exported ${paid.length} paid order${paid.length === 1 ? '' : 's'}`, 'success');
            }}
          >
            ⬇️ Download Paid Orders
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: 60 }}>
            <span className="spinner" />
          </div>
        ) : orders.length === 0 ? (
          <div className="no-bundles">
            <div className="no-bundles-icon">📭</div>
            <h3>No orders here</h3>
            <p>New paid orders will appear automatically.</p>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Ordered</th>
                  <th>Via</th>
                  <th>Phone</th>
                  <th>Package</th>
                  <th>Network</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Action / Change</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const net = NETWORKS[o.network];
                  const next = NEXT_ACTION[o.status];
                  return (
                    <tr key={o.id}>
                      <td className="muted">{prettyDate(o.created_at)}</td>
                      <td title={o.channel === 'ussd' ? 'USSD' : 'Website'}>
                        {o.channel === 'ussd' ? '📟' : '🌐'}
                      </td>
                      <td className="mono strong">{o.phone}</td>
                      <td>
                        <div className="strong">{o.data}</div>
                        <div className="muted small">{o.bundle_name}</div>
                      </td>
                      <td>
                        <span className={`history-network-pill ${o.network}`}>
                          {net ? net.name : o.network}
                        </span>
                      </td>
                      <td className="strong">{cedis(o.price)}</td>
                      <td><StatusBadge status={o.status} /></td>
                      <td>
                        <div className="admin-actions">
                          {next && (
                            <button className="btn-mini" onClick={() => advance(o)}>{next.label}</button>
                          )}
                          <select
                            className="status-select"
                            value={o.status}
                            onChange={(e) => changeStatus(o, e.target.value)}
                            title="Change or revert status"
                          >
                            <option value="pending">Awaiting payment</option>
                            <option value="paid">New / Paid</option>
                            <option value="processing">Processing</option>
                            <option value="done">Loaded</option>
                            <option value="failed">Failed</option>
                          </select>
                          <button className="btn-del" onClick={() => removeOrder(o)} title="Delete order">
                            🗑
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

const StatCard = ({ value, label, accent }) => (
  <div className={`admin-stat ${accent ? 'accent' : ''}`}>
    <div className="admin-stat-value">{value}</div>
    <div className="admin-stat-label">{label}</div>
  </div>
);

const STATUS = {
  pending: { text: 'Awaiting payment', cls: 'processing' },
  paid: { text: 'New', cls: 'pending' },
  processing: { text: 'Processing', cls: 'processing' },
  done: { text: 'Loaded', cls: 'success' },
  failed: { text: 'Failed', cls: 'expired' },
};

const StatusBadge = ({ status }) => {
  const s = STATUS[status] || STATUS.paid;
  return <span className={`history-status-badge ${s.cls}`}>{s.text}</span>;
};
