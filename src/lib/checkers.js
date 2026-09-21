/* ═══════════════════════════════════════════
   Checkers (PIN vouchers) — read/write against Supabase.

   • Storefront READS active products and their stock counts. It can
     never read a PIN: the `vouchers` table has RLS with no policies,
     so the browser client cannot see it at all.
   • Admin writes go through the `checker-admin` Edge Function, which
     checks the admin session and then acts with the service role.
═══════════════════════════════════════════ */
import { supabase, isSupabaseReady } from './supabase';

const NOT_READY = {
  ok: false,
  error: 'Backend not configured. See README.',
};

/** True when the checker tables/functions don't exist yet (migration pending). */
const isMissingTable = (error) =>
  error?.code === '42P01' ||
  error?.code === 'PGRST205' ||
  /does not exist|schema cache/i.test(error?.message ?? '');

const mapType = (row, stock) => ({
  id: row.id,
  name: row.name,
  description: row.description || null,
  price: Number(row.price),
  active: row.active,
  sortOrder: row.sort_order,
  inStock: (stock ?? 0) > 0,
  available: stock ?? 0,
});

// ── Storefront ────────────────────────────────────────────────

/**
 * Active checkers with their stock counts. Sold-out items are returned
 * with inStock false so the page can hide or grey them out — we never
 * advertise something that cannot be handed over.
 */
export async function fetchCheckers() {
  if (!isSupabaseReady) return { ...NOT_READY, checkers: [] };

  const [{ data: types, error }, { data: stock }] = await Promise.all([
    supabase
      .from('voucher_types')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('price', { ascending: true }),
    supabase.rpc('voucher_stock'),
  ]);

  // Before add-checkers.sql has run the tables simply aren't there. That is
  // "nothing to sell", not a failure worth showing a customer — the storefront
  // falls back to leading with top-ups until stock exists.
  if (error) {
    if (isMissingTable(error)) return { ok: true, checkers: [] };
    return { ok: false, error: error.message, checkers: [] };
  }

  const counts = new Map((stock ?? []).map((s) => [s.type_id, Number(s.available)]));
  return { ok: true, checkers: (types ?? []).map((t) => mapType(t, counts.get(t.id))) };
}

/** One checker by id (for the checkout page). */
export async function fetchCheckerById(id) {
  if (!isSupabaseReady) return NOT_READY;
  const [{ data, error }, { data: stock }] = await Promise.all([
    supabase.from('voucher_types').select('*').eq('id', id).eq('active', true).maybeSingle(),
    supabase.rpc('voucher_stock'),
  ]);
  if (error) {
    if (isMissingTable(error)) return { ok: true, checker: null };
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: true, checker: null };
  const counts = new Map((stock ?? []).map((s) => [s.type_id, Number(s.available)]));
  return { ok: true, checker: mapType(data, counts.get(data.id)) };
}

// ── Admin (via the checker-admin Edge Function) ───────────────

async function adminCall(action, args = {}) {
  if (!isSupabaseReady) return NOT_READY;
  const { data, error } = await supabase.functions.invoke('checker-admin', {
    body: { action, ...args },
  });
  if (error) {
    // The real reason is in the response body, not the generic wrapper.
    try {
      const body = await error?.context?.json?.();
      if (body?.error) return { ok: false, error: body.error };
    } catch { /* fall through */ }
    return { ok: false, error: error.message || 'Request failed.' };
  }
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true, ...data };
}

/** Every checker product with available / reserved / sold counts. */
export const fetchCheckerStock = () => adminCall('list');

export const createChecker = ({ name, description, price, sortOrder }) =>
  adminCall('create_type', { name, description, price, sortOrder });

export const updateChecker = (id, patch) => adminCall('update_type', { id, ...patch });

/** Bulk-add PIN stock. Re-uploading the same file adds nothing. */
export const uploadCheckerPins = (typeId, pins) => adminCall('upload', { typeId, pins });

/** Re-send a PIN whose SMS bounced. */
export const resendCheckerPin = (orderId) => adminCall('resend', { orderId });

/**
 * Parse a pasted/uploaded CSV of PIN stock.
 * Accepts `serial,pin` with or without a header row.
 */
export function parsePinCsv(text) {
  const rows = [];
  const errors = [];
  String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const parts = line.split(/[,;\t]/).map((p) => p.trim());
      if (parts.length < 2) {
        errors.push(`Line ${i + 1}: expected "serial,pin"`);
        return;
      }
      const [serial, pin] = parts;
      // Skip an obvious header row.
      if (i === 0 && /serial/i.test(serial) && /pin/i.test(pin)) return;
      if (!serial || !pin) {
        errors.push(`Line ${i + 1}: missing serial or pin`);
        return;
      }
      rows.push({ serial, pin });
    });
  return { rows, errors };
}
