// ════════════════════════════════════════════════════════════
//  SMS delivery (Arkesel v2) — how a checker PIN actually reaches
//  the customer.
//
//  A USSD session is already closed by the time MoMo confirms, so the
//  PIN cannot be shown on screen. SMS is the delivery channel, which
//  makes this the one dependency a checker sale genuinely needs.
//
//  Secrets (Supabase → Edge Functions → Secrets):
//    ARKESEL_API_KEY   — required; without it sendSms reports failure
//    SMS_SENDER_ID     — approved sender ID (defaults to "Anasdata")
// ════════════════════════════════════════════════════════════

const ARKESEL_URL = 'https://sms.arkesel.com/api/v2/sms/send';

/** Normalise a Ghana number to 233XXXXXXXXX (what Arkesel expects). */
export function to233(p: string): string {
  const d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('233')) return d;
  if (d.startsWith('0')) return '233' + d.slice(1);
  if (d.length === 9) return '233' + d;
  return d;
}

/**
 * Send one SMS. Never throws — callers record the reason on the order so a
 * failed delivery is visible to the admin instead of vanishing.
 */
export async function sendSms(
  to: string,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = Deno.env.get('ARKESEL_API_KEY');
  const sender = Deno.env.get('SMS_SENDER_ID') || 'Anasdata';

  if (!apiKey) return { ok: false, error: 'SMS not configured (ARKESEL_API_KEY missing)' };

  try {
    const res = await fetch(ARKESEL_URL, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender, message, recipients: [to233(to)] }),
    });
    const j = await res.json().catch(() => ({}));
    // Arkesel v2 replies { status: "success", data: [...] }
    const ok = res.ok && String(j.status ?? '').toLowerCase() === 'success';
    if (!ok) return { ok: false, error: j.message ?? j.status ?? `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? 'SMS send failed' };
  }
}

/** The message a customer receives once their checker is paid for. */
export function checkerSms(productName: string, serial: string, pin: string, reference: string) {
  return (
    `Anasdata — ${productName}\n` +
    `Serial: ${serial}\n` +
    `PIN: ${pin}\n` +
    `Ref: ${reference}\n` +
    `Keep this message safe.`
  );
}
