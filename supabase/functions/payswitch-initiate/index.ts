// ════════════════════════════════════════════════════════════
//  payswitch-initiate  —  WEB MoMo charge via TelaPay TPay V2.
//
//  Records a PENDING order and initiates a Mobile Money charge on the
//  customer's number (they approve on their phone). The final result
//  arrives at telapay-callback; the frontend also polls payswitch-verify.
//
//  Deploy:  supabase functions deploy payswitch-initiate
//  Secrets: TELAPAY_CLIENT_ID, TELAPAY_CLIENT_SECRET, TELAPAY_TERMINAL_ID
// ════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getBundle } from '../_shared/catalogue.ts';
import { initiateCharge } from '../_shared/telapay.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const makeTransactionId = () => {
  const t = String(Date.now()).slice(-10);
  const r = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  return t + r; // 12 digits
};
const isGhPhone = (p: string) => /^0[235][0-9]{8}$/.test(String(p || '').trim());

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { bundleId, phone, payerPhone } = await req.json();
    const recipient = String(phone || '').trim();
    const payer = String(payerPhone || phone || '').trim();
    if (!bundleId || !recipient) return json({ error: 'Missing bundle or number.' }, 400);
    if (!isGhPhone(recipient)) return json({ error: 'Invalid number to top up.' }, 400);
    if (!isGhPhone(payer)) return json({ error: 'Invalid Mobile Money number.' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const bundle = await getBundle(supabase, bundleId);
    if (!bundle) return json({ error: 'Unknown bundle.' }, 400);

    const transactionId = makeTransactionId();

    const { error: insertErr } = await supabase.from('orders').insert({
      reference: transactionId,
      bundle_id: bundle.id,
      bundle_name: bundle.name,
      network: bundle.network,
      data: bundle.data,
      price: bundle.price,
      phone: recipient,
      email: null,
      status: 'pending',
      channel: 'web',
      payment_method: 'telapay-momo',
      payment_ref: transactionId,
      payer_phone: payer,
    });
    if (insertErr) return json({ error: `Could not start order: ${insertErr.message}` }, 500);

    const charge = await initiateCharge({
      transactionId,
      amountGhs: bundle.price,
      subscriberNumber: payer,
      network: bundle.network,
      desc: `${bundle.name} to ${recipient}`,
      reference: transactionId,
      callbackUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/telapay-callback`,
    });

    if (!charge.ok) {
      await supabase.from('orders').update({ status: 'failed' }).eq('reference', transactionId);
      return json({ error: `Could not start payment (${charge.reason ?? charge.code}).` }, 502);
    }

    return json({ transaction_id: transactionId, status: 'pending' });
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Unexpected error.' }, 500);
  }
});
