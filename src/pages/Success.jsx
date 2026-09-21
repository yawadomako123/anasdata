import { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { cedis } from '../lib/format';

export default function Success() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [copied, setCopied] = useState('');

  if (!state?.reference) {
    // Someone landed here directly — send them home.
    navigate('/');
    return null;
  }

  const { reference, bundle, phone, amount, network, productType, voucher } = state;
  const isChecker = productType === 'checker';

  async function copy(label, text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      /* clipboard blocked — the value is on screen anyway */
    }
  }

  return (
    <div className="success-page">
      <div className="success-wrap">
        <div className="success-check">✓</div>
        <h1 className="success-title">{isChecker ? 'Payment Confirmed' : 'Order Received'}</h1>
        <p className="success-sub">
          {isChecker
            ? 'Your checker is ready. Save it somewhere safe — you can also look it up again any time.'
            : 'Payment confirmed. Your bundle is queued and will be loaded to your number shortly. Keep your reference in case you need to track it.'}
        </p>

        {/* Shown here, and retrievable later via Track Order or by dialling in. */}
        {isChecker && voucher && (
          <div className="voucher-card">
            <div className="voucher-card-label">Your Checker</div>
            <button className="voucher-field" onClick={() => copy('serial', voucher.serial)}>
              <span className="voucher-field-label">Serial</span>
              <span className="voucher-field-value">{voucher.serial}</span>
              <span className="voucher-copy">{copied === 'serial' ? 'Copied' : 'Tap to copy'}</span>
            </button>
            <button className="voucher-field" onClick={() => copy('pin', voucher.pin)}>
              <span className="voucher-field-label">PIN</span>
              <span className="voucher-field-value">{voucher.pin}</span>
              <span className="voucher-copy">{copied === 'pin' ? 'Copied' : 'Tap to copy'}</span>
            </button>
          </div>
        )}

        {isChecker && !voucher && (
          <div className="voucher-card pending">
            <div className="voucher-card-label">Your Checker</div>
            <p className="muted small" style={{ margin: 0 }}>
              Your PIN is being prepared. Use Track This Order below with the reference to view
              it, or contact support if it doesn't appear shortly.
            </p>
          </div>
        )}

        <div className="success-ref">
          <div className="success-ref-label">Order Reference</div>
          <div className="success-ref-value">{reference}</div>
        </div>

        <div className="success-detail-grid">
          {isChecker ? (
            <>
              <Detail label="Item" value={bundle.name} />
              <Detail label="For" value={phone} />
            </>
          ) : (
            <>
              <Detail label="Bundle" value={`${bundle.data} · ${bundle.name}`} />
              <Detail label="Network" value={network} />
              <Detail label="Phone" value={phone} />
            </>
          )}
          <Detail label="Amount Paid" value={cedis(amount)} />
        </div>

        <div className="success-actions">
          <Link className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} to="/track" state={{ reference }}>
            Track This Order
          </Link>
          <Link
            className="btn-secondary"
            style={{ width: '100%', justifyContent: 'center' }}
            to={isChecker ? '/checkers' : '/bundles'}
          >
            {isChecker ? 'Buy Another Checker' : 'Buy Another Bundle'}
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
