import { makeRef } from './format';

const PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;

export const isPaystackConfigured = Boolean(
  PUBLIC_KEY && !PUBLIC_KEY.includes('xxxxxxxx')
);

/**
 * Open the Paystack popup. Resolves with the transaction reference on success,
 * rejects if the customer closes the popup.
 *
 * NOTE: Success here only means Paystack collected the money. The order is not
 * trusted until the backend Edge Function verifies the reference server-side.
 */
export function payWithPaystack({ email, phone, amountGhs, bundle }) {
  return new Promise((resolve, reject) => {
    if (typeof window.PaystackPop === 'undefined') {
      reject(new Error('Paystack failed to load. Check your internet connection.'));
      return;
    }
    if (!isPaystackConfigured) {
      reject(new Error('Paystack public key is not set. Add VITE_PAYSTACK_PUBLIC_KEY to .env.'));
      return;
    }

    const reference = makeRef();

    const handler = window.PaystackPop.setup({
      key: PUBLIC_KEY,
      email,
      amount: Math.round(amountGhs * 100), // pesewas
      currency: 'GHS',
      ref: reference,
      metadata: {
        custom_fields: [
          { display_name: 'Phone Number', variable_name: 'phone', value: phone },
          { display_name: 'Bundle', variable_name: 'bundle', value: bundle.name },
          { display_name: 'Network', variable_name: 'network', value: bundle.network },
        ],
      },
      callback: (response) => resolve(response.reference || response.trxref || reference),
      onClose: () => reject(new Error('Payment cancelled.')),
    });

    handler.openIframe();
  });
}
