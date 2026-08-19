/* ═══════════════════════════════════════════
   BundleGH — Main Application Logic
   Handles: SPA Routing, Bundle Rendering,
            Filters, Paystack, Dashboard
═══════════════════════════════════════════ */

// ─────────────────────────────────────────
// PAYSTACK CONFIG — Replace with your real key
// ─────────────────────────────────────────
const PAYSTACK_PUBLIC_KEY = 'pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

// ─────────────────────────────────────────
// APP STATE
// ─────────────────────────────────────────
const state = {
  currentPage: 'home',
  selectedBundle: null,
  filterNetwork: 'all',
  filterCategory: 'all',
  filterSort: 'default',
  searchQuery: '',
};

const checkoutState = {
  bundle: null,
  fromPage: 'bundles',
};

// ─────────────────────────────────────────
// ROUTER
// ─────────────────────────────────────────
function navigate(page, data = {}) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  // Show target page
  const target = document.getElementById(`page-${page}`);
  if (!target) return;
  target.classList.add('active');

  // Update active nav link
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const navEl = document.getElementById(`nav-${page}`);
  if (navEl) navEl.classList.add('active');

  state.currentPage = page;

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Page-specific setup
  if (page === 'home')      renderFeaturedBundles();
  if (page === 'bundles')   renderBundlesPage();
  if (page === 'checkout')  setupCheckout(checkoutState.bundle);
  if (page === 'dashboard') renderDashboard();
}

// Navbar scroll effect
window.addEventListener('scroll', () => {
  const nav = document.getElementById('navbar');
  if (window.scrollY > 20) nav.classList.add('scrolled');
  else nav.classList.remove('scrolled');
});

// ─────────────────────────────────────────
// MOBILE MENU
// ─────────────────────────────────────────
function toggleMobileMenu() {
  const menu = document.getElementById('mobile-menu');
  menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
}

function closeMobileMenu() {
  document.getElementById('mobile-menu').style.display = 'none';
}

// ─────────────────────────────────────────
// BUNDLE CARD BUILDER
// ─────────────────────────────────────────
function buildBundleCard(bundle) {
  const net = NETWORKS[bundle.network];
  const pricePerGB = bundle.dataValue < 9999
    ? `GHS ${(bundle.price / bundle.dataValue).toFixed(2)}/GB`
    : 'Unlimited';

  const badgeHTML = bundle.badge
    ? `<span class="bundle-badge ${getBadgeClass(bundle.badge)}">${bundle.badge}</span>`
    : '';

  const durationLabel = `${bundle.duration} ${bundle.durationUnit}`;

  return `
    <div class="bundle-card ${bundle.network}" id="card-${bundle.id}">
      <div class="bundle-card-header">
        <span class="bundle-network-pill ${bundle.network}">${net.name}</span>
        ${badgeHTML}
      </div>
      <div class="bundle-data ${bundle.network}">${bundle.data}</div>
      <div class="bundle-name">${bundle.name}</div>
      <div class="bundle-meta">
        <div class="bundle-meta-item">
          <span class="bundle-meta-icon">⏱</span>
          <span>${durationLabel}</span>
        </div>
        <div class="bundle-meta-item">
          <span class="bundle-meta-icon">📶</span>
          <span>${net.name}</span>
        </div>
      </div>
      <div class="bundle-footer">
        <div class="bundle-price">
          <span class="bundle-price-currency">GHS</span>
          <span class="bundle-price-amount">${bundle.price.toFixed(2)}</span>
          <span class="bundle-price-per">${pricePerGB}</span>
        </div>
        <button class="btn-buy ${bundle.network}" onclick="buyBundle('${bundle.id}')">
          Buy Now
        </button>
      </div>
    </div>
  `;
}

function getBadgeClass(badge) {
  if (badge === 'Premium') return 'premium';
  if (badge === 'Power User') return 'power';
  return '';
}

// ─────────────────────────────────────────
// HOME — FEATURED BUNDLES
// ─────────────────────────────────────────
function renderFeaturedBundles() {
  const grid = document.getElementById('featured-bundles-grid');
  if (!grid) return;
  const popular = getPopularBundles(6);
  grid.innerHTML = popular.map(buildBundleCard).join('');
}

// ─────────────────────────────────────────
// BUNDLES PAGE
// ─────────────────────────────────────────
function renderBundlesPage() {
  applyFilters();
}

function filterNetwork(networkId) {
  checkoutState.fromPage = 'bundles';
  navigate('bundles');
  // Set the filter dropdown
  const sel = document.getElementById('filter-network');
  if (sel) {
    sel.value = networkId;
    state.filterNetwork = networkId;
    applyFilters();
  }
}

