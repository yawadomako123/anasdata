// ════════════════════════════════════════════════════════════
//  frog-ussd  —  Wigal Frog USSD handler (Deno), V1 + V2
//
//  Handles BOTH Wigal versions so it works whichever the shortcode uses:
//   • V2: POST JSON  { network, sessionid, mode, phonenumber, userdata,
//                      username, trafficid, other }  → reply JSON.
//   • V1: GET  query { network, sessionid, mode, msisdn, userdata,
//                      username, trafficid, other }   → reply pipe string
//         NETWORK|MODE|MSISDN|SESSIONID|USERDATA|USERNAME|TRAFFICID|OTHER
//  Only the latest keypress is sent, so menu state lives in ussd_sessions.
//  Max 160 chars/screen; V1 line breaks use ^.
//
//  Deploy: supabase functions deploy frog-ussd --no-verify-jwt
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
import { initiateCharge } from '../_shared/telapay.ts';

const PAGE_SIZE = 4;

const makeTxnId = () => {
  const t = String(Date.now()).slice(-10);
  const r = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  return t + r;
};

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

// Reply in V1 (pipe) or V2 (JSON) depending on how we were called.
function reply(req: Record<string, unknown>, message: string, cont: boolean) {
  const phone = String(req.phonenumber ?? req.msisdn ?? '');
  if (req.__isV1 === true) {
    const line = [
      req.network ?? '',
      cont ? 'MORE' : 'END',
      phone,
      req.sessionid ?? '',
      message.replace(/\n/g, '^'),
      req.username ?? '',
      req.trafficid ?? '',
      req.other ?? '',
    ].join('|');
    return new Response(line, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
    });
  }
  return new Response(
    JSON.stringify({
      network: req.network ?? '',
      sessionid: req.sessionid ?? '',
      mode: cont ? 'more' : 'end',
      phonenumber: phone,
      userdata: message,
      username: req.username ?? '',
      trafficid: req.trafficid ?? '',
      other: req.other ?? '',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json; charset=UTF-8' } }
  );
}

Deno.serve(async (req) => {
  // Parse either a V2 POST (JSON/form) or a V1 GET (query string).
  let body: Record<string, unknown> = {};
  let isV1 = false;

  if (req.method === 'GET') {
    const p = new URL(req.url).searchParams;
    p.forEach((v, k) => (body[k] = v));
    // A bare GET with no USSD params is just a health check / browser hit.
    if (!body.sessionid && !body.mode) {
      return new Response('Anasdata USSD (Wigal Frog) — ready', { status: 200 });
    }
    isV1 = true;
  } else if (req.method === 'POST') {
    try {
      body = await req.json();
    } catch {
      try {
        const form = await req.formData();
        form.forEach((v, k) => (body[k] = v));
      } catch { /* ignore */ }
    }
  } else {
    return new Response('Anasdata USSD (Wigal Frog) — ready', { status: 200 });
  }
  body.__isV1 = isV1;

  const db = admin();

  const sessionid = String(body.sessionid ?? '');
  const phone = String(body.phonenumber ?? body.msisdn ?? '');
  const network = String(body.network ?? '');
  const mode = String(body.mode ?? '').toUpperCase();
  const userdata = String(body.userdata ?? '').trim();

  try {
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
      const own = toLocal(phone);
      return reply(body, `${chosen.data} ${money(chosen.price)}\nLoad to:\n1. This No (${own})\n2. Other No`, true);
    }

    // whose number
    if (state.step === 'recipient') {
      if (userdata === '1') {
        const own = toLocal(phone);
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
      const reference = makeTxnId();
      const { data: inserted } = await db
        .from('orders')
        .insert({
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
          payment_method: 'telapay-momo',
          payment_ref: reference,
          payer_phone: toLocal(phone),
        })
        .select()
        .single();

      await clearState(db, sessionid);

      // The theTeller MoMo charge (and Telegram ping) are slow external calls.
      // USSD gateways time out in a few seconds, so we run them in the
      // BACKGROUND and reply instantly. theTeller sends the customer's MoMo
      // PIN prompt out-of-band, so ending the USSD session here is fine.
      const background = (async () => {
        try {
          await initiateCharge({
            transactionId: reference,
            amountGhs: bundle.price,
            subscriberNumber: phone,
            network,
            desc: `${bundle.name} to ${recipient}`,
            reference,
            callbackUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/telapay-callback`,
          });
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

      return reply(
        body,
        `To pay ${money(bundle.price)}: approve in your MoMo app, or dial *170# then Approvals. ${bundle.data} loads to ${recipient} after payment. Ref ${reference}`,
        false
      );
    }

    return reply(body, 'Error. Please dial again.', false);
  } catch (_err) {
    return reply(body, 'Service error. Try again.', false);
  }
});
