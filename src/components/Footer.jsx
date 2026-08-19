import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <div className="nav-logo">
            <span className="nav-logo-icon">A</span>
            <span className="nav-logo-text">Anasdata</span>
          </div>
          <p>
            Buy affordable data bundles for all major Ghana networks. Fast, secure checkout
            powered by Paystack.
          </p>
        </div>
        <div>
          <div className="footer-col-title">Networks</div>
          <div className="footer-links">
            <Link className="footer-link" to="/bundles?network=mtn">MTN Ghana</Link>
            <Link className="footer-link" to="/bundles?network=airteltigo">AirtelTigo</Link>
            <Link className="footer-link" to="/bundles?network=telecel">Telecel Ghana</Link>
          </div>
        </div>
        <div>
          <div className="footer-col-title">Quick Links</div>
          <div className="footer-links">
            <Link className="footer-link" to="/">Home</Link>
            <Link className="footer-link" to="/bundles">Buy Bundles</Link>
            <Link className="footer-link" to="/track">Track Order</Link>
          </div>
        </div>
        <div>
          <div className="footer-col-title">Balance Check</div>
          <div className="footer-links">
            <span className="footer-note">MTN &nbsp;*138#</span>
            <span className="footer-note">AirtelTigo &nbsp;*100#</span>
            <span className="footer-note">Telecel &nbsp;*700#</span>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <p>© {new Date().getFullYear()} Anasdata. All rights reserved. Powered by Paystack.</p>
      </div>
    </footer>
  );
}
