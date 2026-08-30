import { useCallback, useEffect, useState } from 'react';
import { fetchOrders } from '../../lib/api';
import { downloadPhoneList } from '../../lib/exportSheet';
import { useToast } from '../../components/Toast.jsx';
import AdminTopbar from './AdminTopbar.jsx';

// "Paid" = anyone whose payment went through, at any fulfillment stage.
const PAID = new Set(['paid', 'processing', 'exported', 'done']);

export default function AdminCustomers() {
  const toast = useToast();
  const [numbers, setNumbers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchOrders({ status: 'all' });
    setLoading(false);
    if (!res.ok) return toast(`⚠️ ${res.error}`, 'error');
    const set = new Set();
    res.orders.forEach((o) => {
      if (PAID.has(o.status)) set.add(o.payer_phone || o.phone);
    });
    setNumbers([...set].filter(Boolean));
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  function download() {
    if (numbers.length === 0) return toast('No customer numbers yet', 'info');
    downloadPhoneList(numbers, `paid-customers-${new Date().toISOString().slice(0, 10)}.csv`);
    toast(`⬇️ ${numbers.length} customer number${numbers.length === 1 ? '' : 's'}`, 'success');
  }

  return (
    <div className="admin-shell">
      <AdminTopbar onRefresh={load} />
      <div className="admin-body">
        <div className="admin-toolbar">
          <div>
            <h3 style={{ margin: 0 }}>Paid Customers</h3>
            <div className="muted small" style={{ marginTop: 4 }}>
              Every unique number that has paid for data — for your records &amp; follow-ups.
            </div>
          </div>
          <button className="btn-primary" onClick={download} disabled={loading || numbers.length === 0}>
            ⬇️ Download {numbers.length} Number{numbers.length === 1 ? '' : 's'}
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: 60 }}>
            <span className="spinner" />
          </div>
        ) : numbers.length === 0 ? (
          <div className="muted small" style={{ padding: '12px 4px' }}>No paid customers yet.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table" style={{ minWidth: 'auto' }}>
              <thead>
                <tr><th>#</th><th>Phone Number</th></tr>
              </thead>
              <tbody>
                {numbers.map((n, i) => (
                  <tr key={n}>
                    <td className="muted">{i + 1}</td>
                    <td className="mono strong">{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
