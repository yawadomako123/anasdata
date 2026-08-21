// ════════════════════════════════════════════════════════════
//  ussd  —  Supabase Edge Function (Deno)  •  Arkesel USSD handler
//
//  Arkesel POSTs JSON on every keypress:
//    { sessionID, userID, newSession, msisdn, userData, network }
//  ...where `userData` is ONLY the latest input (not cumulative), so we
//  persist the menu state per session in the `ussd_sessions` table.
//
//  Bundles + prices are read from the `bundles` table server-side.
//
//  We reply JSON: { userID, sessionID, msisdn, message, continueSession }.
//  continueSession:false ends the call and shows `message` as the last screen.
//
//  Deploy (must be public — Arkesel sends no JWT):
//    supabase functions deploy ussd --no-verify-jwt
//  Secrets (optional payment): ARKESEL_PAYMENT_API_KEY, plus the shared
//    TELEGRAM_* used by _shared/notify.ts.
// ════════════════════════════════════════════════════════════
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  NETWORKS,
  NETWORK_ORDER,
  bundlesByNetwork,
  getBundle,
  type NetworkId,
} from '../_shared/catalogue.ts';
import { notifyTelegram } from '../_shared/notify.ts';

const PAGE_SIZE = 5;

const admin = (): SupabaseClient =>
  createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

// Arkesel gives the payer number as 233XXXXXXXXX; store/display as 0XXXXXXXXX.
function toLocal(msisdn: string): string {
  const d = String(msisdn || '').replace(/\D/g, '');
  if (d.startsWith('233')) return '0' + d.slice(3);
  if (d.startsWith('0')) return d;
  if (d.length === 9) return '0' + d;
  return d;
}
const isGhPhone = (p: string) => /^0[235][0-9]{8}$/.test(p);
const money = (n: number) => `GHS ${n.toFixed(2)}`;

interface SessionState {
  step: 'network' | 'bundle' | 'recipient' | 'enterNumber' | 'confirm';
  network?: NetworkId;
  page?: number;
  bundleId?: string;
  recipient?: string;
}

async function loadState(db: SupabaseClient, sessionID: string): Promise<SessionState | null> {
  const { data } = await db
    .from('ussd_sessions')
    .select('state')
    .eq('session_id', sessionID)
    .maybeSingle();
  return (data?.state as SessionState) ?? null;
}

async function saveState(db: SupabaseClient, sessionID: string, state: SessionState) {
  await db
    .from('ussd_sessions')
    .upsert({ session_id: sessionID, state, updated_at: new Date().toISOString() });
}

async function clearState(db: SupabaseClient, sessionID: string) {
  await db.from('ussd_sessions').delete().eq('session_id', sessionID);
}

// ── Menu screens ──────────────────────────────────────────────
function networkMenu(): string {
  const lines = NETWORK_ORDER.map((id, i) => `${i + 1}. ${NETWORKS[id].name}`);
  return `Welcome to Anasdata\nBuy data bundle:\n${lines.join('\n')}`;
}

async function bundleMenu(db: SupabaseClient, network: NetworkId, page: number): Promise<string> {
  const all = await bundlesByNetwork(db, network);
  if (all.length === 0) return `${NETWORKS[network].name}: no bundles available.\n9. Back`;
  const start = page * PAGE_SIZE;
  const slice = all.slice(start, start + PAGE_SIZE);
  const lines = slice.map((b, i) => `${i + 1}. ${b.data} - ${money(b.price)}`);
  const hasNext = start + PAGE_SIZE < all.length;
  const nav: string[] = [];
  if (hasNext) nav.push('0. More');
  nav.push('9. Back');
  return `${NETWORKS[network].name} bundles (non-expiry):\n${lines.join('\n')}\n${nav.join('   ')}`;
}

async function confirmScreen(db: SupabaseClient, bundleId: string, recipient: string): Promise<string> {
  const b = await getBundle(db, bundleId);
  if (!b) return 'That bundle is no longer available. Please dial again.';
  return (
    `Confirm order:\n` +
    `${b.data} ${NETWORKS[b.network].name}\n` +
    `To: ${recipient}\n` +
    `Pay: ${money(b.price)}\n` +
    `1. Confirm & pay\n2. Cancel`
  );
}

// ── Payment: trigger an Arkesel mobile-money debit to the dialer ──
async function initiateCharge(opts: {
  reference: string;
  amount: number;
  payerMsisdn: string;
  network: string;
}): Promise<'sent' | 'skipped' | 'failed'> {
  const apiKey = Deno.env.get('ARKESEL_PAYMENT_API_KEY');
  if (!apiKey) return 'skipped'; // payments not wired yet — record as pending

  try {
    const res = await fetch('https://payment.arkesel.com/api/v1/payment/charge/initiate', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_number: opts.payerMsisdn, // pay from the number that dialed
        merchant_reference: opts.reference,
        channel: 'mobile-money',
        provider: opts.network.toLowerCase(), // dialer's MoMo network
        transaction_type: 'debit',
        amount: String(opts.amount),
        purpose: 'Data bundle',
        service_name: 'Anasdata',
        currency: 'GHS',
      }),
    });
    return res.ok ? 'sent' : 'failed';
  } catch (_e) {
    return 'failed';
  }
}

