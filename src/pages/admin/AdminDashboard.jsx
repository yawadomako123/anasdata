import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { fetchAllOrders, markOrdersStatus } from '../../lib/api';
import { downloadOrderSheet } from '../../lib/exportSheet';
import { useToast } from '../../components/Toast.jsx';
import AdminTopbar from './AdminTopbar.jsx';

const NETS = [
  { id: 'mtn', name: 'MTN' },
  { id: 'telecel', name: 'Telecel' },
];

export default function AdminDashboard() {
  const toast = useToast();
  const [orders, setOrders] = useState([]); // genuinely PAID, not yet downloaded
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const reqId = useRef(0);

  const load = useCallback(async () => {
    // A bulk update fires one realtime event per row, so several loads can be
    // in flight at once. Only the newest one may write to state, otherwise a
    // slow earlier response can overwrite fresh data and orders reappear.
    const mine = ++reqId.current;
    setLoading(true);
    // "To load" = genuinely PAID and not yet downloaded. Payment status only
    // becomes processing/paid after TelaPay confirms (code 000), so failed and
    // pending are never included.
    //
    // 'exported' is deliberately NOT here. It is a legacy status from the old
    // "Export & Start Supplying" screen and means the order was ALREADY
    // downloaded and handed off. Listing it here put finished orders back into
    // the queue, so they got downloaded a second time.
    const [a, b] = await Promise.all([
      fetchAllOrders({ status: 'processing' }),
      fetchAllOrders({ status: 'paid' }),
    ]);
    if (mine !== reqId.current) return; // a newer load already answered
    setLoading(false);
    if (!a.ok) return toast(`⚠️ ${a.error}`, 'error');
    setOrders([...(a.orders || []), ...(b.ok ? b.orders : [])]);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Refresh live when a new paid order lands.
  useEffect(() => {
    const ch = supabase
      .channel('orders-cards')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [load]);

  const count = (id) => orders.filter((o) => o.network === id).length;

  async function downloadNetwork(net) {
    const list = orders.filter((o) => o.network === net.id);
    if (list.length === 0) return toast(`No paid ${net.name} orders to download`, 'info');
    if (!window.confirm(
      `Download ${list.length} ${net.name} order(s) and mark them done?\nThey move to Transactions and won't appear here again.`
    )) return;

    setBusy(net.id);
    // Mark them done FIRST. If this fails the admin must not walk away with a
    // sheet for orders that are still sitting in the queue — that is how the
    // same numbers ended up being loaded twice.
    const res = await markOrdersStatus(list.map((o) => o.id), 'done');
    setBusy('');
    if (!res.ok) {
      toast(`⚠️ ${res.error}`, 'error');
      return load(); // show the real state of the queue
    }
    downloadOrderSheet(list, `${net.id}-orders-${new Date().toISOString().slice(0, 10)}.csv`);
    toast(`⬇️ ${list.length} ${net.name} order(s) downloaded`, 'success');
    load();
  }

  return (
    <div className="admin-shell">
      <AdminTopbar onRefresh={load} />
      <div className="admin-body">
        <h2 style={{ margin: '0 0 6px' }}>Orders to Load</h2>
        <p className="muted small" style={{ margin: '0 0 22px' }}>
          Tap a network to download its paid orders (number + data). Downloaded orders move to
          Transactions and won't show here again.
        </p>

        {loading ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: 60 }}>
            <span className="spinner" />
          </div>
        ) : (
          <>
            <div className="net-cards">
              {NETS.map((net) => {
                const n = count(net.id);
                return (
                  <button
                    key={net.id}
                    className={`net-card ${net.id}`}
                    onClick={() => downloadNetwork(net)}
                    disabled={busy === net.id || n === 0}
                  >
                    <div className="net-card-head">
                      <span className="net-card-name">{net.name}</span>
                      <span className="net-card-count">{n}</span>
                    </div>
                    <div className="net-card-sub">paid orders to load</div>
                    <div className="net-card-cta">
                      {busy === net.id
                        ? 'Downloading…'
                        : n === 0
                        ? 'Nothing to download'
                        : '⬇️ Download & mark done'}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="muted small" style={{ marginTop: 18 }}>
              Total paid orders waiting: <strong>{orders.length}</strong>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
