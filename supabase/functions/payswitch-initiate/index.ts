// ════════════════════════════════════════════════════════════
//  payswitch-initiate  —  Supabase Edge Function (Deno)
//
//  theTeller STANDARD CHECKOUT (redirect flow). It:
//    1. Looks up the bundle price from the DB (never trusts the client).
//    2. Generates a 12-digit transaction id.
//    3. Calls theTeller /initiate (server-side, Basic auth) to get a
//       hosted checkout_url — the API key never touches the browser.
//    4. Records a PENDING order, then returns { transaction_id, checkout_url }.
//  The frontend redirects the customer to checkout_url; theTeller returns
//  them to redirect_url, where payswitch-verify confirms the payment.
//
//  Deploy:  supabase functions deploy payswitch-initiate
//  Secrets: PAYSWITCH_MERCHANT_ID, PAYSWITCH_API_USER, PAYSWITCH_API_KEY,
//           PAYSWITCH_ENV (live|test)
// ════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getBundle } from '../_shared/catalogue.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// theTeller's checkout /initiate uses a 12-digit zero-padded pesewas string.
const toPesewas12 = (ghs: number) => String(Math.round(ghs * 100)).padStart(12, '0');

const makeTransactionId = () => {
  const t = String(Date.now()).slice(-10);
  const r = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  return t + r;
};

const isGhPhone = (p: string) => /^0[235][0-9]{8}$/.test(String(p || '').trim());

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { bundleId, phone, redirectUrl } = await req.json();
    if (!bundleId || !phone || !redirectUrl) {
      return json({ error: 'Missing bundleId, phone, or redirectUrl.' }, 400);
    }
    if (!isGhPhone(phone)) return json({ error: 'Invalid Ghana phone number.' }, 400);

    const merchantId = Deno.env.get('PAYSWITCH_MERCHANT_ID');
    const apiUser = Deno.env.get('PAYSWITCH_API_USER');
    const apiKey = Deno.env.get('PAYSWITCH_API_KEY');
    if (!merchantId || !apiUser || !apiKey) {
      return json({ error: 'Payment is not configured. Please try again later.' }, 500);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const bundle = await getBundle(supabase, bundleId);
    if (!bundle) return json({ error: 'Unknown bundle.' }, 400);

    const transactionId = makeTransactionId();
    // We removed email collection; theTeller still wants one, so derive a
    // harmless placeholder from the phone.
    const email = `${phone}@nomail.anasdata.app`;

    const base =
      Deno.env.get('PAYSWITCH_ENV') === 'live'
        ? 'https://checkout.theteller.net'
        : 'https://checkout-test.theteller.net';

    const initRes = await fetch(`${base}/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + btoa(`${apiUser}:${apiKey}`),
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({
        merchant_id: merchantId,
        transaction_id: transactionId,
        desc: `${bundle.name} to ${phone}`,
        amount: toPesewas12(bundle.price),
        redirect_url: redirectUrl,
        email,
        API_Key: apiKey,
        apiuser: apiUser,
      }),
    });

    const result = await initRes.json().catch(() => ({}));
    const checkoutUrl = result.checkout_url;
    const okStatus =
      String(result.status ?? '').toLowerCase() === 'success' ||
      String(result.code ?? '') === '200';

    if (!checkoutUrl || !okStatus) {
      return json(
        { error: `Could not start checkout (${result.reason ?? 'unknown error'}).` },
        502
      );
    }

    // Record the pending order only once theTeller accepted the transaction.
    const { error: insertErr } = await supabase.from('orders').insert({
      reference: transactionId,
      bundle_id: bundle.id,
      bundle_name: bundle.name,
      network: bundle.network,
      data: bundle.data,
      price: bundle.price,
      phone,
      email: null,
      status: 'pending',
      channel: 'web',
      payment_method: 'theteller-checkout',
      payment_ref: transactionId,
    });
    if (insertErr) return json({ error: `Could not start order: ${insertErr.message}` }, 500);

    return json({ transaction_id: transactionId, checkout_url: checkoutUrl });
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Unexpected error.' }, 500);
  }
});
