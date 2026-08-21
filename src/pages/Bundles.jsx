import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { NETWORKS } from '../lib/data';
import { fetchBundles } from '../lib/bundles';
import BundleCard from '../components/BundleCard.jsx';

export default function Bundles() {
  const [params, setParams] = useSearchParams();
  const [network, setNetwork] = useState(params.get('network') || 'all');
  const [sort, setSort] = useState('default');
  const [query, setQuery] = useState('');

  const [bundles, setBundles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchBundles().then((res) => {
      if (!alive) return;
      setLoading(false);
      if (res.ok) setBundles(res.bundles);
      else setError(res.error);
    });
    return () => {
      alive = false;
    };
  }, []);

  // keep the ?network= query param in sync so links from Home/Footer work
  useEffect(() => {
    const n = params.get('network');
    if (n && n !== network) setNetwork(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const results = useMemo(() => {
    let r = [...bundles];
    if (network !== 'all') r = r.filter((b) => b.network === network);
    const q = query.toLowerCase().trim();
    if (q) {
      r = r.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.data.toLowerCase().includes(q) ||
          NETWORKS[b.network].name.toLowerCase().includes(q)
      );
    }
    if (sort === 'price-asc') r.sort((a, b) => a.price - b.price);
    if (sort === 'price-desc') r.sort((a, b) => b.price - a.price);
    if (sort === 'data-asc') r.sort((a, b) => a.dataValue - b.dataValue);
    if (sort === 'data-desc') r.sort((a, b) => b.dataValue - a.dataValue);
    return r;
  }, [bundles, network, sort, query]);

  const changeNetwork = (val) => {
    setNetwork(val);
    if (val === 'all') setParams({});
    else setParams({ network: val });
  };

  const reset = () => {
    setNetwork('all');
    setSort('default');
    setQuery('');
    setParams({});
  };

  return (
    <>
      <div className="bundles-page-header">
        <div className="container">
          <div className="bundles-page-title">Buy Data Bundles</div>
          <div className="bundles-page-sub">
            {loading
              ? 'Loading bundles…'
              : <>Choose from <strong>{bundles.length}</strong> non-expiry bundles across MTN &amp; Telecel</>}
          </div>
        </div>
      </div>

      <div className="bundles-page-body container">
        <div className="filters-bar">
          <div className="filter-group" style={{ flex: 1, minWidth: 200 }}>
            <div className="filter-label">Search</div>
            <div className="search-input-wrap">
              <span className="search-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                className="search-input"
                placeholder="e.g. 5GB, MTN…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="filter-group">
            <div className="filter-label">Network</div>
            <select className="filter-select" value={network} onChange={(e) => changeNetwork(e.target.value)}>
              <option value="all">All Networks</option>
              <option value="mtn">MTN Ghana</option>
              <option value="telecel">Telecel Ghana</option>
            </select>
          </div>
          <div className="filter-group">
            <div className="filter-label">Sort By</div>
            <select className="filter-select" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="default">Default</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="data-asc">Data: Small to Large</option>
              <option value="data-desc">Data: Large to Small</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: 60 }}>
            <span className="spinner" />
          </div>
        ) : error ? (
          <div className="no-bundles">
            <div className="no-bundles-icon">⚠️</div>
            <h3>Couldn't load bundles</h3>
            <p>{error}</p>
          </div>
        ) : (
          <>
            <div className="bundles-results-count">
              Showing <span>{results.length}</span> bundles
            </div>

            {results.length === 0 ? (
              <div className="no-bundles">
                <div className="no-bundles-icon">📭</div>
                <h3>No bundles found</h3>
                <p>Try adjusting your filters or search term.</p>
                <button className="btn-secondary" onClick={reset} style={{ margin: '0 auto' }}>
                  Clear Filters
                </button>
              </div>
            ) : (
              <div className="bundles-grid">
                {results.map((b) => (
                  <BundleCard key={b.id} bundle={b} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
