// ════════════════════════════════════════════════════════════
//  theteller-callback  —  theTeller MoMo result webhook
//
//  theTeller POSTs the final Mobile Money result here after the customer
//  approves (or declines) the PIN prompt for a USSD order. We pull the
//  transaction id and hand it to payswitch-verify, which does the real
//  status check, confirms the amount (E-Levy aware), flips the order to
//  PAID and sends the Telegram alert — the exact same path as web.
//
//  Configure this URL as your theTeller callback / webhook.
//  Deploy: supabase functions deploy theteller-callback --no-verify-jwt
// ════════════════════════════════════════════════════════════
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const ok = (body: unknown = { ok: true }) =>
  new Response(JSON.stringify(body), { headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // theTeller may send JSON, form data, or query params — try them all.
  let txn = new URL(req.url).searchParams.get('transaction_id') || '';
  if (!txn) {
    try {
      const b = await req.clone().json();
      txn = String(b.transaction_id ?? b.transactionId ?? b.transid ?? '');
    } catch {
      try {
        const form = await req.clone().formData();
        txn = String(form.get('transaction_id') ?? form.get('transid') ?? '');
      } catch {
        /* ignore */
      }
    }
  }

  if (!txn) return ok({ ok: false, reason: 'no transaction_id' });

  // Reuse the web verification path so all the amount/E-Levy logic lives in
  // one place.
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    await fetch(`${url}/functions/v1/payswitch-verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anon,
        Authorization: `Bearer ${anon}`,
      },
      body: JSON.stringify({ transactionId: txn }),
    });
  } catch {
    /* theTeller just needs a 200 ack; verification can be retried */
  }

  return ok();
});
