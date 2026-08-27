// ════════════════════════════════════════════════════════════
//  telapay-callback  —  TelaPay TPay V2 webhook.
//
//  TelaPay POSTs the final MoMo result here (both web + USSD). We verify the
//  X-Signature (HMAC-SHA256 of the raw body), and on code "000" flip the
//  matching order to PAID and ping Telegram. Ack with 200 quickly.
//
//  Set this as the `callback` — it's sent automatically on every charge.
//  Deploy: supabase functions deploy telapay-callback --no-verify-jwt
// ════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { notifyTelegram } from '../_shared/notify.ts';
import { verifySignature } from '../_shared/telapay.ts';

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
  if (!txn || code !== '000') return ok();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('payment_ref', txn)
      .maybeSingle();

    // Confirmed payment → straight into the load queue as 'processing'.
    if (order && order.status !== 'processing' && order.status !== 'done') {
      const { data: updated } = await supabase
        .from('orders')
        .update({ status: 'processing' })
        .eq('id', order.id)
        .select()
        .single();
      if (updated) await notifyTelegram(updated);
    }
  } catch { /* ack anyway; verify-poll is a backstop */ }

  return ok();
});
