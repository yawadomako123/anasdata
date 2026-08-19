import { supabase, isSupabaseReady } from './supabase';

/**
 * Ask the backend to VERIFY a Paystack payment and record the order.
 * The Edge Function re-checks the transaction directly with Paystack using
 * the secret key, so a customer cannot fake a successful payment.
 *
 * @returns {Promise<{ok: boolean, order?: object, error?: string}>}
 */
export async function verifyAndRecordOrder({ reference, bundleId, phone, email }) {
  if (!isSupabaseReady) {
    return {
      ok: false,
      error:
        'Backend not configured. Add VITE_PUBLIC_SUPABASE_URL and VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env (see README).',
    };
  }

  const { data, error } = await supabase.functions.invoke('verify-payment', {
    body: { reference, bundleId, phone, email },
  });

  if (error) return { ok: false, error: error.message };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true, order: data.order };
}

/** Look up a single order by its reference (for the public "Track order" page). */
export async function getOrderByReference(reference) {
  if (!isSupabaseReady) return { ok: false, error: 'Backend not configured.' };
  // Uses a SECURITY DEFINER function so only the exact-matching row is returned
  // (customers can't list or enumerate other people's orders).
  const { data, error } = await supabase.rpc('get_order_by_reference', {
    p_ref: reference.trim(),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, order: Array.isArray(data) ? data[0] || null : data };
}

// ── Admin-only (requires an authenticated Supabase session) ──

export async function fetchOrders({ status = 'all' } = {}) {
  let query = supabase.from('orders').select('*').order('created_at', { ascending: false });
  if (status !== 'all') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };
  return { ok: true, orders: data };
}

export async function setOrderStatus(id, status) {
  const { error } = await supabase.from('orders').update({ status }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
