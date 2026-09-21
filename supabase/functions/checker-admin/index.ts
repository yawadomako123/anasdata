// ════════════════════════════════════════════════════════════
//  checker-admin  —  manage checker products and PIN stock.
//
//  Why this exists instead of writing from the browser: the `vouchers`
//  table has RLS with NO policies, so the anon/authenticated client
//  cannot touch it at all. That is deliberate — unsold PINs are
//  inventory value, and a borrowed admin session must not be able to
//  dump them. All writes go through here, where the caller's admin JWT
//  is checked first and the work is then done with the service role.
//
//  Deploy: supabase functions deploy checker-admin
//  (keep JWT verification ON — this is admin-only)
// ════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendSms, checkerSms } from '../_shared/sms.ts';

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

  // ── Who is calling? Must be a signed-in admin. ──
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ error: 'Not signed in.' }, 401);

  const asCaller = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: userData } = await asCaller.auth.getUser();
  if (!userData?.user) return json({ error: 'Not signed in.' }, 401);

  // Past this point we act with full privileges.
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const { action, ...args } = await req.json();

    // ── Products + stock levels ──
    if (action === 'list') {
      const { data: types } = await db
        .from('voucher_types').select('*')
        .order('sort_order', { ascending: true });
      const { data: counts } = await db.from('vouchers').select('type_id, status');

      const tally: Record<string, Record<string, number>> = {};
      for (const row of counts ?? []) {
        const t = String(row.type_id);
        tally[t] = tally[t] ?? { available: 0, reserved: 0, sold: 0 };
        const k = String(row.status);
        if (k in tally[t]) tally[t][k] += 1;
      }
      return json({
        types: (types ?? []).map((t) => ({
          ...t,
          stock: tally[t.id] ?? { available: 0, reserved: 0, sold: 0 },
        })),
      });
    }

    // ── Create / update a product ──
    if (action === 'create_type') {
      const { name, description, price, sortOrder } = args;
      if (!name || price == null) return json({ error: 'Name and price required.' }, 400);
      const { data, error } = await db
        .from('voucher_types')
        .insert({
          name: String(name).trim(),
          description: description ? String(description).trim() : null,
          price: Number(price),
          sort_order: Number(sortOrder) || 0,
        })
        .select().single();
      if (error) return json({ error: error.message }, 400);
      return json({ type: data });
    }

    if (action === 'update_type') {
      const { id, name, description, price, active, sortOrder } = args;
      if (!id) return json({ error: 'Missing id.' }, 400);
      const patch: Record<string, unknown> = {};
      if (name != null) patch.name = String(name).trim();
      if (description != null) patch.description = String(description).trim() || null;
      if (price != null) patch.price = Number(price);
      if (active != null) patch.active = Boolean(active);
      if (sortOrder != null) patch.sort_order = Number(sortOrder);
      const { data, error } = await db
        .from('voucher_types').update(patch).eq('id', id).select().single();
      if (error) return json({ error: error.message }, 400);
      return json({ type: data });
    }

    // ── Upload PIN stock ──
    if (action === 'upload') {
      const { typeId, pins } = args;
      if (!typeId || !Array.isArray(pins) || pins.length === 0) {
        return json({ error: 'Need a checker and at least one PIN.' }, 400);
      }
      if (pins.length > 5000) return json({ error: 'Upload 5000 at a time or fewer.' }, 400);

      const rows = pins
        .map((p: { serial?: string; pin?: string }) => ({
          type_id: typeId,
          serial: String(p.serial ?? '').trim(),
          pin: String(p.pin ?? '').trim(),
        }))
        .filter((r) => r.serial && r.pin);
      if (rows.length === 0) return json({ error: 'No usable rows — need serial and pin.' }, 400);

      // Re-uploading the same file must not duplicate stock, so a repeated
      // (type_id, serial) is ignored rather than inserted again.
      const { data, error } = await db
        .from('vouchers')
        .upsert(rows, { onConflict: 'type_id,serial', ignoreDuplicates: true })
        .select('id');
      if (error) return json({ error: error.message }, 400);

      return json({ submitted: rows.length, added: data?.length ?? 0 });
    }

    // ── Resend a PIN whose SMS failed ──
    if (action === 'resend') {
      const { orderId } = args;
      if (!orderId) return json({ error: 'Missing orderId.' }, 400);
      const { data: order } = await db
        .from('orders').select('*').eq('id', orderId).maybeSingle();
      if (!order || order.product_type !== 'checker') return json({ error: 'Not a checker order.' }, 404);

      const { data: v } = await db
        .from('vouchers').select('serial, pin').eq('order_id', orderId).maybeSingle();
      if (!v) return json({ error: 'No PIN attached to that order.' }, 404);

      const sms = await sendSms(
        String(order.phone),
        checkerSms(String(order.bundle_name), v.serial, v.pin, String(order.reference))
      );
      await db.from('orders').update({
        delivered_at: sms.ok ? new Date().toISOString() : order.delivered_at,
        delivery_error: sms.ok ? null : (sms.error ?? 'SMS failed'),
      }).eq('id', orderId);

      if (!sms.ok) return json({ error: sms.error ?? 'SMS failed' }, 502);
      return json({ ok: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Unexpected error.' }, 500);
  }
});
