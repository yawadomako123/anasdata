// Shared Telegram alerts used by the web and USSD flows.
// Optional: does nothing if TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID aren't set.

/** Send arbitrary text to the admin channel (alerts, failures). */
export async function notifyTelegramText(text: string) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
  } catch (_e) {
    // Never fail an order because a notification failed.
  }
}

export async function notifyTelegram(order: Record<string, unknown>) {
  const channel = order.channel === 'ussd' ? '📟 USSD' : '🌐 Web';
  const isChecker = order.product_type === 'checker';

  // A checker has no network and no GB size, so those lines are skipped
  // rather than rendered as "undefined".
  const lines = [
    `🆕 *New Anasdata order* (${channel})`,
    '',
    isChecker ? `🎫 ${order.bundle_name}` : `📦 ${order.bundle_name} (${order.data})`,
    `📱 \`${order.phone}\``,
  ];
  if (!isChecker && order.network) lines.push(`📶 ${String(order.network).toUpperCase()}`);
  lines.push(`💵 GHS ${Number(order.price).toFixed(2)}`);
  lines.push(`🔖 ${order.reference}`);
  if (isChecker) {
    lines.push(order.delivered_at ? '✅ PIN collected' : '🎫 PIN ready — customer can view it online or dial in');
  }

  await notifyTelegramText(lines.join('\n'));
}
