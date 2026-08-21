/* ═══════════════════════════════════════════
   Bundle catalogue — read/write against Supabase.

   • Storefront (Home, Bundles, Checkout) READS active bundles.
   • Admin (AdminBundles) ADDS / DELETES / toggles bundles.

   All bundles are NON-EXPIRY, so there's no duration/validity field.
═══════════════════════════════════════════ */
import { supabase, isSupabaseReady } from './supabase';

const NOT_READY = {
  ok: false,
  error:
    'Backend not configured. Add VITE_PUBLIC_SUPABASE_URL and VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env (see README).',
};

// DB row (snake_case) → app object (camelCase).
const mapBundle = (row) => ({
  id: row.id,
  network: row.network,
  name: row.name,
  data: row.data,
  dataValue: Number(row.data_value) || 0,
  price: Number(row.price),
  badge: row.badge || null,
  active: row.active,
  sortOrder: row.sort_order,
});

// ── Storefront reads ──────────────────────────────────────────

/** All ACTIVE bundles, ordered for display. */
export async function fetchBundles() {
  if (!isSupabaseReady) return { ...NOT_READY, bundles: [] };
  const { data, error } = await supabase
    .from('bundles')
    .select('*')
    .eq('active', true)
    .order('network', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('price', { ascending: true });
  if (error) return { ok: false, error: error.message, bundles: [] };
  return { ok: true, bundles: data.map(mapBundle) };
}

/** A single bundle by id (for the checkout page). */
export async function fetchBundleById(id) {
  if (!isSupabaseReady) return NOT_READY;
  const { data, error } = await supabase.from('bundles').select('*').eq('id', id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, bundle: data ? mapBundle(data) : null };
}

// ── Admin writes (require a signed-in session; enforced by RLS) ──

/** Every bundle including inactive ones — admin view. */
export async function fetchAllBundles() {
  if (!isSupabaseReady) return { ...NOT_READY, bundles: [] };
  const { data, error } = await supabase
    .from('bundles')
    .select('*')
    .order('network', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('price', { ascending: true });
  if (error) return { ok: false, error: error.message, bundles: [] };
  return { ok: true, bundles: data.map(mapBundle) };
}

export async function createBundle({ network, name, data, dataValue, price, badge, sortOrder }) {
  if (!isSupabaseReady) return NOT_READY;
  const row = {
    network,
    name: name.trim(),
    data: data.trim(),
    data_value: Number(dataValue) || 0,
    price: Number(price),
    badge: badge?.trim() || null,
    sort_order: Number(sortOrder) || 0,
    active: true,
  };
  const { data: inserted, error } = await supabase.from('bundles').insert(row).select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, bundle: mapBundle(inserted) };
}

export async function deleteBundle(id) {
  if (!isSupabaseReady) return NOT_READY;
  const { error } = await supabase.from('bundles').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setBundleActive(id, active) {
  if (!isSupabaseReady) return NOT_READY;
  const { error } = await supabase.from('bundles').update({ active }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
