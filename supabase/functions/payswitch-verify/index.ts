// ════════════════════════════════════════════════════════════
//  payswitch-verify  —  confirm a TelaPay charge and flip order to PAID.
//  Used by the web checkout's polling AND by telapay-callback.
//
//  Deploy: supabase functions deploy payswitch-verify
// ════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { notifyTelegram } from '../_shared/notify.ts';
import { checkStatus } from '../_shared/telapay.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { transactionId } = await req.json();
    if (!transactionId) return json({ error: 'Missing transactionId.' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('payment_ref', transactionId)
      .maybeSingle();
    if (!order) return json({ error: 'Order not found.' }, 404);
    if (order.status === 'paid') return json({ status: 'paid', order }); // idempotent

    const result = await checkStatus(transactionId);

    if (result.code === '101') return json({ status: 'pending', order });
    if (result.code !== '000') {
      return json({ status: 'failed', error: `Payment not successful (${result.status ?? result.code}).` }, 200);
    }

    // Success. Confirm the amount (TelaPay's original_amount is pre-surcharge).
    if (result.originalAmount != null && Math.abs(result.originalAmount - Number(order.price)) > 0.01) {
      return json({ status: 'failed', error: 'Amount mismatch — rejected.' }, 200);
    }

    const { data: updated } = await supabase
      .from('orders')
      .update({ status: 'paid' })
      .eq('id', order.id)
      .select()
      .single();

    if (updated) await notifyTelegram(updated);
    return json({ status: 'paid', order: updated ?? order });
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Unexpected error.' }, 500);
  }
});
