// ════════════════════════════════════════════════════════════
//  arkesel-callback  —  Supabase Edge Function (Deno)
//
//  Arkesel Payments calls this URL after the customer approves (or
//  declines) the mobile-money PIN prompt started during the USSD flow.
//  We match the order by our merchant_reference and flip it paid/failed.
//
//  Deploy (public — Arkesel sends no JWT):
//    supabase functions deploy arkesel-callback --no-verify-jwt
//  Then set this function's URL as the payment callback in your Arkesel
//  Payments settings.
//
//  NOTE: Arkesel's Payments callback payload isn't publicly documented,
//  so we read the reference/status from several likely field names AND
//  (when ARKESEL_PAYMENT_API_KEY is set) re-verify with Arkesel before
//  trusting it. Check the function logs on your first live transaction
//  and adjust the field names below if needed.
// ════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { notifyTelegram } from '../_shared/notify.ts';

const admin = () =>
  createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

const pick = (o: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) {
    if (o[k] != null && o[k] !== '') return String(o[k]);
  }
  return '';
};

const SUCCESS = ['success', 'successful', 'completed', 'complete', 'paid', 'approved'];

// Re-verify a transaction with Arkesel (defence-in-depth; don't trust the
// callback alone if we can confirm it).
async function verifyWithArkesel(transRef: string): Promise<boolean | null> {
  const apiKey = Deno.env.get('ARKESEL_PAYMENT_API_KEY');
  if (!apiKey || !transRef) return null; // can't verify — fall back to callback status
  try {
    const res = await fetch(
      `https://payment.arkesel.com/api/v1/verify/transaction/${encodeURIComponent(transRef)}`,
      { headers: { 'api-key': apiKey } }
    );
    const data = await res.json();
    const status = pick(data?.data ?? data ?? {}, ['status', 'transaction_status']).toLowerCase();
    return SUCCESS.includes(status);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  // Gather params from body (JSON or form) and query string.
  const payload: Record<string, unknown> = {};
  try {
    const url = new URL(req.url);
    url.searchParams.forEach((v, k) => (payload[k] = v));
  } catch { /* ignore */ }
  if (req.method === 'POST') {
    try {
      Object.assign(payload, await req.json());
    } catch {
      try {
        const form = await req.formData();
        form.forEach((v, k) => (payload[k] = v));
      } catch { /* ignore */ }
    }
  }

  console.log('arkesel-callback payload:', JSON.stringify(payload));

  const reference = pick(payload, [
    'merchant_reference', 'clientReference', 'client_reference', 'reference', 'payment_ref',
  ]);
  const arkeselRef = pick(payload, ['transaction_id', 'transactionId', 'trans_ref', 'transRef', 'id']);
  const callbackStatus = pick(payload, ['status', 'transaction_status', 'payment_status']).toLowerCase();

  if (!reference) return json({ ok: false, error: 'No reference in callback.' }, 400);

  // Prefer a real verification; fall back to the callback's own status field.
  const verified = await verifyWithArkesel(arkeselRef || reference);
  const paid = verified === null ? SUCCESS.includes(callbackStatus) : verified;

  const { data: order } = await admin()
    .from('orders')
    .select('*')
    .eq('payment_ref', reference)
    .maybeSingle();

  if (!order) return json({ ok: true, note: 'No matching order.' });
  if (order.status === 'paid') return json({ ok: true, note: 'Already paid.' }); // idempotent

  const newStatus = paid ? 'paid' : 'failed';
  const { data: updated } = await admin()
    .from('orders')
    .update({ status: newStatus })
    .eq('id', order.id)
    .select()
    .single();

  if (paid && updated) await notifyTelegram({ ...updated, reference: `${updated.reference} ✅ PAID` });

  return json({ ok: true, status: newStatus });
});
