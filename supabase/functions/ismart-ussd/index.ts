// ════════════════════════════════════════════════════════════
//  ismart-ussd  —  iSmart (iSmart International Ghana) adapter.
//
//  ⚠ PROVISIONAL. iSmart publishes no USSD API documentation — their
//  developer pages are marketing copy and the "API Reference" links are
//  not links. This endpoint therefore:
//
//    1. parses TOLERANTLY across the field names every Ghanaian
//       aggregator we have seen actually uses,
//    2. LOGS the full raw request, so the first real call from iSmart
//       reveals their true envelope in the function logs, and
//    3. replies in a style that is auto-detected from the request, with
//       an ISMART_REPLY_STYLE secret to pin it once confirmed.
//
//  Once iSmart confirm their spec (or one test call lands in the logs),
//  the detection below should be replaced with their exact contract.
//
//  Read the logs with:
//    supabase functions logs ismart-ussd --project-ref <ref>
//
//  The menu itself lives in _shared/ussd-flow.ts, shared with frog-ussd
//  and uzo-ussd, so all three gateways stay in step.
//
//  Deploy: supabase functions deploy ismart-ussd --no-verify-jwt
// ════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleUssd } from '../_shared/ussd-flow.ts';

/** First non-empty value among several possible key spellings. */
function pick(body: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const direct = body[k];
    if (direct !== undefined && direct !== null && String(direct).trim() !== '') {
      return String(direct).trim();
    }
    // Case-insensitive fallback — aggregators are inconsistent about casing.
    const hit = Object.keys(body).find((bk) => bk.toLowerCase() === k.toLowerCase());
    if (hit && String(body[hit]).trim() !== '') return String(body[hit]).trim();
  }
  return '';
}

type Style = 'uzo' | 'wigal' | 'africastalking' | 'simple';

/** Reply in whatever dialect the request appears to be written in. */
function detectStyle(body: Record<string, unknown>): Style {
  const forced = (Deno.env.get('ISMART_REPLY_STYLE') ?? '').trim().toLowerCase();
  if (forced === 'uzo' || forced === 'wigal' || forced === 'africastalking' || forced === 'simple') {
    return forced as Style;
  }
  if (pick(body, ['ussdServiceOp'])) return 'uzo';
  if (pick(body, ['mode'])) return 'wigal';
  // Africa's Talking sends serviceCode + text and expects CON/END plain text.
  if (pick(body, ['serviceCode']) || (('text' in body) && !('ussdString' in body))) {
    return 'africastalking';
  }
  return 'simple';
}

function render(style: Style, body: Record<string, unknown>, message: string, cont: boolean): Response {
  const jsonHeaders = { 'Content-Type': 'application/json; charset=UTF-8' };

  if (style === 'uzo') {
    return new Response(
      JSON.stringify({ message, ussdServiceOp: cont ? 2 : 17 }),
      { status: 200, headers: jsonHeaders }
    );
  }
  if (style === 'wigal') {
    return new Response(
      JSON.stringify({
        network: body.network ?? '',
        sessionid: pick(body, ['sessionid', 'sessionID', 'sessionId']),
        mode: cont ? 'more' : 'end',
        phonenumber: pick(body, ['phonenumber', 'msisdn']),
        userdata: message,
      }),
      { status: 200, headers: jsonHeaders }
    );
  }
  if (style === 'africastalking') {
    // Plain text, prefixed CON (continue) or END (final).
    return new Response(`${cont ? 'CON' : 'END'} ${message}`, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
    });
  }
  // Generic: include several common field spellings so a strict consumer
  // still finds what it is looking for.
  return new Response(
    JSON.stringify({
      message,
      text: message,
      continueSession: cont,
      sessionState: cont ? 'continue' : 'end',
    }),
    { status: 200, headers: jsonHeaders }
  );
}

Deno.serve(async (req) => {
  if (req.method === 'GET') {
    return new Response('Anasdata USSD (iSmart) — ready', { status: 200 });
  }
  if (req.method !== 'POST') {
    return new Response('Anasdata USSD (iSmart) — ready', { status: 200 });
  }

  const raw = await req.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(raw);
  } catch {
    // Form-encoded or query-style bodies.
    try {
      const params = new URLSearchParams(raw);
      params.forEach((v, k) => (body[k] = v));
    } catch { /* leave empty */ }
  }
  // Query-string params too, in case they send them that way.
  new URL(req.url).searchParams.forEach((v, k) => {
    if (body[k] === undefined) body[k] = v;
  });

  // THE POINT OF THIS ENDPOINT UNTIL THE SPEC IS CONFIRMED: capture exactly
  // what iSmart sends, so the adapter can be finished from real traffic.
  console.log('ismart-ussd inbound', JSON.stringify({
    method: req.method,
    contentType: req.headers.get('content-type'),
    rawBody: raw.slice(0, 2000),
    parsedKeys: Object.keys(body),
  }));

  const sessionId = pick(body, ['sessionID', 'sessionId', 'sessionid', 'session_id', 'SessionId']);
  const msisdn = pick(body, ['msisdn', 'phonenumber', 'phoneNumber', 'phone', 'mobile', 'from', 'MSISDN']);
  const input = pick(body, ['ussdString', 'userdata', 'userData', 'text', 'input', 'message', 'ussdInput']);
  const serviceCode = pick(body, ['code', 'serviceCode', 'ussdCode', 'shortcode']);

  // Phase: every aggregator signals "first request" differently.
  const op = parseInt(pick(body, ['ussdServiceOp', 'msgtype', 'requestType', 'type']), 10);
  const mode = pick(body, ['mode']).toUpperCase();
  const newSession = pick(body, ['newSession', 'isNewSession']).toLowerCase();

  let phase: 'start' | 'continue' | 'end';
  if (mode === 'START' || op === 1 || newSession === 'true' || (!input && !mode && Number.isNaN(op))) {
    phase = 'start';
  } else if (mode === 'END' || (!Number.isNaN(op) && op >= 29)) {
    phase = 'end';
  } else {
    phase = 'continue';
  }

  // On the first request the "input" is usually the dialled code itself, not
  // a menu choice — passing it through would read as a keypress.
  const keypress = phase === 'start' || (serviceCode && input === serviceCode) ? '' : input;

  const result = await handleUssd(
    createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!),
    {
      sessionId: sessionId || `ismart-${msisdn}`, // never key state on an empty id
      msisdn,
      input: keypress,
      phase,
      networkHint: pick(body, ['network', 'networkCode', 'operator']),
    }
  );

  return render(detectStyle(body), body, result.message, result.cont);
});
