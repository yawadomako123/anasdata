import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { NETWORKS } from '../lib/data';
import { verifyPaySwitchPayment } from '../lib/api';

export default function PaymentReturn() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState('Confirming your payment…');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // guard React StrictMode double-run
    ran.current = true;

    const txn = params.get('transaction_id') || sessionStorage.getItem('anasdata_txn');
    if (!txn) {
      setFailed(true);
      setMessage('We could not find your transaction. If you were charged, use Track Order with your reference.');
      return;
    }

    (async () => {
      const res = await verifyPaySwitchPayment(txn);
      sessionStorage.removeItem('anasdata_txn');

      if (res.ok && res.order && res.order.status === 'paid') {
        const o = res.order;
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
      } else {
        setFailed(true);
        setMessage(
          res.error ||
            'Your payment was not completed. If any amount was charged it will be reversed.'
        );
      }
    })();
  }, [params, navigate]);

  return (
    <div className="checkout-page">
      <div className="checkout-wrap" style={{ textAlign: 'center' }}>
        {!failed ? (
          <>
            <span className="spinner" style={{ width: 28, height: 28, margin: '10px auto 18px' }} />
            <h2>Confirming payment…</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: 10 }}>{message}</p>
          </>
        ) : (
          <>
            <div className="success-check" style={{ background: 'var(--error)' }}>!</div>
            <h2>Payment not confirmed</h2>
            <p style={{ color: 'var(--text-secondary)', margin: '12px 0 24px' }}>{message}</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link className="btn-primary" to="/bundles">Try again</Link>
              <Link className="btn-secondary" to="/track">Track Order</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
