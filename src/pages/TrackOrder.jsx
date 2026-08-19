import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getOrderByReference } from '../lib/api';
import { cedis, prettyDate } from '../lib/format';

const STATUS_LABEL = {
  pending: { text: 'Awaiting payment approval', icon: '⏳', cls: 'pending' },
  paid: { text: 'Paid — awaiting loading', icon: '🟡', cls: 'pending' },
  processing: { text: 'Processing', icon: '🔵', cls: 'pending' },
  done: { text: 'Loaded ✓', icon: '🟢', cls: 'success' },
  failed: { text: 'Failed — contact support', icon: '🔴', cls: 'expired' },
};

export default function TrackOrder() {
  const { state } = useLocation();
  const [ref, setRef] = useState(state?.reference || '');
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function lookup(reference) {
    if (!reference.trim()) return;
    setLoading(true);
    setError('');
    setOrder(null);
    const res = await getOrderByReference(reference);
    setLoading(false);
    setSearched(true);
    if (!res.ok) return setError(res.error);
    setOrder(res.order);
  }

  // auto-lookup if we arrived from the success page
  useEffect(() => {
    if (state?.reference) lookup(state.reference);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status = order && (STATUS_LABEL[order.status] || STATUS_LABEL.paid);

  return (
    <div className="track-page container">
      <div className="track-wrap">
        <div className="section-header" style={{ marginBottom: 24 }}>
          <span className="section-tag">Track</span>
          <h2 className="section-title">Track Your Order</h2>
          <p className="section-sub">Enter the reference from your receipt to see its status.</p>
        </div>

        <div className="track-form">
          <input
            className="form-input"
            placeholder="e.g. BDL_1712345678_AB12CD"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && lookup(ref)}
          />
          <button className="btn-primary" onClick={() => lookup(ref)} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Track'}
          </button>
        </div>

        {error && <div className="banner-warn" style={{ marginTop: 20 }}>⚠️ {error}</div>}

        {searched && !error && !order && (
          <div className="no-bundles" style={{ marginTop: 20 }}>
            <div className="no-bundles-icon">🔍</div>
            <h3>No order found</h3>
            <p>Double-check the reference. It looks like <code>BDL_…</code></p>
          </div>
        )}

        {order && (
          <div className="track-result">
            <div className={`track-status-badge ${status.cls}`}>
              {status.icon} {status.text}
            </div>
            <div className="success-detail-grid" style={{ marginTop: 20 }}>
              <Detail label="Reference" value={order.reference} />
              <Detail label="Bundle" value={order.bundle_name} />
              <Detail label="Data" value={order.data} />
              <Detail label="Phone" value={order.phone} />
              <Detail label="Amount" value={cedis(order.price)} />
              <Detail label="Ordered" value={prettyDate(order.created_at)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const Detail = ({ label, value }) => (
  <div className="success-detail-item">
    <div className="success-detail-label">{label}</div>
    <div className="success-detail-value">{value}</div>
  </div>
);