// ── Response helper (Arkesel JSON shape) ──────────────────────
function reply(
  base: { userID: string; sessionID: string; msisdn: string },
  message: string,
  continueSession: boolean
) {
  return new Response(
    JSON.stringify({ ...base, message, continueSession }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Anasdata USSD', { status: 200 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    try {
      const form = await req.formData();
      form.forEach((v, k) => (body[k] = v));
    } catch {
      /* ignore */
    }
  }

  const sessionID = String(body.sessionID ?? '');
  const userID = String(body.userID ?? '');
  const msisdn = String(body.msisdn ?? '');
  const network = String(body.network ?? '');
  const newSession = body.newSession === true || body.newSession === 'true';
  const userData = String(body.userData ?? '').trim();
  const base = { userID, sessionID, msisdn };

  const db = admin();

  try {
    // First dial → main menu.
    if (newSession) {
      await saveState(db, sessionID, { step: 'network' });
      return reply(base, networkMenu(), true);
    }

    const state = await loadState(db, sessionID);
    if (!state) {
      return reply(base, 'Session expired. Please dial the code again.', false);
    }

    // ── STEP: choose network ──
    if (state.step === 'network') {
      const idx = parseInt(userData, 10) - 1;
      const net = NETWORK_ORDER[idx];
      if (!net) return reply(base, `Invalid choice.\n${networkMenu()}`, true);
      await saveState(db, sessionID, { step: 'bundle', network: net, page: 0 });
      return reply(base, await bundleMenu(db, net, 0), true);
    }

    // ── STEP: choose bundle (paginated) ──
    if (state.step === 'bundle') {
      const net = state.network!;
      const all = await bundlesByNetwork(db, net);
      const page = state.page ?? 0;

      if (userData === '9') {
        await saveState(db, sessionID, { step: 'network' });
        return reply(base, networkMenu(), true);
      }
      if (userData === '0') {
        const hasNext = (page + 1) * PAGE_SIZE < all.length;
        const nextPage = hasNext ? page + 1 : page;
        await saveState(db, sessionID, { ...state, page: nextPage });
        return reply(base, await bundleMenu(db, net, nextPage), true);
      }

      const n = parseInt(userData, 10);
      const chosen = all[page * PAGE_SIZE + (n - 1)];
      if (!n || n < 1 || n > PAGE_SIZE || !chosen) {
        return reply(base, `Invalid choice.\n${await bundleMenu(db, net, page)}`, true);
      }

      await saveState(db, sessionID, { step: 'recipient', bundleId: chosen.id, network: net });
      const own = toLocal(msisdn);
      return reply(
        base,
        `${chosen.data} • ${money(chosen.price)}\nLoad to:\n1. This number (${own})\n2. Another number`,
        true
      );
    }

    // ── STEP: whose number ──
    if (state.step === 'recipient') {
      if (userData === '1') {
        const own = toLocal(msisdn);
        await saveState(db, sessionID, { ...state, step: 'confirm', recipient: own });
        return reply(base, await confirmScreen(db, state.bundleId!, own), true);
      }
      if (userData === '2') {
        await saveState(db, sessionID, { ...state, step: 'enterNumber' });
        return reply(base, 'Enter recipient number (e.g. 0244123456):', true);
      }
      return reply(base, 'Reply 1 for this number or 2 for another number.', true);
    }

    // ── STEP: typed recipient number ──
    if (state.step === 'enterNumber') {
      const rec = userData.replace(/\D/g, '');
      if (!isGhPhone(rec)) {
        return reply(base, 'Invalid number. Enter a 10-digit number (e.g. 0244123456):', true);
      }
      await saveState(db, sessionID, { ...state, step: 'confirm', recipient: rec });
      return reply(base, await confirmScreen(db, state.bundleId!, rec), true);
    }

    // ── STEP: confirm & pay ──
    if (state.step === 'confirm') {
      if (userData !== '1') {
        await clearState(db, sessionID);
        return reply(base, 'Order cancelled. Thank you.', false);
      }

      const bundle = await getBundle(db, state.bundleId!);
      if (!bundle) {
        await clearState(db, sessionID);
        return reply(base, 'That bundle is no longer available. Please dial again.', false);
      }
      const recipient = state.recipient!;
      const reference = `USSD_${Date.now()}_${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

      // Record the order up-front as pending; payment callback flips it to paid.
      const order = {
        reference,
        bundle_id: bundle.id,
        bundle_name: bundle.name,
        network: bundle.network,
        data: bundle.data,
        price: bundle.price,
        phone: recipient,
        email: null,
        status: 'pending',
        channel: 'ussd',
        payment_method: 'arkesel-momo',
        payment_ref: reference,
        payer_phone: toLocal(msisdn),
      };
      const { data: inserted } = await db.from('orders').insert(order).select().single();

      const charge = await initiateCharge({
        reference,
        amount: bundle.price,
        payerMsisdn: msisdn,
        network,
      });

      await clearState(db, sessionID);

      // Let you know a USSD order came in (even before payment approves).
      if (inserted) await notifyTelegram(inserted);

      if (charge === 'sent') {
        return reply(
          base,
          `Approve ${money(bundle.price)} with your MoMo PIN to load ${bundle.data} to ${recipient}. Dial *170# if no prompt appears.`,
          false
        );
      }
      if (charge === 'skipped') {
        return reply(
          base,
          `Order received for ${bundle.data} to ${recipient}. We'll contact you on ${toLocal(msisdn)} to complete payment. Ref: ${reference}`,
          false
        );
      }
      return reply(
        base,
        `Sorry, we couldn't start the payment. Please try again later. Ref: ${reference}`,
        false
      );
    }

    return reply(base, 'Something went wrong. Please dial again.', false);
  } catch (err) {
    return reply(base, `Service error: ${(err as Error).message}. Please try again.`, false);
  }
});
