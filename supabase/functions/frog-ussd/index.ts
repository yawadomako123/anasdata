// ════════════════════════════════════════════════════════════
//  frog-ussd  —  Wigal Frog USSD adapter, V1 + V2.
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
//  The menu itself lives in _shared/ussd-flow.ts, shared with uzo-ussd, so
//  both gateways stay in step.
//
//  Deploy: supabase functions deploy frog-ussd --no-verify-jwt
// ════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleUssd } from '../_shared/ussd-flow.ts';

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

  const mode = String(body.mode ?? '').toUpperCase();
  const phase = mode === 'START' ? 'start' : mode === 'END' ? 'end' : 'continue';

  const result = await handleUssd(
    createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!),
    {
      sessionId: String(body.sessionid ?? ''),
      msisdn: String(body.phonenumber ?? body.msisdn ?? ''),
      input: String(body.userdata ?? ''),
      phase,
      // Wigal sends a network name, which rSwitchFor() already understands.
      networkHint: String(body.network ?? ''),
    }
  );

  return reply(body, result.message, result.cont);
});
