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
 * Start a MoMo charge (TelaPay). The server records a PENDING order and pushes
 * an approval prompt to the payer's phone. Returns the transaction id; the
 * frontend then polls verifyPaySwitchPayment until it's paid.
 *
 * @returns {Promise<{ok: boolean, transactionId?: string, error?: string}>}
 */
export async function initiatePaySwitchOrder({ bundleId, phone, payerPhone }) {
  if (!isSupabaseReady) return { ok: false, error: NOT_READY };

  const { data, error } = await supabase.functions.invoke('payswitch-initiate', {
    body: { bundleId, phone, payerPhone },
  });

  if (error) return { ok: false, error: await readFnError(error) };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true, transactionId: data.transaction_id };
}

/**
 * Check a charge's status server-side. Returns status 'pending' | 'paid' |
 * 'failed'. On 'paid' the order is included. The customer can't fake this.
 *
 * @returns {Promise<{ok: boolean, status?: string, order?: object, error?: string}>}
 */
export async function verifyPaySwitchPayment(transactionId) {
  if (!isSupabaseReady) return { ok: false, error: NOT_READY };

  const { data, error } = await supabase.functions.invoke('payswitch-verify', {
    body: { transactionId },
  });

  if (error) return { ok: false, error: await readFnError(error) };
  return { ok: true, status: data.status, order: data.order, error: data.error };
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

/**
 * Fetch ALL matching orders, paging past Supabase's 1000-row cap so nothing is
 * silently dropped as the order history grows.
 * @param {{status?: string, network?: string}} opts
 */
export async function fetchAllOrders({ status = 'all', network } = {}) {
  const pageSize = 1000;
  const all = [];
  for (let from = 0; ; from += pageSize) {
    let q = supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (status !== 'all') q = q.eq('status', status);
    if (network) q = q.eq('network', network);
    const { data, error } = await q;
    if (error) return { ok: false, error: error.message };
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return { ok: true, orders: all };
}

export async function setOrderStatus(id, status) {
  // .select() so a row that RLS silently refused to touch is reported as a
  // failure instead of a success — see markOrdersStatus below.
  const { data, error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', id)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: 'That order was not updated. Check that you are still signed in.' };
  }
  return { ok: true };
}

export async function deleteOrder(id) {
  const { error } = await supabase.from('orders').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Update the status of many orders at once (e.g. a whole downloaded batch).
 *
 * Guards two failure modes that both used to pass as success:
 *  - PostgREST puts the id list in the URL query string, so one big batch can
 *    exceed the gateway URL limit. We send it in chunks.
 *  - An UPDATE matching no rows (RLS, stale ids) returns 204 with no error, so
 *    the caller reported success while nothing moved and the orders stayed in
 *    the queue. .select() makes the server report what it actually changed.
 *
 * @returns {Promise<{ok: boolean, updated?: number, error?: string}>}
 */
export async function markOrdersStatus(ids, status) {
  if (!ids || ids.length === 0) return { ok: true, updated: 0 };

  const CHUNK = 100;
  let updated = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .in('id', ids.slice(i, i + CHUNK))
      .select('id');
    if (error) return { ok: false, updated, error: error.message };
    updated += data?.length ?? 0;
  }

  if (updated < ids.length) {
    return {
      ok: false,
      updated,
      error: `Only ${updated} of ${ids.length} order(s) were updated — the rest are still in the queue. Check that you are still signed in, then try again.`,
    };
  }
  return { ok: true, updated };
}
