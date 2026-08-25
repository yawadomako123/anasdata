import { supabase, isSupabaseReady } from './supabase';

const NOT_READY = 'Service is temporarily unavailable. Please try again later.';

// When an Edge Function returns a non-2xx status, supabase-js only gives a
// generic "Edge Function returned a non-2xx status code". The real message is
// in the response body — pull it out so the customer/console sees the reason.
async function readFnError(error) {
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return body.error;
  } catch {
    /* ignore — fall through to the generic message */
  }
  return error?.message || 'Something went wrong. Please try again.';
}

/**
 * Step 1 of PaySwitch standard checkout: the server records a PENDING order,
 * calls theTeller /initiate, and returns a hosted checkout_url to redirect to.
 *
 * @returns {Promise<{ok: boolean, transactionId?: string, checkoutUrl?: string, error?: string}>}
 */
export async function initiatePaySwitchOrder({ bundleId, phone, redirectUrl }) {
  if (!isSupabaseReady) return { ok: false, error: NOT_READY };

  const { data, error } = await supabase.functions.invoke('payswitch-initiate', {
    body: { bundleId, phone, redirectUrl },
  });

  if (error) return { ok: false, error: await readFnError(error) };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true, transactionId: data.transaction_id, checkoutUrl: data.checkout_url };
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

  if (error) return { ok: false, error: await readFnError(error) };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true, order: data.order };
}

/**
 * Public "Track order" lookup, by phone number OR order reference. Returns a
 * list (one phone may have several orders). The exact typed value is matched
 * server-side, so customers can't enumerate other people's orders.
 */
export async function trackOrder(query) {
  if (!isSupabaseReady) return { ok: false, error: NOT_READY };
  const { data, error } = await supabase.functions.invoke('track-order', {
    body: { query },
  });
  if (error) return { ok: false, error: await readFnError(error) };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true, orders: data.orders ?? [] };
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

export async function deleteOrder(id) {
  const { error } = await supabase.from('orders').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
