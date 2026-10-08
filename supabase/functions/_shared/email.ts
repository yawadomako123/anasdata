// ════════════════════════════════════════════════════════════
//  Email delivery of purchased codes (Resend).
//
//  Email is the one delivery route that needs an outside account —
//  Supabase does not send arbitrary mail. It is therefore OPTIONAL and
//  fails soft: if RESEND_API_KEY is unset, nothing is sent, the reason is
//  recorded on the order, and the customer still collects their code on
//  screen or by dialling back in. Nothing breaks before it is configured.
//
//  Secrets (Supabase → Edge Functions → Secrets):
//    RESEND_API_KEY   — required to actually send
//    EMAIL_FROM       — verified sender, e.g. "Anas Hub <codes@yourdomain>"
// ════════════════════════════════════════════════════════════

const RESEND_URL = 'https://api.resend.com/emails';

export const isValidEmail = (e: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());

export const CATEGORY_LABEL: Record<string, { noun: string; codeLabel: string }> = {
  checker: { noun: 'results checker', codeLabel: 'PIN' },
  eticket: { noun: 'e-ticket', codeLabel: 'Ticket code' },
  voucher: { noun: 'voucher', codeLabel: 'Voucher code' },
};

/** Plain-text + HTML body for a delivered code. */
export function codeEmail(opts: {
  productName: string;
  category: string;
  serial: string;
  code: string;
  reference: string;
}) {
  const label = CATEGORY_LABEL[opts.category] ?? CATEGORY_LABEL.voucher;
  const subject = `Your ${opts.productName} — ${label.noun} from Anas Hub`;

  const text = [
    `Your ${label.noun} is ready.`,
    '',
    `Item:   ${opts.productName}`,
    `Serial: ${opts.serial}`,
    `${label.codeLabel}: ${opts.code}`,
    `Ref:    ${opts.reference}`,
    '',
    'Keep this email safe — it is proof of your purchase.',
    'You can also retrieve this code any time by dialling our shortcode',
    'and choosing "My purchases", or on our website under Track Order.',
    '',
    'Anas Hub',
  ].join('\n');

  const esc = (s: string) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
  <p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#5b3fd6;font-weight:700;margin:0 0 6px">Anas Hub</p>
  <h1 style="font-size:22px;margin:0 0 18px">Your ${esc(label.noun)} is ready</h1>
  <p style="margin:0 0 18px;color:#444">${esc(opts.productName)}</p>
  <table role="presentation" style="width:100%;border-collapse:collapse;background:#f3f5fa;border:1px solid #d8dee8;border-radius:10px">
    <tr><td style="padding:16px 18px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6d7787">Serial</div>
      <div style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:19px;font-weight:700;margin-bottom:14px">${esc(opts.serial)}</div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6d7787">${esc(label.codeLabel)}</div>
      <div style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:19px;font-weight:700">${esc(opts.code)}</div>
    </td></tr>
  </table>
  <p style="margin:18px 0 0;font-size:13px;color:#6d7787">Reference ${esc(opts.reference)}</p>
  <p style="margin:18px 0 0;font-size:13px;color:#6d7787">
    You can also retrieve this any time by dialling our shortcode and choosing
    &ldquo;My purchases&rdquo;, or on our website under Track Order.
  </p>
</div>`.trim();

  return { subject, text, html };
}

/**
 * Send one email. Never throws — the caller records the reason on the order
 * so a failed send is visible to the admin instead of vanishing.
 */
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  html: string
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM') || 'Anas Hub <onboarding@resend.dev>';

  if (!apiKey) return { ok: false, error: 'Email not configured (RESEND_API_KEY missing)' };
  if (!isValidEmail(to)) return { ok: false, error: `Invalid email address: ${to}` };

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to.trim()], subject, text, html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status} ${body.slice(0, 160)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? 'Email send failed' };
  }
}
