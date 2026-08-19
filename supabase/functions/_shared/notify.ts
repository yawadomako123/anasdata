// Shared Telegram alert used by both the web (verify-payment) and USSD flows.
// Optional: does nothing if TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID aren't set.

export async function notifyTelegram(order: Record<string, unknown>) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return;

  const channel = order.channel === 'ussd' ? '📟 USSD' : '🌐 Web';
  const text =
    `🆕 *New Anasdata order* (${channel})\n\n` +
    `📦 ${order.bundle_name} (${order.data})\n` +
    `📱 \`${order.phone}\`\n` +
    `📶 ${String(order.network).toUpperCase()}\n` +
    `💵 GHS ${Number(order.price).toFixed(2)}\n` +
    `🔖 ${order.reference}`;

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
