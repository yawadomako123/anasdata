// ════════════════════════════════════════════════════════════
//  What happens the moment a payment is confirmed.
//
//  Two callers reach here — telapay-callback (the webhook) and
//  payswitch-verify (the browser's poll, which is the backstop when the
//  webhook never lands). They MUST behave identically, and either can
//  run twice, so everything below is idempotent.
//
//   • data bundle → 'processing', i.e. the admin load queue (human loads it)
//   • checker     → claim the reserved PIN and mark 'done'
//
//  DELIVERY, without any third-party account or API key:
//   • web    — the PIN is shown on the success page (the browser is still
//              open), and again via Track Order using the reference.
//   • USSD   — the caller dials back and picks "My checkers". The network
//              authenticates their MSISDN for us, so no separate login and
//              no SMS gateway is involved.
//  `delivered_at` is stamped the first time the customer actually sees the
//  PIN through any of those routes, so the admin can tell who has collected.
// ════════════════════════════════════════════════════════════
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { notifyTelegram, notifyTelegramText } from './notify.ts';
import { claimVoucher, getVoucherType } from './vouchers.ts';
import { sendEmail, codeEmail } from './email.ts';

export interface FulfilResult {
  order: Record<string, unknown>;
  voucher?: { serial: string; pin: string };
}

/**
 * Move a just-paid order to its finished state.
 * Safe to call repeatedly for the same order.
 */
export async function confirmAndFulfil(
  db: SupabaseClient,
  order: Record<string, unknown>
): Promise<FulfilResult> {
  const id = String(order.id);

  // ── Data bundle: into the load queue for a human ──
  if (order.product_type !== 'checker') {
    if (order.status === 'processing' || order.status === 'done') return { order };
    const { data: updated } = await db
      .from('orders').update({ status: 'processing' }).eq('id', id).select().single();
    if (updated) await notifyTelegram(updated);
    return { order: updated ?? order };
  }

  // ── Checker: allocate the PIN ──
  // claim_voucher also returns an ALREADY-sold voucher for this order, so a
  // redelivered webhook hands back the same PIN instead of burning a new one.
  const voucher = await claimVoucher(db, id);

  if (!voucher) {
    // Paid, but nothing reserved. Reservation happens before charging, so this
    // should be unreachable — if it ever fires, a customer has paid and is
    // owed a PIN. Park it for a human and shout about it.
    const { data: updated } = await db
      .from('orders')
      .update({
        status: 'processing',
        delivery_error: 'Paid but no voucher reserved — needs manual fulfilment',
      })
      .eq('id', id).select().single();
    await notifyTelegramText(
      `🚨 *Checker paid with no PIN reserved*\n` +
      `Ref \`${order.reference}\` — ${order.phone}\n` +
      `Customer has paid and is owed a PIN. Fulfil by hand.`
    );
    return { order: updated ?? order };
  }

  const wasAlreadyDone = order.status === 'done';

  // Email it, if the buyer gave an address and we have not already sent.
  // Email is additive, never load-bearing: the code is collectable on screen
  // and by dialling back in regardless, so a failure here cannot block a sale
  // or strand a customer. It is also the only route needing an outside
  // account, so it no-ops cleanly until one is configured.
  const patch: Record<string, unknown> = { status: 'done', delivery_error: null };
  const address = String(order.email ?? '').trim();

  if (address && !order.email_sent_at) {
    const type = order.voucher_type_id
      ? await getVoucherType(db, String(order.voucher_type_id))
      : null;
    const mail = codeEmail({
      productName: String(order.bundle_name),
      category: type?.category ?? 'voucher',
      serial: voucher.serial,
      code: voucher.pin,
      reference: String(order.reference),
    });
    const sent = await sendEmail(address, mail.subject, mail.text, mail.html);
    if (sent.ok) {
      patch.email_sent_at = new Date().toISOString();
      patch.email_error = null;
    } else {
      patch.email_error = sent.error ?? 'Email failed';
      await notifyTelegramText(
        '⚠️ *Could not email a code*\n' +
        `Ref \`${order.reference}\` — ${address}\n` +
        `${patch.email_error}\nThe customer can still collect it by dialling in.`
      );
    }
  }

  const { data: updated } = await db
    .from('orders').update(patch).eq('id', id).select().single();

  if (!wasAlreadyDone) await notifyTelegram(updated ?? order);
  return { order: updated ?? order, voucher };
}

/**
 * Stamp the first time a customer actually saw their PIN (success page,
 * Track Order, or dialling back in). Only ever set once.
 */
export async function markRetrieved(db: SupabaseClient, orderId: string): Promise<void> {
  const { error } = await db
    .from('orders')
    .update({ delivered_at: new Date().toISOString() })
    .eq('id', orderId)
    .is('delivered_at', null);
  if (error) console.error('markRetrieved failed', error.message);
}
