import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { NETWORKS } from '../lib/data';
import { fetchBundles } from '../lib/bundles';
import BundleCard from '../components/BundleCard.jsx';

export default function Home() {
  const navigate = useNavigate();
  const [bundles, setBundles] = useState([]);

  useEffect(() => {
    let alive = true;
    fetchBundles().then((res) => {
      if (alive && res.ok) setBundles(res.bundles);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Featured = badged bundles first, then fill up to 6.
  const featured = useMemo(() => {
    const badged = bundles.filter((b) => b.badge);
    const rest = bundles.filter((b) => !b.badge);
    return [...badged, ...rest].slice(0, 6);
  }, [bundles]);

  const countByNetwork = useMemo(() => {
    const m = { mtn: 0, telecel: 0 };
    bundles.forEach((b) => { if (m[b.network] != null) m[b.network] += 1; });
    return m;
  }, [bundles]);

  const cheapest = useMemo(
    () => (bundles.length ? Math.min(...bundles.map((b) => b.price)) : null),
    [bundles]
  );

  return (
    <>
      {/* Hero */}
      <section className="hero">
        <div className="hero-content">
          <h1>
            Buy Data Bundles
            <br />
            <span className="highlight">Instantly in Ghana</span>
          </h1>
          <p>
            Pick a bundle for MTN or Telecel, pay securely with PaySwitch, and we
            load it to your number. Simple.
          </p>
          <div className="hero-actions">
            <button className="btn-primary" onClick={() => navigate('/bundles')}>
              <span>Browse Bundles</span>
              <span>→</span>
            </button>
            <Link className="btn-secondary" to="/track">
              <span>Track My Order</span>
            </Link>
          </div>
          {import.meta.env.VITE_USSD_CODE && (
            <div className="hero-ussd">
              No internet? Dial <strong>{import.meta.env.VITE_USSD_CODE}</strong> on any phone to buy.
            </div>
          )}
        </div>
        <div className="hero-stats">
          <Stat value={bundles.length ? `${bundles.length}` : '—'} label="Bundle Options" />
          <Stat value="2" label="Networks Covered" />
          <Stat value={cheapest != null ? `GHS ${cheapest.toFixed(2)}` : '—'} label="Starting From" />
          <Stat value="Non-expiry" label="Data Bundles" />
        </div>
      </section>

      {/* Networks */}
      <section className="networks-section">
        <div className="container">
          <div className="section-header">
            <span className="section-tag">Networks</span>
            <h2 className="section-title">Pick Your Network</h2>
            <p className="section-sub">We support all major telecom providers in Ghana</p>
          </div>
          <div className="networks-grid">
            {Object.values(NETWORKS).map((net) => (
              <Link
                key={net.id}
                to={`/bundles?network=${net.id}`}
                className={`network-card ${net.id}`}
              >
                <div className={`network-badge ${net.id}`}>{net.name.slice(0, 3).toUpperCase()}</div>
                <div className="network-name">{net.fullName}</div>
                <div className="network-tagline">{net.tagline}</div>
                <div className={`network-bundle-count ${net.id}`}>
                  <span>{countByNetwork[net.id]} bundles available</span>
                </div>
                <div className="network-arrow">→</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="how-section">
        <div className="container">
          <div className="section-header">
            <span className="section-tag">How It Works</span>
            <h2 className="section-title">Get Data in 3 Simple Steps</h2>
            <p className="section-sub">From browsing to connected — in under a minute</p>
          </div>
          <div className="steps-grid">
            <Step n="1" title="Choose a Bundle"
              desc="Browse non-expiry bundles for MTN and Telecel. Filter by network and size." />
            <Step n="2" title="Pay Securely"
              desc="Enter the number to top up and pay with PaySwitch — Mobile Money, Visa, or Mastercard." />
            <Step n="3" title="We Load It"
              desc="Your order reaches us and we load the bundle to your number, then you get a confirmation." />
          </div>
        </div>
      </section>

      {/* Featured */}
      {featured.length > 0 && (
        <section className="featured-section">
          <div className="container">
            <div className="section-header">
              <span className="section-tag">Featured</span>
              <h2 className="section-title">Most Popular Bundles</h2>
              <p className="section-sub">Ghana's favourite data deals, hand-picked for you</p>
            </div>
            <div className="bundles-grid">
              {featured.map((b) => (
                <BundleCard key={b.id} bundle={b} />
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 40 }}>
              <button className="btn-primary" style={{ margin: '0 auto' }} onClick={() => navigate('/bundles')}>
                View All Bundles →
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

const Stat = ({ value, label }) => (
  <div className="hero-stat">
    <span className="hero-stat-value">{value}</span>
    <div className="hero-stat-label">{label}</div>
  </div>
);

const Step = ({ n, title, desc }) => (
  <div className="step-card">
    <div className="step-number">{n}</div>
    <div className="step-title">{title}</div>
    <div className="step-desc">{desc}</div>
  </div>
);
