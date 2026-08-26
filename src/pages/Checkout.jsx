import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { NETWORKS } from '../lib/data';
import { fetchBundleById } from '../lib/bundles';
import { isValidGhPhone, cedis } from '../lib/format';
import { initiatePaySwitchOrder, verifyPaySwitchPayment } from '../lib/api';
import { useToast } from '../components/Toast.jsx';

export default function Checkout() {
  const { bundleId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);

  const [phone, setPhone] = useState(''); // number to top up (recipient)
  const [momo, setMomo] = useState(''); // Mobile Money number to charge (payer)
  const [momoEdited, setMomoEdited] = useState(false);
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
  const momoOk = isValidGhPhone(momo);

  function onPhoneChange(v) {
    const clean = v.replace(/\D/g, '');
    setPhone(clean);
    if (!momoEdited) setMomo(clean); // mirror into MoMo field until edited
  }

  async function pollUntilDone(transactionId) {
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      const res = await verifyPaySwitchPayment(transactionId);
      if (res.ok && res.status === 'paid') return { paid: true, order: res.order };
      if (res.ok && res.status === 'failed') return { failed: true, error: res.error };
    }
    return { timeout: true };
  }

  async function handlePay() {
    setTouched({ phone: true, momo: true });
    if (!phoneOk) return toast('⚠️ Enter a valid number to top up', 'error');
    if (!momoOk) return toast('⚠️ Enter a valid Mobile Money number', 'error');

    try {
      setBusy('Sending prompt to your phone…');
      const init = await initiatePaySwitchOrder({ bundleId: bundle.id, phone, payerPhone: momo });
      if (!init.ok) {
        toast(`⚠️ ${init.error}`, 'error', 6000);
        setBusy('');
        return;
      }

      setBusy('Approve the prompt on your phone…');
      const result = await pollUntilDone(init.transactionId);

      if (result.paid) {
        const o = result.order;
        navigate('/success', {
          replace: true,
          state: {
            reference: o.reference,
            bundle: { data: o.data, name: o.bundle_name, network: o.network },
            phone: o.phone,
            amount: Number(o.price),
            network: NETWORKS[o.network]?.fullName || o.network,
          },
        });
        return;
      }

      setBusy('');
      if (result.failed) {
        toast(`⚠️ ${result.error || 'Payment was not completed.'}`, 'error', 7000);
      } else {
        toast('ℹ️ Still awaiting approval. If you approved, check Track Order shortly.', 'info', 8000);
      }
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
        <div className="checkout-sub">Enter your details, then approve the Mobile Money prompt.</div>

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
            <label className="form-label" htmlFor="phone">Number to Top Up <span>*</span></label>
            <input
              id="phone"
              type="tel"
              className="form-input"
              placeholder="e.g. 0244123456"
              maxLength={10}
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
            />
            <div className="form-hint">📱 The bundle will be loaded to this number</div>
            {touched.phone && !phoneOk && (
              <div className="form-error show">Enter a valid 10-digit Ghana number (e.g. 0244123456)</div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="momo">Mobile Money Number to Pay <span>*</span></label>
            <input
              id="momo"
              type="tel"
              className="form-input"
              placeholder="e.g. 0244123456"
              maxLength={10}
              value={momo}
              onChange={(e) => { setMomoEdited(true); setMomo(e.target.value.replace(/\D/g, '')); }}
              onBlur={() => setTouched((t) => ({ ...t, momo: true }))}
            />
            <div className="form-hint">💳 You'll approve the payment prompt on this number</div>
            {touched.momo && !momoOk && (
              <div className="form-error show">Enter a valid 10-digit Mobile Money number</div>
            )}
          </div>
        </div>

        <div className="paystack-info">
          <span style={{ fontSize: 20 }}>🔒</span>
          <span>
            Secure <strong>Mobile Money</strong> payment. You'll get a prompt on your phone to
            approve with your PIN.
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
              <span>Pay {cedis(bundle.price)} with Mobile Money</span>
            </>
          )}
        </button>

        {busy.startsWith('Approve') && (
          <div className="form-hint" style={{ textAlign: 'center', marginTop: 14 }}>
            Waiting for approval — don't close this page. If no prompt appears, check your MoMo
            approvals (dial *170#).
          </div>
        )}
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
