// ════════════════════════════════════════════════════════════
//  What happens the moment a payment is confirmed.
//
//  Two callers reach here — telapay-callback (the webhook) and
//  payswitch-verify (the browser's poll, which is the backstop when the
//  webhook never lands). They MUST behave identically, and either can
//  run twice, so everything below is idempotent.
//
//   • data bundle → 'processing', i.e. the admin load queue (human loads it)
//   • checker     → claim the reserved PIN, SMS it, 'done' (no human)
// ════════════════════════════════════════════════════════════
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { notifyTelegram, notifyTelegramText } from './notify.ts';
import { claimVoucher } from './vouchers.ts';
import { sendSms, checkerSms } from './sms.ts';

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

  // ── Checker: fulfil itself ──
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

  // Only send once: a repeat callback must not re-text the customer.
  const alreadyDelivered = Boolean(order.delivered_at);
  let deliveryError: string | null = (order.delivery_error as string) ?? null;
  let deliveredAt: string | null = (order.delivered_at as string) ?? null;

  if (!alreadyDelivered) {
    const sms = await sendSms(
      String(order.phone),
      checkerSms(String(order.bundle_name), voucher.serial, voucher.pin, String(order.reference))
    );
    if (sms.ok) {
      deliveredAt = new Date().toISOString();
      deliveryError = null;
    } else {
      // The sale stands and the PIN is theirs — only the text failed. Record
      // why so the admin can resend rather than the customer being stranded.
      deliveryError = sms.error ?? 'SMS failed';
      await notifyTelegramText(
        `⚠️ *Checker SMS failed*\n` +
        `Ref \`${order.reference}\` — ${order.phone}\n` +
        `${deliveryError}\nResend from the admin.`
      );
    }
  }

  const { data: updated } = await db
    .from('orders')
    .update({ status: 'done', delivered_at: deliveredAt, delivery_error: deliveryError })
    .eq('id', id).select().single();

  if (!alreadyDelivered) await notifyTelegram(updated ?? order);
  return { order: updated ?? order, voucher };
}
