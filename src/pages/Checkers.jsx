import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchCheckers, CATEGORIES } from '../lib/checkers';
import { cedis } from '../lib/format';
import { useToast } from '../components/Toast.jsx';

export default function Checkers() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const active = params.get('type') || 'all';

  useEffect(() => {
    let alive = true;
    fetchCheckers().then((res) => {
      if (!alive) return;
      setLoading(false);
      if (!res.ok) return toast(`⚠️ ${res.error}`, 'error');
      setItems(res.checkers);
    });
    return () => { alive = false; };
  }, [toast]);

  // Only offer a category tab when there is something in it to buy.
  const stocked = useMemo(() => {
    const present = new Set(items.filter((c) => c.inStock).map((c) => c.category));
    return CATEGORIES.filter((c) => present.has(c.key));
  }, [items]);

  const shown = useMemo(
    () => (active === 'all' ? items : items.filter((c) => c.category === active)),
    [items, active]
  );

  const label = CATEGORIES.find((c) => c.key === active)?.label;

  return (
    <>
      <div className="bundles-page-header">
        <div className="container">
          <div className="bundles-page-title">{label || 'Codes & Tickets'}</div>
          <div className="bundles-page-sub">
            {loading
              ? 'Loading…'
              : shown.filter((c) => c.inStock).length === 0
              ? 'Nothing in stock at the moment — please check back soon.'
              : <>Pay with Mobile Money and your code appears <strong>on screen</strong> straight away.</>}
          </div>
        </div>
      </div>

      <div className="bundles-page-body container">
        {/* Category tabs — hidden entirely when only one line is on sale. */}
        {stocked.length > 1 && (
          <div className="admin-filters" style={{ marginBottom: 22 }}>
            <button
              className={`chip ${active === 'all' ? 'active' : ''}`}
              onClick={() => setParams({})}
            >
              All
            </button>
            {stocked.map((c) => (
              <button
                key={c.key}
                className={`chip ${active === c.key ? 'active' : ''}`}
                onClick={() => setParams({ type: c.key })}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: 60 }}>
            <span className="spinner" />
          </div>
        ) : shown.length === 0 ? (
          <div className="muted" style={{ padding: '30px 4px' }}>
            Nothing available here right now.
          </div>
        ) : (
          <div className="bundles-grid">
            {shown.map((c) => {
              const cat = CATEGORIES.find((x) => x.key === c.category);
              return (
                <div key={c.id} className={`bundle-card checker ${c.inStock ? '' : 'sold-out'}`}>
                  <div className="bundle-card-header">
                    <span className="bundle-network-pill checker">{cat?.label ?? 'Code'}</span>
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
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
