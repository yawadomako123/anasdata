/* ═══════════════════════════════════════════
   PaySwitch (theTeller) inline checkout.

   Flow:
   1. Checkout calls the `payswitch-initiate` Edge Function → it records a
      PENDING order and returns a 12-digit transaction_id + formatted amount.
   2. We open the theTeller inline popup with that transaction_id.
   3. After payment, theTeller redirects the browser to `redirect_url` with
      query params (code, status, transaction_id).
   4. /payment/return calls `payswitch-verify` → the server confirms the
      payment with theTeller and flips the order to PAID.

   TEST endpoints are used now. For go-live, switch SCRIPT_SRC to the
   production inline script and set live credentials (see README).
═══════════════════════════════════════════ */

const API_KEY = import.meta.env.VITE_PAYSWITCH_API_KEY;

// TEST inline script. Production: https://checkout.theteller.net/resource/api/inline/theteller_inline.js
const SCRIPT_SRC = 'https://checkout-test.theteller.net/resource/api/inline/theteller_inline.js';

export const isPaySwitchConfigured = Boolean(API_KEY && !/x{4,}/i.test(API_KEY));

let scriptPromise = null;
function loadInlineScript() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-theteller]');
    if (existing) return resolve();
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.dataset.theteller = 'true';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('PaySwitch failed to load. Check your internet connection.'));
    document.body.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Open the theTeller inline popup.
 *
 * theTeller's inline script exposes a global `window.getpaidSetup(config)`
 * that opens the payment overlay. (Its documented anchor-with-data-attributes
 * approach only binds to `.ttlr_inline` anchors present when the script first
 * loads, which doesn't fit a single-page app — calling getpaidSetup directly
 * is the reliable equivalent, and is exactly what the anchor's click handler
 * calls internally.)
 *
 * @param {object} p
 * @param {string} p.transactionId  12-digit id from the initiate Edge Function
 * @param {string} p.amount         12-digit pesewas string from the server
 * @param {string} p.email          customer email
 * @param {string} p.description    narration shown on the popup
 * @param {string} p.redirectUrl    where theTeller returns after payment
 * @param {() => void} [p.onClose]  called if the customer closes the popup
 */
export async function openPaySwitchInline({
  transactionId,
  amount,
  email,
  description,
  redirectUrl,
  onClose,
}) {
  if (!isPaySwitchConfigured) {
    throw new Error('PaySwitch API key is not set. Add VITE_PAYSWITCH_API_KEY to .env.');
  }
  await loadInlineScript();

  if (typeof window.getpaidSetup !== 'function') {
    throw new Error('PaySwitch checkout failed to initialise. Please refresh and try again.');
  }

  window.getpaidSetup({
    APIKey: API_KEY,
    transid: transactionId,
    amount, // 12-digit pesewas
    customer_email: email,
    currency: 'GHS',
    redirect_url: redirectUrl,
    pay_button_text: 'Pay Now',
    custom_description: description,
    payment_method: 'both', // card + mobile money
    onclose: () => onClose && onClose(),
  });
}
