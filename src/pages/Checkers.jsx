import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchCheckers } from '../lib/checkers';
import { cedis } from '../lib/format';
import { useToast } from '../components/Toast.jsx';

export default function Checkers() {
  const navigate = useNavigate();
  const toast = useToast();
  const [checkers, setCheckers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchCheckers().then((res) => {
      if (!alive) return;
      setLoading(false);
      if (!res.ok) return toast(`⚠️ ${res.error}`, 'error');
      setCheckers(res.checkers);
    });
    return () => { alive = false; };
  }, [toast]);

  const available = checkers.filter((c) => c.inStock);

  return (
    <>
      <div className="bundles-page-header">
        <div className="container">
          <div className="bundles-page-title">Result Checkers</div>
          <div className="bundles-page-sub">
            {loading
              ? 'Loading…'
              : available.length === 0
              ? 'Nothing in stock at the moment — please check back soon.'
              : <>Pay with Mobile Money and your PIN appears <strong>on screen</strong> straight away.</>}
          </div>
        </div>
      </div>

      <div className="bundles-page-body container">
        {loading ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: 60 }}>
            <span className="spinner" />
          </div>
        ) : checkers.length === 0 ? (
          <div className="muted" style={{ padding: '30px 4px' }}>
            No checkers available right now.
          </div>
        ) : (
          <div className="bundles-grid">
            {checkers.map((c) => (
              <div key={c.id} className={`bundle-card checker ${c.inStock ? '' : 'sold-out'}`}>
                <div className="bundle-card-header">
                  <span className="bundle-network-pill checker">Checker</span>
                  {!c.inStock && <span className="bundle-badge">Sold out</span>}
                </div>
                <div className="bundle-data checker">🎫</div>
                <div className="bundle-name">{c.name}</div>
                {c.description && (
                  <div className="muted small" style={{ marginBottom: 14 }}>{c.description}</div>
                )}
                <div className="bundle-meta">
                  <div className="bundle-meta-item">
                    <span className="bundle-meta-label">Delivery</span>
                    <span className="bundle-meta-value">Instant</span>
                  </div>
                  <div className="bundle-meta-item">
                    <span className="bundle-meta-label">Availability</span>
                    <span className="bundle-meta-value">{c.inStock ? 'In stock' : 'Sold out'}</span>
                  </div>
                </div>
                <div className="bundle-footer">
                  <div className="bundle-price">
                    <span className="bundle-price-currency">GHS</span>
                    <span className="bundle-price-amount">{c.price.toFixed(2)}</span>
                  </div>
                  <button
                    className="btn-buy checker"
                    disabled={!c.inStock}
                    onClick={() => navigate(`/checkout/checker/${c.id}`)}
                  >
                    {c.inStock ? `Buy ${cedis(c.price)}` : 'Sold out'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
