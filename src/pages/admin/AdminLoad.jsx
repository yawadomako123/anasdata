import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { fetchOrders, setOrderStatus, markOrdersStatus } from '../../lib/api';
import { downloadOrderSheet } from '../../lib/exportSheet';
import { NETWORKS } from '../../lib/data';
import { prettyDate } from '../../lib/format';
import { useToast } from '../../components/Toast.jsx';
import AdminTopbar from './AdminTopbar.jsx';

export default function AdminLoad() {
  const toast = useToast();
  const [toLoad, setToLoad] = useState([]);
  const [supplying, setSupplying] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [a, b] = await Promise.all([
      fetchOrders({ status: 'processing' }),
      fetchOrders({ status: 'exported' }),
    ]);
    setLoading(false);
    if (a.ok) setToLoad(a.orders);
    if (b.ok) setSupplying(b.orders);
    if (!a.ok) toast(`⚠️ ${a.error}`, 'error');
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Refresh when any order changes (a new paid order lands, etc.)
  useEffect(() => {
    const ch = supabase
      .channel('load-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [load]);

  async function exportAndStart() {
    if (toLoad.length === 0) return toast('Nothing to export', 'info');
    if (!window.confirm(`Export ${toLoad.length} order(s) and move them to Supplying?`)) return;
    downloadOrderSheet(toLoad, `to-load-${new Date().toISOString().slice(0, 10)}.csv`);
    const res = await markOrdersStatus(toLoad.map((o) => o.id), 'exported');
    if (!res.ok) return toast(`⚠️ ${res.error}`, 'error');
    toast(`⬇️ Exported ${toLoad.length} — now Supplying`, 'success');
    load();
  }

  async function markLoaded(order) {
    const res = await setOrderStatus(order.id, 'done');
    if (!res.ok) return toast(`⚠️ ${res.error}`, 'error');
    toast(`✅ ${order.phone} loaded`, 'success');
    load();
  }

  async function markAllLoaded() {
    if (supplying.length === 0) return;
    if (!window.confirm(`Mark all ${supplying.length} supplying order(s) as Loaded?`)) return;
    const res = await markOrdersStatus(supplying.map((o) => o.id), 'done');
    if (!res.ok) return toast(`⚠️ ${res.error}`, 'error');
    toast(`✅ ${supplying.length} marked loaded`, 'success');
    load();
  }

  return (
    <div className="admin-shell">
      <AdminTopbar onRefresh={load} />
      <div className="admin-body">
        {loading ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: 60 }}>
            <span className="spinner" />
          </div>
        ) : (
          <>
            {/* To Load */}
            <div className="admin-toolbar">
              <h3 style={{ margin: 0 }}>To Load <span className="muted">({toLoad.length})</span></h3>
              <button className="btn-primary" onClick={exportAndStart} disabled={toLoad.length === 0}>
                ⬇️ Export &amp; Start Supplying
              </button>
            </div>
            <OrderTable orders={toLoad} empty="No paid orders waiting to load." />

            {/* Supplying */}
            <div className="admin-toolbar" style={{ marginTop: 32 }}>
              <h3 style={{ margin: 0 }}>Supplying <span className="muted">({supplying.length})</span></h3>
              {supplying.length > 0 && (
                <button className="btn-secondary" onClick={markAllLoaded}>✅ Mark all loaded</button>
              )}
            </div>
            <OrderTable orders={supplying} empty="Nothing being supplied right now." action={markLoaded} />
          </>
        )}
      </div>
    </div>
  );
}

function OrderTable({ orders, empty, action }) {
  if (orders.length === 0) {
    return <div className="muted small" style={{ padding: '12px 4px' }}>{empty}</div>;
  }
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Phone Number</th>
            <th>Data</th>
            <th>Network</th>
            <th>Ordered</th>
            {action && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const net = NETWORKS[o.network];
            return (
              <tr key={o.id}>
                <td className="mono strong">{o.phone}</td>
                <td className="strong">{o.bundle_name}</td>
                <td>
                  <span className={`history-network-pill ${o.network}`}>{net ? net.name : o.network}</span>
                </td>
                <td className="muted small">{prettyDate(o.created_at)}</td>
                {action && (
                  <td>
                    <button className="btn-mini" onClick={() => action(o)}>Mark Loaded</button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
