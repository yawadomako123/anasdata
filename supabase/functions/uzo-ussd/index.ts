// ════════════════════════════════════════════════════════════
//  uzo-ussd  —  Uzo (Mobiverse) USSD adapter.
//
//  Uzo POSTs JSON:
//    { ussdString, msisdn, ussdServiceOp, sessionID, network, code, country }
//      ussdServiceOp  1 = initiating, 18 = continuing, >= 29 = terminating
//      ussdString     the caller's input. On the INITIATING request this is
//                     the dialled code (e.g. "*1234#"), not a menu choice,
//                     so it is ignored for that phase.
//      network        the MNC of the originating network, not a name.
//
//  and expects JSON back:
//    { message, ussdServiceOp }   2 = continue, 17 = final
//
//  The menu itself lives in _shared/ussd-flow.ts, shared with frog-ussd, so
//  both gateways stay in step.
//
//  Deploy: supabase functions deploy uzo-ussd --no-verify-jwt
// ════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleUssd } from '../_shared/ussd-flow.ts';

const OP_CONTINUE = 2;
const OP_FINAL = 17;

/** Ghana MNCs → the token rSwitchFor() understands. Only a fallback: the
 *  msisdn prefix is the primary signal for which wallet is paying. */
function networkFromMnc(mnc: string): string {
  const m = String(mnc || '').replace(/\D/g, '').slice(-2); // "62001" → "01"
  if (m === '01') return 'MTN';
  if (m === '02') return 'VDF'; // Vodafone / Telecel
  if (m === '03' || m === '06') return 'ATG'; // Tigo / Airtel
  return '';
}

Deno.serve(async (req) => {
  // A plain GET is a browser or uptime check.
  if (req.method !== 'POST') {
    return new Response('Anasdata USSD (Uzo) — ready', { status: 200 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    try {
      const form = await req.formData();
      form.forEach((v, k) => (body[k] = v));
    } catch { /* ignore */ }
  }

  const sessionId = String(body.sessionID ?? body.sessionId ?? body.sessionid ?? '');
  const msisdn = String(body.msisdn ?? '');
  const op = parseInt(String(body.ussdServiceOp ?? ''), 10);
  const dialled = String(body.code ?? '');
  const raw = String(body.ussdString ?? '');

  const phase = op === 1 ? 'start' : op >= 29 ? 'end' : 'continue';

  // On the initiating request ussdString is the dialled code itself, which is
  // not a menu selection — passing it through would look like a keypress.
  const input = phase === 'start' || raw === dialled ? '' : raw;

  const reply = await handleUssd(
    createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!),
    {
      sessionId,
      msisdn,
      input,
      phase,
      networkHint: networkFromMnc(String(body.network ?? '')),
    }
  );

  return new Response(
    JSON.stringify({
      message: reply.message,
      ussdServiceOp: reply.cont ? OP_CONTINUE : OP_FINAL,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json; charset=UTF-8' } }
  );
});
