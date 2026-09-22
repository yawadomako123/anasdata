// ════════════════════════════════════════════════════════════
//  The USSD menu itself — gateway-agnostic.
//
//  Every aggregator has its own request/response envelope but the flow is
//  identical, so the flow lives here and each gateway gets a thin adapter:
//    • frog-ussd  — Wigal Frog (V1 pipe / V2 JSON)
//    • uzo-ussd   — Uzo (Mobiverse)
//  Anything added here appears on both without being written twice.
//
//  Sells two things:
//   • data bundles — loaded by hand from the admin queue
//   • checkers     — a PIN is reserved at purchase and allocated once MoMo
//     confirms. It can NOT be shown during the purchase: the session ends at
//     payment initiation, long before the customer approves. They dial back
//     and pick "My checkers" to collect it — the network authenticates their
//     number, so no SMS gateway or API key is needed.
//
//  Screens are capped at 160 characters by the USSD bearer.
// ════════════════════════════════════════════════════════════
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  NETWORKS,
  NETWORK_ORDER,
  bundlesByNetwork,
  getBundle,
  type NetworkId,
} from './catalogue.ts';
import { inStockVoucherTypes, getVoucherType, reserveVoucher, releaseVoucher } from './vouchers.ts';
import { markRetrieved } from './fulfil.ts';
import { notifyTelegram } from './notify.ts';
import { initiateCharge, networkFromPhone } from './telapay.ts';

const PAGE_SIZE = 4;

/** What the gateway hands us, normalised. */
export interface UssdRequest {
  sessionId: string;
  msisdn: string;
  /** The caller's latest keypress. Empty on the initiating request. */
  input: string;
  phase: 'start' | 'continue' | 'end';
  /** Optional network hint from the gateway; only used if the prefix fails. */
  networkHint?: string;
}

/** What the adapter should render. */
export interface UssdReply {
  message: string;
  /** true → keep the session open, false → final screen. */
  cont: boolean;
}

/**
 * Whether data bundles appear on the USSD menu.
 *
 * Runtime flag, not a code change: set the USSD_DATA_ENABLED secret to
 * "false" to hide them, anything else (or unset) to show them. Flipping it in
 * Supabase → Edge Functions → Secrets takes effect on the next call, with no
 * redeploy. The website is unaffected either way — this is USSD only.
 */
const dataOnUssd = () =>
  (Deno.env.get('USSD_DATA_ENABLED') ?? 'true').trim().toLowerCase() !== 'false';

export function toLocal(msisdn: string): string {
  const d = String(msisdn || '').replace(/\D/g, '');
  if (d.startsWith('233')) return '0' + d.slice(3);
  if (d.startsWith('0')) return d;
  if (d.length === 9) return '0' + d;
  return d;
}
const isGhPhone = (p: string) => /^0[235][0-9]{8}$/.test(p);
const money = (n: number) => `GHS${n.toFixed(2)}`;

const makeTxnId = () => {
  const t = String(Date.now()).slice(-10);
  const r = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  return t + r;
};

// A USSD screen is capped at 160 characters and a menu shows four items, so a
// long product name can push a whole page over the limit and get it truncated
// by the gateway. Clip names rather than let that happen.
const short = (s: string, max = 18) =>
  String(s).length <= max ? String(s) : String(s).slice(0, max - 1).trimEnd() + '.';

interface SessionState {
  step: 'home' | 'network' | 'bundle' | 'checker' | 'recipient' | 'enterNumber' | 'confirm' | 'myCheckers';
  product?: 'data' | 'checker';
  network?: NetworkId;
  page?: number;
  bundleId?: string;
  voucherTypeId?: string;
  recipient?: string;
}

async function loadState(db: SupabaseClient, id: string): Promise<SessionState | null> {
  const { data } = await db.from('ussd_sessions').select('state').eq('session_id', id).maybeSingle();
  return (data?.state as SessionState) ?? null;
}
async function saveState(db: SupabaseClient, id: string, state: SessionState) {
  await db.from('ussd_sessions').upsert({ session_id: id, state, updated_at: new Date().toISOString() });
}
async function clearState(db: SupabaseClient, id: string) {
  await db.from('ussd_sessions').delete().eq('session_id', id);
}