function applyFilters() {
  const networkVal  = document.getElementById('filter-network')?.value  || 'all';
  const categoryVal = document.getElementById('filter-category')?.value || 'all';
  const sortVal     = document.getElementById('filter-sort')?.value     || 'default';
  const query       = (document.getElementById('search-input')?.value   || '').toLowerCase().trim();

  state.filterNetwork  = networkVal;
  state.filterCategory = categoryVal;
  state.filterSort     = sortVal;
  state.searchQuery    = query;

  let results = [...BUNDLES];

  if (networkVal !== 'all')  results = results.filter(b => b.network  === networkVal);
  if (categoryVal !== 'all') results = results.filter(b => b.category === categoryVal);
  if (query) {
    results = results.filter(b =>
      b.name.toLowerCase().includes(query)  ||
      b.data.toLowerCase().includes(query)  ||
      NETWORKS[b.network].name.toLowerCase().includes(query) ||
      b.category.includes(query)
    );
  }

  // Sort
  if (sortVal === 'price-asc')  results.sort((a, b) => a.price - b.price);
  if (sortVal === 'price-desc') results.sort((a, b) => b.price - a.price);
  if (sortVal === 'data-asc')   results.sort((a, b) => a.dataValue - b.dataValue);
  if (sortVal === 'data-desc')  results.sort((a, b) => b.dataValue - a.dataValue);

  const grid    = document.getElementById('bundles-grid');
  const noRes   = document.getElementById('no-bundles');
  const countEl = document.getElementById('results-num');

  if (!grid) return;

  if (results.length === 0) {
    grid.innerHTML = '';
    noRes.style.display = 'block';
    if (countEl) countEl.textContent = '0';
    return;
  }

  noRes.style.display = 'none';
  if (countEl) countEl.textContent = results.length;
  grid.innerHTML = results.map(buildBundleCard).join('');
}

function resetFilters() {
  document.getElementById('filter-network').value  = 'all';
  document.getElementById('filter-category').value = 'all';
  document.getElementById('filter-sort').value     = 'default';
  document.getElementById('search-input').value    = '';
  applyFilters();
}

// ─────────────────────────────────────────
// BUY — NAVIGATE TO CHECKOUT
// ─────────────────────────────────────────
function buyBundle(bundleId) {
  const bundle = getBundleById(bundleId);
  if (!bundle) return;

  checkoutState.bundle   = bundle;
  checkoutState.fromPage = state.currentPage;

  navigate('checkout');
}

// ─────────────────────────────────────────
// CHECKOUT SETUP
// ─────────────────────────────────────────
function setupCheckout(bundle) {
  if (!bundle) {
    navigate('bundles');
    return;
  }

  const net = NETWORKS[bundle.network];

  // Update summary card class
  const card = document.getElementById('checkout-summary-card');
  card.className = `order-summary-card ${bundle.network}`;

  // Fill fields
  document.getElementById('co-data').textContent     = bundle.data;
  document.getElementById('co-data').className       = `data-amount ${bundle.network}`;
  document.getElementById('co-name').textContent     = bundle.name;
  document.getElementById('co-price').textContent    = bundle.price.toFixed(2);
  document.getElementById('co-network').textContent  = net.fullName;
  document.getElementById('co-validity').textContent = `${bundle.duration} ${bundle.durationUnit}`;
  document.getElementById('co-category').textContent = capitalize(bundle.category);
  document.getElementById('pay-amount').textContent  = bundle.price.toFixed(2);

  // Reset form
  document.getElementById('phone-input').value = '';
  document.getElementById('email-input').value = '';
  document.getElementById('phone-error').classList.remove('show');
  document.getElementById('email-error').classList.remove('show');
}

// ─────────────────────────────────────────
// FORM VALIDATION
// ─────────────────────────────────────────
function validatePhone() {
  const phone = document.getElementById('phone-input').value.trim();
  const err   = document.getElementById('phone-error');
  const valid = /^0[235][0-9]{8}$/.test(phone);
  err.classList.toggle('show', phone.length > 0 && !valid);
  return valid && phone.length > 0;
}

function validateEmail() {
  const email = document.getElementById('email-input').value.trim();
  const err   = document.getElementById('email-error');
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  err.classList.toggle('show', email.length > 0 && !valid);
  return valid && email.length > 0;
}

