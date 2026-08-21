import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { NETWORKS } from '../lib/data';
import { fetchBundleById } from '../lib/bundles';
import { isValidGhPhone, isValidEmail, cedis } from '../lib/format';
import { openPaySwitchInline, isPaySwitchConfigured } from '../lib/payswitch';
import { initiatePaySwitchOrder } from '../lib/api';
import { useToast } from '../components/Toast.jsx';

export default function Checkout() {
  const { bundleId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);

  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState({});
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchBundleById(bundleId).then((res) => {
      if (!alive) return;
      setLoading(false);
      if (res.ok) setBundle(res.bundle);
    });
    return () => {
      alive = false;
    };
  }, [bundleId]);

  if (loading) {
    return (
      <div className="checkout-page">
        <div className="checkout-wrap" style={{ display: 'grid', placeItems: 'center', padding: 60 }}>
          <span className="spinner" />
        </div>
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="checkout-page">
        <div className="checkout-wrap" style={{ textAlign: 'center' }}>
          <h2>Bundle not found</h2>
          <p style={{ color: 'var(--text-secondary)', margin: '12px 0 24px' }}>
            That bundle doesn't exist or was removed.
          </p>
          <Link className="btn-primary" to="/bundles" style={{ margin: '0 auto' }}>
            Back to bundles
          </Link>
        </div>
      </div>
    );
  }

  const net = NETWORKS[bundle.network];
  const phoneOk = isValidGhPhone(phone);
  const emailOk = isValidEmail(email);

  async function handlePay() {
    setTouched({ phone: true, email: true });
    if (!phoneOk) return toast('⚠️ Enter a valid Ghana phone number', 'error');
    if (!emailOk) return toast('⚠️ Enter a valid email address', 'error');

    try {
      setBusy('Starting secure payment…');
      const init = await initiatePaySwitchOrder({ bundleId: bundle.id, phone, email });
      if (!init.ok) {
        toast(`⚠️ ${init.error}`, 'error', 6000);
        setBusy('');
        return;
      }

      // Remember the transaction so /payment/return can recover it after the
      // theTeller redirect.
      sessionStorage.setItem('anasdata_txn', init.transactionId);

      setBusy('Opening PaySwitch…');
      await openPaySwitchInline({
        transactionId: init.transactionId,
        amount: init.amount,
        email,
        description: `${bundle.name} to ${phone}`,
        redirectUrl: `${window.location.origin}/payment/return`,
        onClose: () => setBusy(''), // customer dismissed the popup
      });
      // theTeller now shows its popup and redirects the browser on completion.
    } catch (err) {
      setBusy('');
      toast(`ℹ️ ${err.message}`, 'info');
    }
  }

  return (
    <div className="checkout-page">
      <div className="checkout-wrap">
        <button className="checkout-back" onClick={() => navigate(-1)}>← Back</button>
        <div className="checkout-title">Complete Your Purchase</div>
        <div className="checkout-sub">Enter the number to top up, then pay securely.</div>

        {!isPaySwitchConfigured && (
          <div className="banner-warn">
            ⚠️ PaySwitch isn't configured yet. Add your <code>VITE_PAYSWITCH_API_KEY</code> in{' '}
            <code>.env</code> to accept real payments.
          </div>
        )}

        <div className={`order-summary-card ${bundle.network}`}>
          <div className="order-summary-label">Your Selected Bundle</div>
          <div className="order-bundle-info">
            <div className="order-bundle-left">
              <div className={`data-amount ${bundle.network}`}>{bundle.data}</div>
              <div className="bundle-name-full">{bundle.name}</div>
            </div>
            <div className="order-bundle-right">
              <div className="price-currency">Price (GHS)</div>
              <div className="price-display">{bundle.price.toFixed(2)}</div>
            </div>
          </div>
          <div className="order-bundle-meta">
            <Meta label="Network" value={net.fullName} />
            <Meta label="Validity" value="Non-expiry" />
            <Meta label="Delivery" value="To your number" />
          </div>
        </div>

        <div className="checkout-form">
          <div className="form-group">
            <label className="form-label" htmlFor="phone">Phone Number to Top Up <span>*</span></label>
            <input
              id="phone"
              type="tel"
              className="form-input"
              placeholder="e.g. 0244123456"
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
            />
            <div className="form-hint">📱 The bundle will be loaded to this number</div>
            {touched.phone && !phoneOk && (
              <div className="form-error show">Enter a valid 10-digit Ghana number (e.g. 0244123456)</div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="email">Email Address <span>*</span></label>
            <input
              id="email"
              type="email"
              className="form-input"
              placeholder="e.g. you@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            />
            <div className="form-hint">📧 Your payment receipt goes here</div>
            {touched.email && !emailOk && (
              <div className="form-error show">Enter a valid email address</div>
            )}
          </div>
        </div>

        <div className="paystack-info">
          <span style={{ fontSize: 20 }}>🔒</span>
          <span>
            Payment secured by <strong>PaySwitch</strong>. Mobile Money, Visa &amp; Mastercard
            accepted.
          </span>
        </div>

        <button className="btn-pay" onClick={handlePay} disabled={Boolean(busy)}>
          {busy ? (
            <>
              <span className="spinner" /> <span>{busy}</span>
            </>
          ) : (
            <>
              <span>🔐</span>
              <span>Pay {cedis(bundle.price)} with PaySwitch</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

const Meta = ({ label, value }) => (
  <div className="order-meta-item">
    <div className="order-meta-item-label">{label}</div>
    <div className="order-meta-item-val">{value}</div>
  </div>
);
