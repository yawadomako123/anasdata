// ════════════════════════════════════════════════════════════
//  TelaPay / TPay V2 (theTeller MoMo-POS) — shared client.
//  Powers BOTH web and USSD Mobile Money charges.
//
//  Secrets required (Supabase → Edge Functions → Secrets):
//    TELAPAY_CLIENT_ID, TELAPAY_CLIENT_SECRET, TELAPAY_TERMINAL_ID
//    TELAPAY_WEBHOOK_SECRET  (optional — defaults to client_secret)
// ════════════════════════════════════════════════════════════
const BASE = 'https://api.momopos.theteller.net';

// Cache the bearer token within a warm isolate (best-effort).
let cached: { token: string; exp: number } | null = null;

export async function getToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.exp > now + 30_000) return cached.token;

  const clientId = Deno.env.get('TELAPAY_CLIENT_ID');
  const clientSecret = Deno.env.get('TELAPAY_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('TelaPay client_id/client_secret not set.');

  const res = await fetch(`${BASE}/gen-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret }).toString(),
  });
  const j = await res.json().catch(() => ({}));
  const token = j.access_token ?? j.token ?? j.data?.access_token;
  if (!token) throw new Error(`TelaPay token failed: ${j.reason ?? JSON.stringify(j)}`);
  const expiresIn = Number(j.expires_in) || 3600;
  cached = { token, exp: now + expiresIn * 1000 };
  return token;
}

// theTeller r_switch codes for TPay V2.
export function rSwitchFor(network: string): string {
  const n = String(network || '').toUpperCase();
  if (n.includes('MTN')) return 'MTN';
  if (n.includes('VODA') || n.includes('TELECEL') || n === 'VDF') return 'VDF';
  if (n.includes('AIRTEL') || n.includes('TIGO') || n.includes('ATG') || n === 'AT') return 'ATG';
  return 'MTN';
}

// Normalise a Ghana number to 233XXXXXXXXX.
export function to233(p: string): string {
  const d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('233')) return d;
  if (d.startsWith('0')) return '233' + d.slice(1);
  if (d.length === 9) return '233' + d;
  return d;
}

/**
 * Initiate a MoMo charge. TelaPay queues it (code "200") and pushes an
 * approval to the subscriber's phone; the final result arrives at `callbackUrl`.
 */
export async function initiateCharge(opts: {
  transactionId: string;
  amountGhs: number;
  subscriberNumber: string; // payer's number
  network: string;
  desc: string;
  reference: string;
  callbackUrl: string;
}): Promise<{ ok: boolean; code: string; reason?: string; systemTraceId?: string }> {
  const terminalId = Deno.env.get('TELAPAY_TERMINAL_ID');
  if (!terminalId) throw new Error('TELAPAY_TERMINAL_ID not set.');
  const token = await getToken();

  let desc = opts.desc.replace(/[^\w .-]/g, ' ').trim();
  if (desc.length < 10) desc = (desc + ' data bundle').slice(0, 100);
  desc = desc.slice(0, 100);

  const body = {
    amount: Number(opts.amountGhs).toFixed(2), // major units, e.g. "10.00"
    currency: 'GHS',
    processing_code: '000200',
    r_switch: rSwitchFor(opts.network),
    pos_terminal_id: terminalId,
    transaction_id: opts.transactionId, // 12–255 chars
    subscriber_number: to233(opts.subscriberNumber), // 233…
    desc,
    callback: opts.callbackUrl,
    reference: opts.reference.slice(0, 30),
    timestamp: new Date().toISOString(),
    voucher_code: '',
  };

  const res = await fetch(`${BASE}/process/tpay-v2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  const code = String(j.code ?? '');
  const ok = code === '200' || String(j.status ?? '').toLowerCase() === 'successful';
  return { ok, code, reason: j.reason, systemTraceId: j.system_trace_id };
}

/** Poll a transaction's final status. code "000" = success, "101" = pending. */
export async function checkStatus(transactionId: string): Promise<{
  code: string;
  status?: string;
  originalAmount?: number;
  raw: Record<string, unknown>;
}> {
  const token = await getToken();
  const res = await fetch(`${BASE}/process/check-status/${encodeURIComponent(transactionId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await res.json().catch(() => ({}));
  return {
    code: String(j.code ?? ''),
    status: j.status,
    originalAmount: j.original_amount != null ? Number(j.original_amount) : undefined,
    raw: j,
  };
}

/** Verify a webhook's X-Signature: hex HMAC-SHA256 of the raw body. */
export async function verifySignature(rawBody: string, signature: string): Promise<boolean> {
  const secret = Deno.env.get('TELAPAY_WEBHOOK_SECRET') || Deno.env.get('TELAPAY_CLIENT_SECRET') || '';
  if (!secret || !signature) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex === String(signature).trim().toLowerCase();
}
