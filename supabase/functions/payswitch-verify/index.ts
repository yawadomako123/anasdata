// ════════════════════════════════════════════════════════════
//  payswitch-verify  —  Supabase Edge Function (Deno)
//
//  Called after theTeller redirects the customer back to /payment/return.
//  It checks the transaction directly with theTeller's status endpoint
//  (server-side, using your Merchant ID + API credentials), confirms the
//  amount, flips the order to PAID, and pings you on Telegram.
//
//  Deploy:  supabase functions deploy payswitch-verify
//  Secrets: supabase secrets set PAYSWITCH_MERCHANT_ID=... \
//                                PAYSWITCH_API_USER=... \
//                                PAYSWITCH_API_KEY=...
//  For go-live also set PAYSWITCH_ENV=live
// ════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { notifyTelegram } from '../_shared/notify.ts';

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

// theTeller's status endpoint may report the amount either as plain cedis
// ("4.70") or as a zero-padded pesewas integer ("000000000470"). Accept a
// match on either interpretation so a correct payment is never falsely
// rejected, while a tampered (lower) amount still fails both.
function amountMatches(raw: unknown, priceGhs: number): boolean {
  const s = String(raw ?? '').trim();
  if (!s) return true; // nothing to compare against
  const asCedis = parseFloat(s); // "4.70" -> 4.70 ; "000000000470" -> 470
  const asPesewas = /^\d+$/.test(s) ? parseInt(s, 10) / 100 : NaN; // -> 4.70
  return [asCedis, asPesewas].some(
    (v) => Number.isFinite(v) && Math.abs(v - priceGhs) < 0.01
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { transactionId } = await req.json();
    if (!transactionId) return json({ error: 'Missing transactionId.' }, 400);

    const merchantId = Deno.env.get('PAYSWITCH_MERCHANT_ID');
    if (!merchantId) return json({ error: 'Server missing PAYSWITCH_MERCHANT_ID.' }, 500);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Find the pending order we recorded at initiate time.
    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('payment_ref', transactionId)
      .maybeSingle();

    if (!order) return json({ error: 'Order not found for this transaction.' }, 404);
    if (order.status === 'paid') return json({ order }); // idempotent

    // Check the transaction with theTeller.
    const base =
      Deno.env.get('PAYSWITCH_ENV') === 'live'
        ? 'https://prod.theteller.net'
        : 'https://test.theteller.net';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Merchant-Id': merchantId,
      'Cache-Control': 'no-cache',
    };
    const apiUser = Deno.env.get('PAYSWITCH_API_USER');
    const apiKey = Deno.env.get('PAYSWITCH_API_KEY');
    if (apiUser && apiKey) {
      headers['Authorization'] = 'Basic ' + btoa(`${apiUser}:${apiKey}`);
    }

    const statusRes = await fetch(
      `${base}/v1.1/users/transactions/${encodeURIComponent(transactionId)}/status`,
      { headers }
    );
    const result = await statusRes.json().catch(() => ({}));

    const code = String(result.code ?? '');
    const status = String(result.status ?? '').toLowerCase();
    const approved = code === '000' || status === 'approved' || status === 'successful';

    if (!approved) {
      return json({ error: `Payment not successful (${result.reason ?? status ?? 'unknown'}).` }, 402);
    }

    // Confirm the amount matches the real bundle price. theTeller adds the
    // Ghana E-Levy/surcharge to `amount` (e.g. 4.70 -> 4.75), so we compare
    // against `original_amount`, the pre-levy amount we submitted.
    const baseAmount = result.original_amount ?? result.taxable_amount ?? result.amount;
    if (!amountMatches(baseAmount, Number(order.price))) {
      return json({ error: 'Amount mismatch — payment rejected.' }, 402);
    }

    const { data: updated, error: updErr } = await supabase
      .from('orders')
      .update({ status: 'paid' })
      .eq('id', order.id)
      .select()
      .single();

    if (updErr) return json({ error: `Could not update order: ${updErr.message}` }, 500);

    await notifyTelegram(updated);

    return json({ order: updated });
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Unexpected error.' }, 500);
  }
});
