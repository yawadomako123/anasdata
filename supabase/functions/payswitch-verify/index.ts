// ════════════════════════════════════════════════════════════
//  payswitch-verify  —  confirm a TelaPay charge and finish the order.
//  The web checkout polls this; it is also the backstop for when the
//  telapay-callback webhook never arrives.
//
//  PRIVACY: this endpoint is public and the transaction id is mostly a
//  timestamp, so it is guessable. It therefore returns ONLY a status
//  unless the caller also presents the order's delivery_token — the
//  random handle handed to the buying browser at initiation. Order
//  details (and a checker's PIN) require that token.
//
//  Deploy: supabase functions deploy payswitch-verify
// ════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkStatus } from '../_shared/telapay.ts';
import { confirmAndFulfil, markRetrieved } from '../_shared/fulfil.ts';
import { releaseVoucher } from '../_shared/vouchers.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** Only ever hand back fields the buyer already knows. Never payer_phone,
 *  email, ids, payment_ref or delivery_token. */
const publicOrder = (o: Record<string, unknown>) => ({
  reference: o.reference,
  product_type: o.product_type ?? 'data',
  bundle_name: o.bundle_name,
  data: o.data,
  network: o.network,
  phone: o.phone,
  price: o.price,
  status: o.status,
  created_at: o.created_at,
  delivered_at: o.delivered_at ?? null,
});

/** Length-safe compare so the token cannot be probed byte by byte. */
function tokenMatches(supplied: unknown, actual: unknown): boolean {
  const a = String(supplied ?? '');
  const b = String(actual ?? '');
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { transactionId, deliveryToken } = await req.json();
    if (!transactionId) return json({ error: 'Missing transactionId.' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: order } = await supabase
      .from('orders').select('*').eq('payment_ref', transactionId).maybeSingle();
    if (!order) return json({ error: 'Order not found.' }, 404);

    const trusted = tokenMatches(deliveryToken, order.delivery_token);

    // Every reply has the same shape: status is public, detail is not.
    const respond = async (
      status: string,
      o: Record<string, unknown>,
      extra: Record<string, unknown> = {}
    ) => {
      if (!trusted) return json({ status, ...extra });
      const body: Record<string, unknown> = { status, order: publicOrder(o), ...extra };
      // A checker PIN is only ever released to the holder of the token.
      if (o.product_type === 'checker' && (o.status === 'done' || o.status === 'processing')) {
        const { data: v } = await supabase
          .from('vouchers').select('serial, pin').eq('order_id', o.id).maybeSingle();
        if (v) {
          body.voucher = { serial: v.serial, pin: v.pin };
          await markRetrieved(supabase, String(o.id));
        }
      }
      return json(body);
    };

    if (order.status === 'processing' || order.status === 'done') {
      return await respond('paid', order);
    }
    if (order.status === 'failed') {
      return await respond('failed', order, { error: 'Payment was not completed.' });
    }

    const result = await checkStatus(transactionId);

    if (result.code === '101') return await respond('pending', order);

    if (result.code !== '000') {
      if (order.product_type === 'checker') await releaseVoucher(supabase, String(order.id));
      await supabase.from('orders').update({ status: 'failed' }).eq('id', order.id);
      return await respond('failed', order, {
        error: `Payment not successful (${result.status ?? result.code}).`,
      });
    }

    // Confirm the amount (TelaPay's original_amount is pre-surcharge).
    if (result.originalAmount != null && Math.abs(result.originalAmount - Number(order.price)) > 0.01) {
      if (order.product_type === 'checker') await releaseVoucher(supabase, String(order.id));
      await supabase.from('orders').update({ status: 'failed' }).eq('id', order.id);
      return await respond('failed', order, { error: 'Amount mismatch — rejected.' });
    }

    const { order: updated } = await confirmAndFulfil(supabase, order);
    return await respond('paid', updated);
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Unexpected error.' }, 500);
  }
});
