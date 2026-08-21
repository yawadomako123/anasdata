import { supabase, isSupabaseReady } from './supabase';

const NOT_READY = 'Service is temporarily unavailable. Please try again later.';

/**
 * Step 1 of PaySwitch checkout: record a PENDING order and get a transaction
 * id + server-trusted amount to hand to the theTeller inline popup.
 *
 * @returns {Promise<{ok: boolean, transactionId?: string, amount?: string, error?: string}>}
 */
export async function initiatePaySwitchOrder({ bundleId, phone, email }) {
  if (!isSupabaseReady) return { ok: false, error: NOT_READY };

  const { data, error } = await supabase.functions.invoke('payswitch-initiate', {
    body: { bundleId, phone, email },
  });

  if (error) return { ok: false, error: error.message };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true, transactionId: data.transaction_id, amount: data.amount };
}

/**
 * Step 2 of PaySwitch checkout: after theTeller redirects back, ask the
 * backend to VERIFY the payment with theTeller's status endpoint and flip the
 * order to PAID. The customer cannot fake this — it's checked server-side.
 *
 * @returns {Promise<{ok: boolean, order?: object, error?: string}>}
 */
export async function verifyPaySwitchPayment(transactionId) {
  if (!isSupabaseReady) return { ok: false, error: NOT_READY };

  const { data, error } = await supabase.functions.invoke('payswitch-verify', {
    body: { transactionId },
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
