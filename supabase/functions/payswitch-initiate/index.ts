// ════════════════════════════════════════════════════════════
//  payswitch-initiate  —  Supabase Edge Function (Deno)
//
//  Called BEFORE the theTeller inline popup opens. It:
//    1. Looks up the bundle price from the DB (never trusts the client).
//    2. Generates a 12-digit transaction id.
//    3. Records a PENDING order keyed by that transaction id.
//    4. Returns { transaction_id, amount } for the inline popup.
//
//  Deploy:  supabase functions deploy payswitch-initiate
//  (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.)
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

// theTeller wants a 12-digit zero-padded pesewas string.
const toPesewas12 = (ghs: number) => String(Math.round(ghs * 100)).padStart(12, '0');

// 12-digit numeric transaction id.
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
    const { bundleId, phone, email } = await req.json();
    if (!bundleId || !phone) return json({ error: 'Missing bundleId or phone.' }, 400);
    if (!isGhPhone(phone)) return json({ error: 'Invalid Ghana phone number.' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const bundle = await getBundle(supabase, bundleId);
    if (!bundle) return json({ error: 'Unknown bundle.' }, 400);

    const transactionId = makeTransactionId();

    const order = {
      reference: transactionId,
      bundle_id: bundle.id,
      bundle_name: bundle.name,
      network: bundle.network,
      data: bundle.data,
      price: bundle.price,
      phone,
      email: email ?? null,
      status: 'pending',
      channel: 'web',
      payment_method: 'payswitch',
      payment_ref: transactionId,
    };

    const { error: insertErr } = await supabase.from('orders').insert(order);
    if (insertErr) return json({ error: `Could not start order: ${insertErr.message}` }, 500);

    return json({ transaction_id: transactionId, amount: toPesewas12(bundle.price) });
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Unexpected error.' }, 500);
  }
});
