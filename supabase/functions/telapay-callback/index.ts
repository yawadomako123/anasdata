// ════════════════════════════════════════════════════════════
//  telapay-callback  —  TelaPay TPay V2 webhook.
//
//  TelaPay POSTs the final MoMo result here (both web + USSD). We verify the
//  X-Signature (HMAC-SHA256 of the raw body), and on code "000" finish the
//  order: data bundles join the admin load queue, checkers claim their
//  reserved PIN and go out by SMS. Ack with 200 quickly.
//
//  Set this as the `callback` — it's sent automatically on every charge.
//  Deploy: supabase functions deploy telapay-callback --no-verify-jwt
// ════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySignature } from '../_shared/telapay.ts';
import { confirmAndFulfil } from '../_shared/fulfil.ts';
import { releaseVoucher } from '../_shared/vouchers.ts';

Deno.serve(async (req) => {
  const ok = () => new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  if (req.method !== 'POST') return ok();

  const raw = await req.text();
  const signature = req.headers.get('X-Signature') || req.headers.get('x-signature') || '';

  // Verify authenticity. If it doesn't check out, acknowledge but don't act.
  const valid = await verifySignature(raw, signature).catch(() => false);
  if (!valid) return ok();

  let body: Record<string, unknown> = {};
  try { body = JSON.parse(raw); } catch { return ok(); }

  const txn = String(body.transaction_id ?? '');
  const code = String(body.code ?? '');
  if (!txn) return ok();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const { data: order } = await supabase
      .from('orders').select('*').eq('payment_ref', txn).maybeSingle();
    if (!order) return ok();

    // Not a success → hand any held PIN back to stock.
    if (code !== '000') {
      if (order.status === 'pending') {
        if (order.product_type === 'checker') await releaseVoucher(supabase, String(order.id));
        await supabase.from('orders').update({ status: 'failed' }).eq('id', order.id);
      }
      return ok();
    }

    // confirmAndFulfil is idempotent, so a redelivered webhook is harmless.
    await confirmAndFulfil(supabase, order);
  } catch { /* ack anyway; the verify-poll is the backstop */ }

  return ok();
});