// ─────────────────────────────────────────
// PAYSTACK PAYMENT
// ─────────────────────────────────────────
function initiatePayment() {
  const bundle = checkoutState.bundle;
  if (!bundle) return;

  const phoneOk = validatePhone();
  const emailOk = validateEmail();

  if (!phoneOk) {
    document.getElementById('phone-error').classList.add('show');
    document.getElementById('phone-input').focus();
    showToast('⚠️ Please enter a valid phone number', 'error');
    return;
  }

  if (!emailOk) {
    document.getElementById('email-error').classList.add('show');
    document.getElementById('email-input').focus();
    showToast('⚠️ Please enter a valid email address', 'error');
    return;
  }

  const phone = document.getElementById('phone-input').value.trim();
  const email = document.getElementById('email-input').value.trim();
  const ref   = `BDL_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

  // Disable button
  const btn = document.getElementById('pay-btn');
  btn.disabled = true;
  btn.innerHTML = `<div class="spinner"></div> <span>Opening Paystack…</span>`;

  // Launch Paystack popup
  const handler = PaystackPop.setup({
    key:      PAYSTACK_PUBLIC_KEY,
    email:    email,
    amount:   Math.round(bundle.price * 100), // in pesewas
    currency: 'GHS',
    ref:      ref,
    metadata: {
      custom_fields: [
        { display_name: 'Phone Number', variable_name: 'phone', value: phone },
        { display_name: 'Bundle',       variable_name: 'bundle', value: bundle.name },
        { display_name: 'Network',      variable_name: 'network', value: bundle.network },
      ],
    },
    callback: function(response) {
      // Payment successful
      onPaymentSuccess(response, bundle, phone, email);
    },
    onClose: function() {
      // User closed popup
      btn.disabled = false;
      btn.innerHTML = `<span>🔐</span><span>Pay GHS ${bundle.price.toFixed(2)} with Paystack</span>`;
      showToast('ℹ️ Payment cancelled', 'info');
    },
  });

  handler.openIframe();
}

function onPaymentSuccess(response, bundle, phone, email) {
  // Save order to localStorage
  const order = {
    id:          response.reference || response.trxref,
    bundleId:    bundle.id,
    network:     bundle.network,
    bundleName:  bundle.name,
    data:        bundle.data,
    dataValue:   bundle.dataValue,
    duration:    bundle.duration,
    durationUnit: bundle.durationUnit,
    price:       bundle.price,
    phone:       phone,
    email:       email,
    purchasedAt: new Date().toISOString(),
    expiresAt:   addDays(new Date(), bundle.duration).toISOString(),
    usedPercent: Math.floor(Math.random() * 30), // Simulated usage
    status:      'active',
  };

  saveOrder(order);

  // Fill success page
  document.getElementById('success-ref').textContent     = order.id;
  document.getElementById('success-data').textContent    = bundle.data;
  document.getElementById('success-network').textContent = NETWORKS[bundle.network].fullName;
  document.getElementById('success-phone').textContent   = phone;
  document.getElementById('success-amount').textContent  = `GHS ${bundle.price.toFixed(2)}`;

  showToast('✅ Payment successful! Bundle activated.', 'success');
  navigate('success');
}

// ─────────────────────────────────────────
// LOCALSTORAGE — ORDERS
// ─────────────────────────────────────────
function saveOrder(order) {
  const orders = getOrders();
  orders.unshift(order); // newest first
  localStorage.setItem('bundlegh_orders', JSON.stringify(orders));
}

function getOrders() {
  try {
    return JSON.parse(localStorage.getItem('bundlegh_orders')) || [];
  } catch {
    return [];
  }
}

function getActiveOrders() {
  const now = new Date();
  return getOrders().filter(o => o.status === 'active' && new Date(o.expiresAt) > now);
}

function getExpiredOrders() {
  const now = new Date();
  return getOrders().filter(o => o.status !== 'active' || new Date(o.expiresAt) <= now);
}

// ─────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────
function renderDashboard() {
  const orders  = getOrders();
  const active  = getActiveOrders();
  const expired = getExpiredOrders();

  // Stats
  document.getElementById('stat-active').textContent         = active.length;
  document.getElementById('stat-total-purchases').textContent = orders.length;
  document.getElementById('stat-total-spent').textContent =
    `GHS ${orders.reduce((sum, o) => sum + o.price, 0).toFixed(2)}`;

  const body = document.getElementById('dashboard-body');

  if (orders.length === 0) {
    body.innerHTML = `
      <div class="empty-dashboard">
        <div class="empty-dashboard-icon">📡</div>
        <h3>No bundles yet</h3>
        <p>You haven't purchased any data bundles yet. Get started by buying a bundle for your network!</p>
        <button class="btn-primary" onclick="navigate('bundles')" style="margin:0 auto;">
          Browse Bundles →
        </button>
      </div>
    `;
    return;
  }

  let html = '';

  // Active bundles
  if (active.length > 0) {
    html += `
      <div class="dashboard-section-title">
        <span>🟢</span> Active Bundles
        <span style="font-size:14px;font-weight:500;color:var(--text-secondary);margin-left:4px;">(${active.length})</span>
      </div>
      <div class="active-bundles">
        ${active.map(buildActiveBundleCard).join('')}
      </div>
    `;
  }

  // Purchase History
  html += `
    <div class="dashboard-section-title" style="margin-top:${active.length ? '0' : '0'}">
      <span>🧾</span> Purchase History
    </div>
    <div class="history-table-wrap">
      <table class="history-table">
        <thead>
          <tr>
            <th>Bundle</th>
            <th>Network</th>
            <th>Phone</th>
            <th>Amount</th>
            <th>Date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${orders.map(buildHistoryRow).join('')}
        </tbody>
      </table>
    </div>
  `;

  body.innerHTML = html;

  // Animate usage bars
  setTimeout(() => {
    document.querySelectorAll('.usage-bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.width + '%';
    });
  }, 100);
}

function buildActiveBundleCard(order) {
  const net        = NETWORKS[order.network];
  const used       = order.usedPercent || 0;
  const remaining  = 100 - used;
  const expiresAt  = new Date(order.expiresAt);
  const daysLeft   = Math.max(0, Math.ceil((expiresAt - new Date()) / 86400000));
  const usedData   = order.dataValue < 9999
    ? `${((order.dataValue * used) / 100).toFixed(2)}GB used`
    : `${used}% used`;
  const totalData  = order.dataValue < 9999 ? order.data : 'Unlimited';

  return `
    <div class="active-bundle-card">
      <div class="active-bundle-top">
        <span class="active-bundle-network ${order.network}">${net.name}</span>
        <span class="active-bundle-status">
          <span class="status-dot"></span> Active
        </span>
      </div>
      <div class="active-bundle-data ${order.network}">${order.data}</div>
      <div class="active-bundle-name">${order.bundleName} · ${order.phone}</div>
      <div class="usage-bar-wrap">
        <div class="usage-bar-label">
          <span class="used">${usedData}</span>
          <span>${remaining}% left</span>
        </div>
        <div class="usage-bar-track">
          <div class="usage-bar-fill ${order.network}" data-width="${used}" style="width:0%"></div>
        </div>
      </div>
      <div class="active-bundle-footer">
        <div>
          <div class="expires-label">Expires in</div>
          <div class="expires-value">${daysLeft} day${daysLeft !== 1 ? 's' : ''}</div>
        </div>
        <button class="btn-renew" onclick="buyBundle('${order.bundleId}')">
          🔄 Renew
        </button>
      </div>
    </div>
  `;
}

function buildHistoryRow(order) {
  const now     = new Date();
  const expired = new Date(order.expiresAt) <= now;
  const status  = expired ? 'expired' : 'success';
  const label   = expired ? 'Expired' : 'Active';
  const icon    = expired ? '⚪' : '🟢';
  const date    = new Date(order.purchasedAt).toLocaleDateString('en-GH', {
    day: '2-digit', month: 'short', year: 'numeric'
  });

  return `
    <tr>
      <td>
        <div style="font-weight:700;">${order.data}</div>
        <div style="font-size:12px;color:var(--text-muted);">${order.bundleName}</div>
      </td>
      <td>
        <span class="history-network-pill ${order.network}">
          ${NETWORKS[order.network].name}
        </span>
      </td>
      <td style="color:var(--text-secondary);">${order.phone}</td>
      <td style="font-weight:700;">GHS ${order.price.toFixed(2)}</td>
      <td style="color:var(--text-secondary);font-size:13px;">${date}</td>
      <td>
        <span class="history-status-badge ${status}">
          ${icon} ${label}
        </span>
      </td>
    </tr>
  `;
}

// ─────────────────────────────────────────
// TOAST NOTIFICATIONS
// ─────────────────────────────────────────
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  const toast     = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Update network counts on home page
  document.getElementById('mtn-count').textContent = `${getBundlesByNetwork('mtn').length} bundles available`;
  document.getElementById('at-count').textContent  = `${getBundlesByNetwork('airteltigo').length} bundles available`;
  document.getElementById('tc-count').textContent  = `${getBundlesByNetwork('telecel').length} bundles available`;
  document.getElementById('total-count').textContent = BUNDLES.length;
  document.getElementById('stat-bundles').textContent = `${BUNDLES.length}+`;

  // Initial page render
  renderFeaturedBundles();

  // Handle URL hash for direct linking
  const hash = window.location.hash.replace('#', '');
  if (['home', 'bundles', 'dashboard'].includes(hash)) navigate(hash);
});