/**
 * Home options, numbered from whatever is actually on offer.
 *
 * Built as a list rather than hard-coded text so the numbering always matches
 * what the caller can see — hiding data must not leave a dead "1".
 */
function homeOptions(): { key: 'data' | 'checker' | 'mine' | 'support'; label: string }[] {
  const opts: { key: 'data' | 'checker' | 'mine' | 'support'; label: string }[] = [];
  if (dataOnUssd()) opts.push({ key: 'data', label: 'Buy data bundle' });
  opts.push({ key: 'checker', label: 'Buy checker' });
  opts.push({ key: 'mine', label: 'My checkers' });
  opts.push({ key: 'support', label: 'Contact support' });
  return opts;
}

function homeMenu(): string {
  const lines = homeOptions().map((o, i) => `${i + 1}. ${o.label}`);
  return `Welcome to Anasdata.\n${lines.join('\n')}`;
}
function contactScreen(): string {
  return 'Anasdata Support\nCall/WhatsApp: 0592079246\nEmail: qwekubhadest1414@gmail.com';
}
function networkMenu(): string {
  const lines = NETWORK_ORDER.map((id, i) => `${i + 1}. ${NETWORKS[id].name}`);
  // Only data buyers reach this screen, so the loading delay is stated here.
  // Checkers are instant and their flow never shows it.
  return `Select network\n${lines.join('\n')}\nData loads in 5-30 mins`;
}
async function bundleMenu(db: SupabaseClient, net: NetworkId, page: number): Promise<string> {
  const all = await bundlesByNetwork(db, net);
  if (all.length === 0) return `${NETWORKS[net].name}: none available\n9. Back`;
  const start = page * PAGE_SIZE;
  const slice = all.slice(start, start + PAGE_SIZE);
  const lines = slice.map((b, i) => `${i + 1}. ${b.data} ${money(b.price)}`);
  const nav: string[] = [];
  if (start + PAGE_SIZE < all.length) nav.push('0.More');
  nav.push('9.Back');
  return `${NETWORKS[net].name} data:\n${lines.join('\n')}\n${nav.join('  ')}`;
}
/** Only ever lists checkers that actually have stock. */
async function checkerMenu(db: SupabaseClient, page: number): Promise<string> {
  const all = await inStockVoucherTypes(db);
  if (all.length === 0) return 'No checkers in stock right now.\n9. Back';
  const start = page * PAGE_SIZE;
  const slice = all.slice(start, start + PAGE_SIZE);
  const lines = slice.map((t, i) => `${i + 1}. ${short(t.name)} ${money(t.price)}`);
  const nav: string[] = [];
  if (start + PAGE_SIZE < all.length) nav.push('0.More');
  nav.push('9.Back');
  return `Checkers:\n${lines.join('\n')}\n${nav.join('  ')}`;
}

/**
 * Checkers this caller has paid for.
 *
 * The gateway gives us an MSISDN the mobile network has already
 * authenticated, which is a stronger identity check than anything we could
 * ask for on a web form — so no SMS, login or API key is needed for someone
 * to collect their own PIN. We match both the number the PIN was bought for
 * and the number that paid, since those are the two legitimate parties.
 */
async function myCheckers(db: SupabaseClient, msisdn: string) {
  const local = toLocal(msisdn);
  const { data } = await db
    .from('orders')
    .select('id, reference, bundle_name, created_at, status')
    .eq('product_type', 'checker')
    .in('status', ['done', 'processing'])
    .or(`phone.eq.${local},payer_phone.eq.${local}`)
    .order('created_at', { ascending: false })
    .limit(12);
  return data ?? [];
}

