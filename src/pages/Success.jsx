import { useLocation, useNavigate, Link } from 'react-router-dom';
import { cedis } from '../lib/format';

export default function Success() {
  const { state } = useLocation();
  const navigate = useNavigate();

  if (!state?.reference) {
    // Someone landed here directly — send them home.
    navigate('/');
    return null;
  }

  const { reference, bundle, phone, amount, network } = state;

  return (
    <div className="success-page">
      <div className="success-wrap">
        <div className="success-check">✓</div>
        <h1 className="success-title">Order Received</h1>
        <p className="success-sub">
          Payment confirmed. Your bundle is queued and will be loaded to your number shortly. Keep
          your reference in case you need to track it.
        </p>

        <div className="success-ref">
          <div className="success-ref-label">Order Reference</div>
          <div className="success-ref-value">{reference}</div>
        </div>

        <div className="success-detail-grid">
          <Detail label="Bundle" value={`${bundle.data} · ${bundle.name}`} />
          <Detail label="Network" value={network} />
          <Detail label="Phone" value={phone} />
          <Detail label="Amount Paid" value={cedis(amount)} />
        </div>

        <div className="success-actions">
          <Link className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} to="/track" state={{ reference }}>
            Track This Order
          </Link>
          <Link className="btn-secondary" style={{ width: '100%', justifyContent: 'center' }} to="/bundles">
            Buy Another Bundle
          </Link>
        </div>
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
