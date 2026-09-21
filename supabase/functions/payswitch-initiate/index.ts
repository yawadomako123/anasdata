// ════════════════════════════════════════════════════════════
//  payswitch-initiate  —  WEB MoMo charge via TelaPay TPay V2.
//
//  Records a PENDING order and initiates a Mobile Money charge on the
//  customer's number (they approve on their phone). The final result
//  arrives at telapay-callback; the frontend also polls payswitch-verify.
//
//  Sells two things:
//    • bundleId       → a data bundle (loaded by hand from the admin queue)
//    • voucherTypeId  → a checker (PIN reserved here, SMS'd on payment)
//
//  Deploy:  supabase functions deploy payswitch-initiate
//  Secrets: TELAPAY_CLIENT_ID, TELAPAY_CLIENT_SECRET, TELAPAY_TERMINAL_ID
// ════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getBundle } from '../_shared/catalogue.ts';
import { initiateCharge, networkFromPhone } from '../_shared/telapay.ts';
import { getVoucherType, reserveVoucher, releaseVoucher } from '../_shared/vouchers.ts';

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

/**
 * Unguessable handle for retrieving a PIN from the browser.
 *
 * The transaction id is mostly a timestamp, so it is enumerable — fine for a
 * payment reference, useless as a secret. Anything that returns a PIN is
 * gated on this instead.
 */
const makeDeliveryToken = () => crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

const isGhPhone = (p: string) => /^0[235][0-9]{8}$/.test(String(p || '').trim());

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { bundleId, voucherTypeId, phone, payerPhone } = await req.json();
    const recipient = String(phone || '').trim();
    const payer = String(payerPhone || phone || '').trim();

    if (!bundleId && !voucherTypeId) return json({ error: 'Missing product.' }, 400);
    if (!recipient) return json({ error: 'Missing number.' }, 400);
    if (!isGhPhone(recipient)) return json({ error: 'Invalid number.' }, 400);
    if (!isGhPhone(payer)) return json({ error: 'Invalid Mobile Money number.' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ── Resolve the product and its price SERVER-SIDE ──
    let orderRow: Record<string, unknown>;
    let price: number;
    let label: string;

    if (voucherTypeId) {
      const type = await getVoucherType(supabase, String(voucherTypeId));
      if (!type) return json({ error: 'Unknown checker.' }, 400);
      price = type.price;
      label = type.name;
      orderRow = {
        product_type: 'checker',
        voucher_type_id: type.id,
        bundle_id: null,
        bundle_name: type.name,
        network: null,
        data: null,
      };
    } else {
      const bundle = await getBundle(supabase, String(bundleId));
      if (!bundle) return json({ error: 'Unknown bundle.' }, 400);
      price = bundle.price;
      label = bundle.name;
      orderRow = {
        product_type: 'data',
        voucher_type_id: null,
        bundle_id: bundle.id,
        bundle_name: bundle.name,
        network: bundle.network,
        data: bundle.data,
      };
    }

    const transactionId = makeTransactionId();
    const deliveryToken = makeDeliveryToken();

    const { data: order, error: insertErr } = await supabase
      .from('orders')
      .insert({
        ...orderRow,
        reference: transactionId,
        price,
        phone: recipient,
        email: null,
        status: 'pending',
        channel: 'web',
        payment_method: 'telapay-momo',
        payment_ref: transactionId,
        payer_phone: payer,
        delivery_token: deliveryToken,
      })
      .select()
      .single();
    if (insertErr || !order) {
      return json({ error: `Could not start order: ${insertErr?.message ?? 'unknown'}` }, 500);
    }

    // ── Hold a PIN BEFORE charging ──
    // Taking money we cannot fulfil is the worst outcome here, so an
    // out-of-stock checker is refused before the customer is ever charged.
    if (order.product_type === 'checker') {
      const held = await reserveVoucher(supabase, String(order.voucher_type_id), String(order.id));
      if (!held) {
        await supabase.from('orders').update({ status: 'failed' }).eq('id', order.id);
        return json({ error: 'That checker just sold out. Nothing has been charged.' }, 409);
      }
    }

    // r_switch must describe the PAYER's wallet, not the product. Fall back to
    // the product's network only when the prefix is unrecognised.
    const payerNetwork = networkFromPhone(payer) || String(order.network ?? 'MTN');

    const charge = await initiateCharge({
      transactionId,
      amountGhs: price,
      subscriberNumber: payer,
      network: payerNetwork,
      desc: `${label} to ${recipient}`,
      reference: transactionId,
      callbackUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/telapay-callback`,
    });

    if (!charge.ok) {
      // Give the PIN back to stock — nobody paid for it.
      if (order.product_type === 'checker') await releaseVoucher(supabase, String(order.id));
      await supabase.from('orders').update({ status: 'failed' }).eq('id', order.id);
      return json({ error: `Could not start payment (${charge.reason ?? charge.code}).` }, 502);
    }

    return json({
      transaction_id: transactionId,
      delivery_token: order.product_type === 'checker' ? deliveryToken : undefined,
      status: 'pending',
    });
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Unexpected error.' }, 500);
  }
});
