import { useNavigate } from 'react-router-dom';
import { NETWORKS } from '../lib/data';

const badgeClass = (badge) => {
  if (badge === 'Premium') return 'premium';
  if (badge === 'Power User') return 'power';
  return '';
};

export default function BundleCard({ bundle }) {
  const navigate = useNavigate();
  const net = NETWORKS[bundle.network];
  const perGb =
    bundle.dataValue < 9999
      ? `GHS ${(bundle.price / bundle.dataValue).toFixed(2)}/GB`
      : 'Unlimited';

  return (
    <div className={`bundle-card ${bundle.network}`}>
      <div className="bundle-card-header">
        <span className={`bundle-network-pill ${bundle.network}`}>{net.name}</span>
        {bundle.badge && (
          <span className={`bundle-badge ${badgeClass(bundle.badge)}`}>{bundle.badge}</span>
        )}
      </div>
      <div className={`bundle-data ${bundle.network}`}>{bundle.data}</div>
      <div className="bundle-name">{bundle.name}</div>
      <div className="bundle-meta">
        <div className="bundle-meta-item">
          <span className="bundle-meta-label">Validity</span>
          <span className="bundle-meta-value">Non-expiry</span>
        </div>
        <div className="bundle-meta-item">
          <span className="bundle-meta-label">Network</span>
          <span className="bundle-meta-value">{net.name}</span>
        </div>
      </div>
      <div className="bundle-footer">
        <div className="bundle-price">
          <span className="bundle-price-currency">GHS</span>
          <span className="bundle-price-amount">{bundle.price.toFixed(2)}</span>
          <span className="bundle-price-per">{perGb}</span>
        </div>
        <button
          className={`btn-buy ${bundle.network}`}
          onClick={() => navigate(`/checkout/${bundle.id}`)}
        >
          Buy Now
        </button>
      </div>
    </div>
  );
}
