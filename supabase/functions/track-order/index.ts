// ════════════════════════════════════════════════════════════
//  track-order  —  public order lookup for the Track page.
//
//  Looks up orders by phone number OR order reference. Runs with the
//  service role (so it can read past RLS) but only ever returns the rows
//  matching the exact phone/reference the customer typed — never a list of
//  everyone's orders.
//
//  CHECKER PINs: released ONLY on an exact reference match. A reference is
//  a 12-digit value the buyer holds; a phone number is not a secret, and
//  anyone could type someone else's. So a phone lookup shows the order and
//  its status, never the PIN.
//
//  Deploy: supabase functions deploy track-order --no-verify-jwt
// ════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { markRetrieved } from '../_shared/fulfil.ts';

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
    const { query } = await req.json();
    // Only digits/letters — phones and references are numeric. This also makes
    // it safe to interpolate into the PostgREST `.or()` filter below.
    const q = String(query ?? '').replace(/[^a-zA-Z0-9]/g, '');
    if (q.length < 6) {
      return json({ error: 'Enter your phone number or order reference.' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data, error } = await supabase
      .from('orders')
      .select('id,reference,bundle_name,data,network,phone,price,status,created_at,product_type')
      .or(`phone.eq.${q},reference.eq.${q}`)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) return json({ error: error.message }, 500);

    const orders = data ?? [];

    // Attach the PIN only to an order the customer named by reference.
    let voucher: { serial: string; pin: string } | null = null;
    const byReference = orders.find((o) => o.reference === q);
    if (byReference && byReference.product_type === 'checker') {
      const { data: v } = await supabase
        .from('vouchers').select('serial, pin').eq('order_id', byReference.id).maybeSingle();
      if (v) {
        voucher = { serial: v.serial, pin: v.pin };
        await markRetrieved(supabase, String(byReference.id));
      }
    }

    // The internal id is never useful to a customer and shouldn't leave here.
    const safe = orders.map(({ id: _id, ...rest }) => rest);
    return json({ orders: safe, voucher, voucherFor: voucher ? byReference?.reference : null });
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Unexpected error.' }, 500);
  }
});
