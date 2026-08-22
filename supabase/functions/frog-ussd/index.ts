// ════════════════════════════════════════════════════════════
//  frog-ussd  —  Wigal Frog "Smart USSD V2" handler (Deno)
//
//  Wigal POSTs JSON per keypress:
//    { network, sessionid, mode, phonenumber, userdata, username, trafficid, other }
//    mode: START (new) | MORE (input) | END (closed)
//  We reply the SAME object with mode:"more"|"end" and userdata = screen text.
//  Only the latest keypress is sent, so menu state lives in `ussd_sessions`.
//  Max 160 chars per screen — menu text is kept compact.
//
//  Deploy (public — Wigal sends no JWT):
//    supabase functions deploy frog-ussd --no-verify-jwt
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
import { initiateMomoCharge, makeTxnId } from '../_shared/theteller.ts';

const PAGE_SIZE = 4; // keep each screen under Wigal's 160-char limit

const admin = (): SupabaseClient =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

function toLocal(msisdn: string): string {
  const d = String(msisdn || '').replace(/\D/g, '');
  if (d.startsWith('233')) return '0' + d.slice(3);
  if (d.startsWith('0')) return d;
  if (d.length === 9) return '0' + d;
  return d;
}
const isGhPhone = (p: string) => /^0[235][0-9]{8}$/.test(p);
const money = (n: number) => `GHS${n.toFixed(2)}`;

