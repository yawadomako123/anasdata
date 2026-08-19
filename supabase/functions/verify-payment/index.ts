// ════════════════════════════════════════════════════════════
//  verify-payment  —  Supabase Edge Function (Deno)
//
//  Called by the storefront AFTER Paystack collects payment.
//  It re-verifies the transaction directly with Paystack using the
//  SECRET key (which never touches the browser), confirms the amount,
//  records the order, and pings you on Telegram.
//
//  Deploy:  supabase functions deploy verify-payment
//  Secrets: supabase secrets set PAYSTACK_SECRET_KEY=sk_... \
//                                TELEGRAM_BOT_TOKEN=... \
//                                TELEGRAM_CHAT_ID=...
//  (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.)
// ════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getBundle } from '../_shared/catalogue.ts';
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { reference, bundleId, phone, email } = await req.json();

    if (!reference || !bundleId || !phone) {
      return json({ error: 'Missing reference, bundleId, or phone.' }, 400);
    }

    const bundle = getBundle(bundleId);
    if (!bundle) return json({ error: 'Unknown bundle.' }, 400);

    const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!secret) return json({ error: 'Server missing PAYSTACK_SECRET_KEY.' }, 500);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Idempotency: if we already recorded this reference, just return it.
    const { data: existing } = await supabase
      .from('orders')
      .select('*')
      .eq('reference', reference)
      .maybeSingle();
    if (existing) return json({ order: existing });

    // Verify with Paystack (source of truth).
    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secret}` } }
    );
    const verifyJson = await verifyRes.json();

    if (!verifyJson.status || verifyJson.data?.status !== 'success') {
      return json({ error: 'Payment not successful or not found.' }, 402);
    }

    // Confirm the amount paid matches the real bundle price (guards against tampering).
    const expectedPesewas = Math.round(bundle.price * 100);
    if (Number(verifyJson.data.amount) !== expectedPesewas) {
      return json({ error: 'Amount mismatch — payment rejected.' }, 402);
    }

    const order = {
      reference,
      bundle_id: bundleId,
      bundle_name: bundle.name,
      network: bundle.network,
      data: bundle.data,
      price: bundle.price,
      phone,
      email: email ?? null,
      status: 'paid',
      channel: 'web',
      payment_method: 'paystack',
    };

    const { data: inserted, error: insertErr } = await supabase
      .from('orders')
      .insert(order)
      .select()
      .single();

    if (insertErr) return json({ error: `Could not save order: ${insertErr.message}` }, 500);

    await notifyTelegram(inserted);

    return json({ order: inserted });
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Unexpected error.' }, 500);
  }
});
