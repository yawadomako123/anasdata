import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackOrder } from '../lib/api';
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
  const [query, setQuery] = useState(state?.reference || '');
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function lookup(value) {
    const q = (value || '').trim();
    if (!q) return;
    setLoading(true);
    setError('');
    setOrders([]);
    const res = await trackOrder(q);
    setLoading(false);
    setSearched(true);
    if (!res.ok) return setError(res.error);
    setOrders(res.orders);
  }

  // Auto-lookup if we arrived from the success page (by reference).
  useEffect(() => {
    if (state?.reference) lookup(state.reference);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="track-page container">
      <div className="track-wrap">
        <div className="section-header" style={{ marginBottom: 24 }}>
          <span className="section-tag">Track</span>
          <h2 className="section-title">Track Your Order</h2>
          <p className="section-sub">
            Enter the phone number you topped up, or your order reference.
          </p>
        </div>

        <div className="track-form">
          <input
            className="form-input"
            placeholder="e.g. 0244123456 or order reference"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && lookup(query)}
          />
          <button className="btn-primary" onClick={() => lookup(query)} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Track'}
          </button>
        </div>

        {error && <div className="banner-warn" style={{ marginTop: 20 }}>⚠️ {error}</div>}

        {searched && !error && orders.length === 0 && (
          <div className="no-bundles" style={{ marginTop: 20 }}>
            <div className="no-bundles-icon">🔍</div>
            <h3>No order found</h3>
            <p>Double-check the phone number or reference and try again.</p>
          </div>
        )}

        {orders.length > 1 && (
          <p className="muted small" style={{ marginTop: 20 }}>
            {orders.length} orders found for this number
          </p>
        )}

        {orders.map((order) => {
          const status = STATUS_LABEL[order.status] || STATUS_LABEL.paid;
          return (
            <div className="track-result" key={order.reference} style={{ marginTop: 16 }}>
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
          );
        })}
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
