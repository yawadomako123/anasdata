// Shared theTeller (PaySwitch) helpers for the USSD Mobile Money charge.
// Web checkout uses the inline popup; USSD uses theTeller's direct MoMo
// "process" API, which sends the dialer a PIN prompt.

export const toPesewas12 = (ghs: number) => String(Math.round(ghs * 100)).padStart(12, '0');

export const makeTxnId = () => {
  const t = String(Date.now()).slice(-10);
  const r = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  return t + r;
};

// Map a network name (from the USSD gateway) to theTeller's r-switch code.
export function rSwitchFor(network: string): string {
  const n = String(network || '').toUpperCase();
  if (n.includes('MTN')) return 'MTN';
  if (n.includes('VODA') || n.includes('TELECEL')) return 'VDF';
  if (n.includes('AIRTEL') || n.includes('TIGO') || n === 'AT') return 'ATL';
  return 'MTN';
}

const base = () =>
  Deno.env.get('PAYSWITCH_ENV') === 'live'
    ? 'https://prod.theteller.net'
    : 'https://test.theteller.net';

/**
 * Trigger a Mobile Money debit on the payer's number. theTeller responds
 * immediately (the charge is async — the customer approves with a PIN), and
 * the final result arrives at your theTeller callback URL.
 *
 * @returns 'sent'   — PIN prompt dispatched
 *          'skipped'— theTeller credentials not configured
 *          'failed' — request rejected
 */
export async function initiateMomoCharge(opts: {
  transactionId: string;
  amountGhs: number;
  subscriberNumber: string; // payer's number, 233XXXXXXXXX
  network: string; // payer's network (from the USSD gateway)
  desc: string;
}): Promise<'sent' | 'skipped' | 'failed'> {
  const merchantId = Deno.env.get('PAYSWITCH_MERCHANT_ID');
  const apiUser = Deno.env.get('PAYSWITCH_API_USER');
  const apiKey = Deno.env.get('PAYSWITCH_API_KEY');
  if (!merchantId || !apiUser || !apiKey) return 'skipped';

  try {
    const res = await fetch(`${base()}/v1.1/transaction/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + btoa(`${apiUser}:${apiKey}`),
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({
        merchant_id: merchantId,
        transaction_id: opts.transactionId,
        amount: toPesewas12(opts.amountGhs), // direct API uses 12-digit pesewas
        processing_code: '000200',
        'r-switch': rSwitchFor(opts.network),
        subscriber_number: String(opts.subscriberNumber).replace(/\D/g, ''),
        desc: opts.desc,
      }),
    });
    return res.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}