// deno-lint-ignore no-explicit-any
function myCheckersMenu(rows: any[], page: number): string {
  if (rows.length === 0) return 'No checkers found for this number.\n9. Back';
  const start = page * PAGE_SIZE;
  const slice = rows.slice(start, start + PAGE_SIZE);
  const lines = slice.map((o, i) => {
    const d = new Date(o.created_at);
    const when = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    return `${i + 1}. ${short(o.bundle_name)} ${when}`;
  });
  const nav: string[] = [];
  if (start + PAGE_SIZE < rows.length) nav.push('0.More');
  nav.push('9.Back');
  return `Your checkers:\n${lines.join('\n')}\n${nav.join('  ')}`;
}

async function confirmScreen(db: SupabaseClient, state: SessionState, recipient: string): Promise<string> {
  if (state.product === 'checker') {
    const t = await getVoucherType(db, state.voucherTypeId!);
    if (!t) return 'Checker unavailable. Dial again.';
    return `${t.name}\nFor: ${recipient}\nPay ${money(t.price)}\n1. Confirm\n2. Cancel`;
  }
  const b = await getBundle(db, state.bundleId!);
  if (!b) return 'Bundle unavailable. Dial again.';
  return `${b.data} ${NETWORKS[b.network].name}\nTo: ${recipient}\nPay ${money(b.price)}\n1. Confirm\n2. Cancel`;
}

const go = (message: string, cont: boolean): UssdReply => ({ message, cont });

