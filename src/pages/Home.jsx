import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { NETWORKS } from '../lib/data';
import { fetchBundles } from '../lib/bundles';
import { fetchCheckers } from '../lib/checkers';
import { cedis } from '../lib/format';

export default function Home() {
  const navigate = useNavigate();
  const [bundles, setBundles] = useState([]);
  const [checkers, setCheckers] = useState([]);

  useEffect(() => {
    let alive = true;
    fetchBundles().then((res) => {
      if (alive && res.ok) setBundles(res.bundles);
    });
    fetchCheckers().then((res) => {
      if (alive && res.ok) setCheckers(res.checkers.filter((c) => c.inStock));
    });
    return () => {
      alive = false;
    };
  }, []);

  const countByNetwork = useMemo(() => {
    const m = { mtn: 0, telecel: 0, airteltigo: 0 };
    bundles.forEach((b) => { if (m[b.network] != null) m[b.network] += 1; });
    return m;
  }, [bundles]);

  const cheapestChecker = useMemo(
    () => (checkers.length ? Math.min(...checkers.map((c) => c.price)) : null),
    [checkers]
  );
  const cheapestBundle = useMemo(
    () => (bundles.length ? Math.min(...bundles.map((b) => b.price)) : null),
    [bundles]
  );

  return (
    <>
      {/* Hero */}
      <section className="hero">
        <div className="hero-content">
          <h1>
            Result Checkers
            <br />
            <span className="highlight">Delivered Instantly</span>
          </h1>
          <p>
            Pay with Mobile Money and your serial and PIN arrive by SMS in seconds. Airtime and
            data top-ups are available too.
          </p>
          <div className="hero-actions">
            <button className="btn-primary" onClick={() => navigate('/checkers')}>
              <span>Browse Checkers</span>
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
          <Stat value={checkers.length ? `${checkers.length}` : '—'} label="Checkers Available" />
          <Stat value="Instant" label="SMS Delivery" />
          <Stat
            value={cheapestChecker != null ? `GHS ${cheapestChecker.toFixed(2)}` : '—'}
            label="Starting From"
          />
          <Stat value="MoMo" label="Pay With" />
        </div>
      </section>

      {/* Checkers — the headline product */}
      {checkers.length > 0 && (
        <section className="featured-section">
          <div className="container">
            <div className="section-header">
              <span className="section-tag">Checkers</span>
              <h2 className="section-title">Get Your Results Checker</h2>
              <p className="section-sub">Paid for by Mobile Money, sent to your phone by SMS</p>
            </div>
            <div className="bundles-grid">
              {checkers.slice(0, 6).map((c) => (
                <div key={c.id} className="bundle-card checker">
                  <div className="bundle-card-header">
                    <span className="bundle-network-pill checker">Checker</span>
                  </div>
                  <div className="bundle-data checker">🎫</div>
                  <div className="bundle-name">{c.name}</div>
                  <div className="bundle-meta">
                    <div className="bundle-meta-item">
                      <span className="bundle-meta-label">Delivery</span>
                      <span className="bundle-meta-value">SMS</span>
                    </div>
                    <div className="bundle-meta-item">
                      <span className="bundle-meta-label">Availability</span>
                      <span className="bundle-meta-value">In stock</span>
                    </div>
                  </div>
                  <div className="bundle-footer">
                    <div className="bundle-price">
                      <span className="bundle-price-currency">GHS</span>
                      <span className="bundle-price-amount">{c.price.toFixed(2)}</span>
                    </div>
                    <button className="btn-buy checker" onClick={() => navigate(`/checkout/checker/${c.id}`)}>
                      Buy {cedis(c.price)}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 40 }}>
              <button className="btn-primary" style={{ margin: '0 auto' }} onClick={() => navigate('/checkers')}>
                View All Checkers →
              </button>
            </div>
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="how-section">
        <div className="container">
          <div className="section-header">
            <span className="section-tag">How It Works</span>
            <h2 className="section-title">Three Simple Steps</h2>
            <p className="section-sub">From choosing to done — in under a minute</p>
          </div>
          <div className="steps-grid">
            <Step n="1" title="Choose What You Need"
              desc="Pick a results checker, or a top-up if that's what you're after." />
            <Step n="2" title="Pay Securely"
              desc="Enter your number and approve the Mobile Money prompt on your phone." />
            <Step n="3" title="Get It Instantly"
              desc="Checker PINs arrive by SMS straight away. Top-ups follow shortly after." />
          </div>
        </div>
      </section>

      {/* Top-ups — available, but not the headline */}
      <section className="networks-section">
        <div className="container">
          <div className="section-header">
            <span className="section-tag">Also available</span>
            <h2 className="section-title">Top-Ups</h2>
            <p className="section-sub">
              {cheapestBundle != null
                ? `Non-expiry top-ups for all major networks, from ${cedis(cheapestBundle)}`
                : 'Non-expiry top-ups for all major networks'}
            </p>
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
                  <span>{countByNetwork[net.id]} options available</span>
                </div>
                <div className="network-arrow">→</div>
              </Link>
            ))}
          </div>
        </div>
      </section>
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
