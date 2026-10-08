// ════════════════════════════════════════════════════════════
//  Voucher (checker) inventory helpers.
//
//  All of these call SECURITY DEFINER functions that are granted to
//  service_role only — PINs never travel through the browser client.
//  See supabase/add-checkers.sql.
// ════════════════════════════════════════════════════════════
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** The three product lines. Everything below is category-aware so the menus
 *  can offer them separately while sharing one stock engine. */
export type Category = 'checker' | 'eticket' | 'voucher';

export const CATEGORIES: { key: Category; label: string; plural: string }[] = [
  { key: 'checker', label: 'Buy checker', plural: 'Checkers' },
  { key: 'eticket', label: 'Get e-tickets', plural: 'E-tickets' },
  { key: 'voucher', label: 'Buy vouchers', plural: 'Vouchers' },
];

export interface VoucherType {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: Category;
}

// deno-lint-ignore no-explicit-any
const mapType = (row: any): VoucherType => ({
  id: row.id,
  name: row.name,
  description: row.description ?? null,
  price: Number(row.price),
  category: (row.category ?? 'checker') as Category,
});

/** One active checker product by id (used to price an order server-side). */
export async function getVoucherType(
  db: SupabaseClient,
  id: string
): Promise<VoucherType | null> {
  const { data, error } = await db
    .from('voucher_types')
    .select('*')
    .eq('id', id)
    .eq('active', true)
    .maybeSingle();
  if (error || !data) return null;
  return mapType(data);
}

/**
 * Active products that still have stock, in display order.
 * Pass a category to restrict it to one product line.
 */
export async function inStockVoucherTypes(
  db: SupabaseClient,
  category?: Category
): Promise<VoucherType[]> {
  let q = db
    .from('voucher_types')
    .select('*')
    .eq('active', true);
  if (category) q = q.eq('category', category);
  const { data: types, error } = await q
    .order('sort_order', { ascending: true })
    .order('price', { ascending: true });
  if (error || !types) return [];

  const { data: stock } = await db.rpc('voucher_stock');
  const available = new Map<string, number>(
    // deno-lint-ignore no-explicit-any
    (stock ?? []).map((s: any) => [s.type_id, Number(s.available)])
  );
  // Never advertise something we cannot hand over.
  return types.filter((t) => (available.get(t.id) ?? 0) > 0).map(mapType);
}

/**
 * Which categories currently have something to sell.
 *
 * The menu is built from this, so a product line with no stock simply does
 * not appear rather than leading a caller to an empty list.
 */
export async function inStockCategories(db: SupabaseClient): Promise<Set<Category>> {
  const { data, error } = await db.rpc('voucher_stock_by_category');
  if (error || !data) return new Set();
  return new Set(
    // deno-lint-ignore no-explicit-any
    (data as any[]).filter((r) => Number(r.available) > 0).map((r) => r.category as Category)
  );
}

/**
 * Hold one PIN for this order before charging. Returns false when stock has
 * run out, which is the caller's signal to refuse the sale rather than take
 * money it cannot fulfil. Idempotent per order.
 */
export async function reserveVoucher(
  db: SupabaseClient,
  typeId: string,
  orderId: string,
  ttlSeconds = 900
): Promise<boolean> {
  const { data, error } = await db.rpc('reserve_voucher', {
    p_type_id: typeId,
    p_order_id: orderId,
    p_ttl_seconds: ttlSeconds,
  });
  if (error) return false;
  return Boolean(data);
}

/**
 * Turn this order's reservation into a sale and return the PIN. Idempotent —
 * a redelivered webhook gets the SAME voucher back rather than burning a
 * second one.
 */
export async function claimVoucher(
  db: SupabaseClient,
  orderId: string
): Promise<{ serial: string; pin: string } | null> {
  const { data, error } = await db.rpc('claim_voucher', { p_order_id: orderId });
  if (error || !data || data.length === 0) return null;
  return { serial: data[0].serial, pin: data[0].pin };
}

/** Put a reserved PIN back when the payment failed. */
export async function releaseVoucher(db: SupabaseClient, orderId: string): Promise<void> {
  // supabase-js query builders are thenable but have no .catch, so errors are
  // read off the result rather than caught.
  const { error } = await db.rpc('release_voucher', { p_order_id: orderId });
  if (error) console.error('releaseVoucher failed', error.message);
}