interface SessionState {
  step: 'network' | 'bundle' | 'recipient' | 'enterNumber' | 'confirm';
  network?: NetworkId;
  page?: number;
  bundleId?: string;
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

function networkMenu(): string {
  const lines = NETWORK_ORDER.map((id, i) => `${i + 1}. ${NETWORKS[id].name}`);
  return `Anasdata - Buy data\n${lines.join('\n')}`;
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
async function confirmScreen(db: SupabaseClient, bundleId: string, recipient: string): Promise<string> {
  const b = await getBundle(db, bundleId);
  if (!b) return 'Bundle unavailable. Dial again.';
  return `${b.data} ${NETWORKS[b.network].name}\nTo: ${recipient}\nPay ${money(b.price)}\n1. Confirm\n2. Cancel`;
}

// Reply in Wigal's shape: echo the request, set mode + userdata.
function reply(req: Record<string, unknown>, userdata: string, cont: boolean) {
  return new Response(
    JSON.stringify({
      network: req.network ?? '',
      sessionid: req.sessionid ?? '',
      mode: cont ? 'more' : 'end',
      phonenumber: req.phonenumber ?? '',
      userdata,
      username: req.username ?? '',
      trafficid: req.trafficid ?? '',
      other: req.other ?? '',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Anasdata USSD (Wigal Frog)', { status: 200 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    try {
      const form = await req.formData();
      form.forEach((v, k) => (body[k] = v));
    } catch { /* ignore */ }
  }

  const sessionid = String(body.sessionid ?? '');
  const phonenumber = String(body.phonenumber ?? '');
  const network = String(body.network ?? '');
  const mode = String(body.mode ?? '').toUpperCase();
  const userdata = String(body.userdata ?? '').trim();
  const db = admin();

  try {
    // First interaction. Wigal's first userdata is the dialed code, not a menu
    // choice, so we just open the main menu.
    if (mode === 'START') {
      await saveState(db, sessionid, { step: 'network' });
      return reply(body, networkMenu(), true);
    }
    if (mode === 'END') {
      await clearState(db, sessionid);
      return reply(body, 'Goodbye.', false);
    }

    const state = await loadState(db, sessionid);
    if (!state) return reply(body, 'Session expired. Please dial again.', false);

    // choose network
    if (state.step === 'network') {
      const net = NETWORK_ORDER[parseInt(userdata, 10) - 1];
      if (!net) return reply(body, `Invalid.\n${networkMenu()}`, true);
      await saveState(db, sessionid, { step: 'bundle', network: net, page: 0 });
      return reply(body, await bundleMenu(db, net, 0), true);
    }

    // choose bundle (paginated)
    if (state.step === 'bundle') {
      const net = state.network!;
      const all = await bundlesByNetwork(db, net);
      const page = state.page ?? 0;
      if (userdata === '9') {
        await saveState(db, sessionid, { step: 'network' });
        return reply(body, networkMenu(), true);
      }
      if (userdata === '0') {
        const nextPage = (page + 1) * PAGE_SIZE < all.length ? page + 1 : page;
        await saveState(db, sessionid, { ...state, page: nextPage });
        return reply(body, await bundleMenu(db, net, nextPage), true);
      }
      const n = parseInt(userdata, 10);
      const chosen = all[page * PAGE_SIZE + (n - 1)];
      if (!n || n < 1 || n > PAGE_SIZE || !chosen) {
        return reply(body, `Invalid.\n${await bundleMenu(db, net, page)}`, true);
      }
      await saveState(db, sessionid, { step: 'recipient', bundleId: chosen.id, network: net });
      const own = toLocal(phonenumber);
      return reply(body, `${chosen.data} ${money(chosen.price)}\nLoad to:\n1. This No (${own})\n2. Other No`, true);
    }

    // whose number
    if (state.step === 'recipient') {
      if (userdata === '1') {
        const own = toLocal(phonenumber);
        await saveState(db, sessionid, { ...state, step: 'confirm', recipient: own });
        return reply(body, await confirmScreen(db, state.bundleId!, own), true);
      }
      if (userdata === '2') {
        await saveState(db, sessionid, { ...state, step: 'enterNumber' });
        return reply(body, 'Enter number (e.g. 0244123456):', true);
      }
      return reply(body, 'Reply 1 (this No) or 2 (other No).', true);
    }

    // typed recipient
    if (state.step === 'enterNumber') {
      const rec = userdata.replace(/\D/g, '');
      if (!isGhPhone(rec)) return reply(body, 'Invalid. Enter 10-digit No:', true);
      await saveState(db, sessionid, { ...state, step: 'confirm', recipient: rec });
      return reply(body, await confirmScreen(db, state.bundleId!, rec), true);
    }

    // confirm
    if (state.step === 'confirm') {
      if (userdata !== '1') {
        await clearState(db, sessionid);
        return reply(body, 'Order cancelled.', false);
      }
      const bundle = await getBundle(db, state.bundleId!);
      if (!bundle) {
        await clearState(db, sessionid);
        return reply(body, 'Bundle unavailable. Dial again.', false);
      }
      const recipient = state.recipient!;
      // theTeller needs a 12-digit numeric transaction id; use it as our ref.
      const reference = makeTxnId();
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
        payment_method: 'theteller-momo',
        payment_ref: reference,
        payer_phone: toLocal(phonenumber),
      };
      const { data: inserted } = await db.from('orders').insert(order).select().single();

      // Debit the DIALER's Mobile Money (they get a PIN prompt). r-switch is
      // derived from the network the USSD call came in on.
      const charge = await initiateMomoCharge({
        transactionId: reference,
        amountGhs: bundle.price,
        subscriberNumber: phonenumber,
        network,
        desc: `${bundle.name} to ${recipient}`,
      });

      await clearState(db, sessionid);
      if (inserted) await notifyTelegram(inserted);

      if (charge === 'sent') {
        return reply(
          body,
          `Approve ${money(bundle.price)} with your MoMo PIN to load ${bundle.data} to ${recipient}. Dial *170# if no prompt. Ref ${reference}`,
          false
        );
      }
      if (charge === 'skipped') {
        return reply(
          body,
          `Order received. ${bundle.data} to ${recipient}. We'll contact you to complete payment. Ref ${reference}`,
          false
        );
      }
      return reply(
        body,
        `Couldn't start payment. Please try again shortly. Ref ${reference}`,
        false
      );
    }

    return reply(body, 'Error. Please dial again.', false);
  } catch (err) {
    return reply(body, `Service error. Try again.`, false);
  }
});
