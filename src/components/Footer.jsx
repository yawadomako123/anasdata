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
            Buy affordable non-expiry MTN &amp; Telecel data bundles. Fast, secure checkout
            powered by PaySwitch.
          </p>
        </div>
        <div>
          <div className="footer-col-title">Networks</div>
          <div className="footer-links">
            <Link className="footer-link" to="/bundles?network=mtn">MTN Ghana</Link>
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
          <div className="footer-col-title">Support</div>
          <div className="footer-links">
            <a className="footer-link" href="tel:0592079246">📞 059 207 9246</a>
            <a className="footer-link" href="mailto:qwekubhadest1414@gmail.com" style={{ wordBreak: 'break-all' }}>
              ✉️ qwekubhadest1414@gmail.com
            </a>
            <span className="footer-note">Balance: MTN *138# · Telecel *700#</span>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <p>© {new Date().getFullYear()} Anasdata. All rights reserved. Powered by PaySwitch.</p>
      </div>
    </footer>
  );
}