/** Drive one step of the menu. */
export async function handleUssd(db: SupabaseClient, req: UssdRequest): Promise<UssdReply> {
  const { sessionId, msisdn, phase, networkHint } = req;
  const input = String(req.input ?? '').trim();

  try {
    if (phase === 'start') {
      await saveState(db, sessionId, { step: 'home' });
      return go(homeMenu(), true);
    }
    if (phase === 'end') {
      await clearState(db, sessionId);
      return go('Goodbye.', false);
    }

    const state = await loadState(db, sessionId);
    if (!state) return go('Session expired. Please dial again.', false);

    // If data was switched off mid-session, don't let a stale state walk the
    // caller into a flow that is no longer on offer.
    if (!dataOnUssd() && (state.product === 'data' || state.step === 'network' || state.step === 'bundle')) {
      await saveState(db, sessionId, { step: 'home' });
      return go(homeMenu(), true);
    }

    // home: resolve the keypress against whatever is currently on offer
    if (state.step === 'home') {
      const opts = homeOptions();
      const chosen = opts[parseInt(input, 10) - 1];
      if (!chosen) return go(`Invalid.\n${homeMenu()}`, true);

      if (chosen.key === 'data') {
        await saveState(db, sessionId, { step: 'network', product: 'data' });
        return go(networkMenu(), true);
      }
      if (chosen.key === 'checker') {
        await saveState(db, sessionId, { step: 'checker', product: 'checker', page: 0 });
        return go(await checkerMenu(db, 0), true);
      }
      if (chosen.key === 'mine') {
        await saveState(db, sessionId, { step: 'myCheckers', page: 0 });
        return go(myCheckersMenu(await myCheckers(db, msisdn), 0), true);
      }
      await clearState(db, sessionId);
      return go(contactScreen(), false);
    }

    // choose network (data bundles only)
    if (state.step === 'network') {
      const net = NETWORK_ORDER[parseInt(input, 10) - 1];
      if (!net) return go(`Invalid.\n${networkMenu()}`, true);
      await saveState(db, sessionId, { step: 'bundle', product: 'data', network: net, page: 0 });
      return go(await bundleMenu(db, net, 0), true);
    }

    // choose bundle (paginated)
    if (state.step === 'bundle') {
      const net = state.network!;
      const all = await bundlesByNetwork(db, net);
      const page = state.page ?? 0;
      if (input === '9') {
        await saveState(db, sessionId, { step: 'network', product: 'data' });
        return go(networkMenu(), true);
      }
      if (input === '0') {
        const nextPage = (page + 1) * PAGE_SIZE < all.length ? page + 1 : page;
        await saveState(db, sessionId, { ...state, page: nextPage });
        return go(await bundleMenu(db, net, nextPage), true);
      }
      const n = parseInt(input, 10);
      const chosen = all[page * PAGE_SIZE + (n - 1)];
      if (!n || n < 1 || n > PAGE_SIZE || !chosen) {
        return go(`Invalid.\n${await bundleMenu(db, net, page)}`, true);
      }
      await saveState(db, sessionId, {
        step: 'recipient', product: 'data', bundleId: chosen.id, network: net,
      });
      const own = toLocal(msisdn);
      return go(`${chosen.data} ${money(chosen.price)}\nLoad to:\n1. This No (${own})\n2. Other No`, true);
    }

    // choose checker (paginated)
    if (state.step === 'checker') {
      const all = await inStockVoucherTypes(db);
      const page = state.page ?? 0;
      if (input === '9') {
        await saveState(db, sessionId, { step: 'home' });
        return go(homeMenu(), true);
      }
      if (input === '0') {
        const nextPage = (page + 1) * PAGE_SIZE < all.length ? page + 1 : page;
        await saveState(db, sessionId, { ...state, page: nextPage });
        return go(await checkerMenu(db, nextPage), true);
      }
      const n = parseInt(input, 10);
      const chosen = all[page * PAGE_SIZE + (n - 1)];
      if (!n || n < 1 || n > PAGE_SIZE || !chosen) {
        return go(`Invalid.\n${await checkerMenu(db, page)}`, true);
      }
      await saveState(db, sessionId, {
        step: 'recipient', product: 'checker', voucherTypeId: chosen.id,
      });
      const own = toLocal(msisdn);
      // The number just labels the purchase and lets that person collect it
      // too — nothing is sent to it.
      return go(`${chosen.name} ${money(chosen.price)}\nFor which No:\n1. This No (${own})\n2. Other No`, true);
    }

    // collect a PIN already paid for
    if (state.step === 'myCheckers') {
      const rows = await myCheckers(db, msisdn);
      const page = state.page ?? 0;
      if (input === '9') {
        await saveState(db, sessionId, { step: 'home' });
        return go(homeMenu(), true);
      }
      if (input === '0') {
        const nextPage = (page + 1) * PAGE_SIZE < rows.length ? page + 1 : page;
        await saveState(db, sessionId, { ...state, page: nextPage });
        return go(myCheckersMenu(rows, nextPage), true);
      }
      const n = parseInt(input, 10);
      const chosen = rows[page * PAGE_SIZE + (n - 1)];
      if (!n || n < 1 || n > PAGE_SIZE || !chosen) {
        return go(`Invalid.\n${myCheckersMenu(rows, page)}`, true);
      }

      const { data: v } = await db
        .from('vouchers').select('serial, pin').eq('order_id', chosen.id).maybeSingle();
      await clearState(db, sessionId);

      if (!v) {
        return go(`${chosen.bundle_name}\nPIN not ready yet. Contact support with Ref ${chosen.reference}`, false);
      }
      await markRetrieved(db, String(chosen.id));
      return go(`${chosen.bundle_name}\nSerial: ${v.serial}\nPIN: ${v.pin}\nRef ${chosen.reference}`, false);
    }

    // whose number
    if (state.step === 'recipient') {
      if (input === '1') {
        const own = toLocal(msisdn);
        const next: SessionState = { ...state, step: 'confirm', recipient: own };
        await saveState(db, sessionId, next);
        return go(await confirmScreen(db, next, own), true);
      }
      if (input === '2') {
        await saveState(db, sessionId, { ...state, step: 'enterNumber' });
        return go('Enter number (e.g. 0244123456):', true);
      }
      return go('Reply 1 (this No) or 2 (other No).', true);
    }

    // typed recipient
    if (state.step === 'enterNumber') {
      const rec = input.replace(/\D/g, '');
      if (!isGhPhone(rec)) return go('Invalid. Enter 10-digit No:', true);
      const next: SessionState = { ...state, step: 'confirm', recipient: rec };
      await saveState(db, sessionId, next);
      return go(await confirmScreen(db, next, rec), true);
    }

    // confirm
    if (state.step === 'confirm') {
      if (input !== '1') {
        await clearState(db, sessionId);
        return go('Order cancelled.', false);
      }

      const isChecker = state.product === 'checker';
      const recipient = state.recipient!;

      // Resolve the product and its price server-side.
      let price: number;
      let label: string;
      let orderRow: Record<string, unknown>;

      if (isChecker) {
        const t = await getVoucherType(db, state.voucherTypeId!);
        if (!t) {
          await clearState(db, sessionId);
          return go('Checker unavailable. Dial again.', false);
        }
        price = t.price;
        label = t.name;
        orderRow = {
          product_type: 'checker', voucher_type_id: t.id,
          bundle_id: null, bundle_name: t.name, network: null, data: null,
        };
      } else {
        const b = await getBundle(db, state.bundleId!);
        if (!b) {
          await clearState(db, sessionId);
          return go('Bundle unavailable. Dial again.', false);
        }
        price = b.price;
        label = b.name;
        orderRow = {
          product_type: 'data', voucher_type_id: null,
          bundle_id: b.id, bundle_name: b.name, network: b.network, data: b.data,
        };
      }

      const reference = makeTxnId();
      const { data: inserted } = await db
        .from('orders')
        .insert({
          ...orderRow,
          reference,
          price,
          phone: recipient,
          email: null,
          status: 'pending',
          channel: 'ussd',
          payment_method: 'telapay-momo',
          payment_ref: reference,
          payer_phone: toLocal(msisdn),
        })
        .select()
        .single();

      // Hold the PIN BEFORE charging — never take money we cannot fulfil.
      if (isChecker && inserted) {
        const held = await reserveVoucher(db, String(inserted.voucher_type_id), String(inserted.id));
        if (!held) {
          await db.from('orders').update({ status: 'failed' }).eq('id', inserted.id);
          await clearState(db, sessionId);
          return go('That checker just sold out. You have not been charged.', false);
        }
      }

      await clearState(db, sessionId);

      // The theTeller MoMo charge (and Telegram ping) are slow external calls.
      // USSD gateways time out in a few seconds, so we run them in the
      // BACKGROUND and reply instantly. theTeller sends the customer's MoMo
      // PIN prompt out-of-band, so ending the USSD session here is fine.
      const background = (async () => {
        try {
          // r_switch must describe the payer's wallet. The prefix is the
          // reliable signal; the gateway's own hint is only a fallback.
          const charge = await initiateCharge({
            transactionId: reference,
            amountGhs: price,
            subscriberNumber: msisdn,
            network: networkFromPhone(msisdn) || networkHint || 'MTN',
            desc: `${label} to ${recipient}`,
            reference,
            callbackUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/telapay-callback`,
          });
          if (!charge.ok && inserted) {
            // Charge never started — put the PIN back rather than stranding it.
            if (isChecker) await releaseVoucher(db, String(inserted.id));
            await db.from('orders').update({ status: 'failed' }).eq('id', inserted.id);
          }
        } catch { /* order stays pending; admin can reconcile */ }
        try {
          if (inserted) await notifyTelegram(inserted);
        } catch { /* ignore */ }
      })();
      // Keep the isolate alive until the background work finishes.
      try {
        (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
          .EdgeRuntime?.waitUntil?.(background);
      } catch { /* not available locally — fine */ }

      const tail = isChecker
        ? 'Dial again and pick My checkers for your PIN.'
        : `${label} loads to ${recipient} after payment.`;
      return go(
        `To pay ${money(price)}: approve in your MoMo app, or dial *170# then Approvals. ${tail} Ref ${reference}`,
        false
      );
    }

    return go('Error. Please dial again.', false);
  } catch (_err) {
    return go('Service error. Try again.', false);
  }
}
