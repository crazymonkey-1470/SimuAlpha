/**
 * Telegram alert service
 * Sends formatted messages to a Telegram chat via Bot API.
 * Never throws — a failed alert must not crash the pipeline.
 */

const ALERT_EMOJI = {
  LOAD_THE_BOAT: '🟢',
  SIGNAL_UPGRADE: '🟡',
  CROSSED_200WMA: '📉',
  CROSSED_200MMA: '📉',
};

function formatAlert(data) {
  const emoji = ALERT_EMOJI[data.alert_type] || '📊';
  const typeLabel = data.alert_type.replace(/_/g, ' ');

  let msg = `${emoji} <b>${typeLabel} — $${data.ticker}</b>\n`;
  msg += `${data.company_name || ''} ${data.sector ? '| ' + data.sector : ''}\n`;
  msg += `━━━━━━━━━━━━━━━━━━\n`;
  msg += `Score: <b>${data.score}/100</b>\n`;
  msg += `Price: <b>$${fmt(data.current_price)}</b>\n`;

  if (data.price_200wma != null) {
    const pctWMA = data.price_200wma > 0
      ? ((data.current_price - data.price_200wma) / data.price_200wma * 100).toFixed(1)
      : '—';
    const belowWMA = parseFloat(pctWMA) <= 0;
    msg += `200 WMA: $${fmt(data.price_200wma)} (${pctWMA}% ${belowWMA ? '✅' : ''})\n`;
  }

  if (data.price_200mma != null) {
    const pctMMA = data.price_200mma > 0
      ? ((data.current_price - data.price_200mma) / data.price_200mma * 100).toFixed(1)
      : '—';
    const belowMMA = parseFloat(pctMMA) <= 0;
    msg += `200 MMA: $${fmt(data.price_200mma)} (${pctMMA}% ${belowMMA ? '✅' : ''})\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━\n`;

  if (data.entry_note) {
    msg += `📍 ${data.entry_note}\n`;
  }

  if (data.previous_signal && data.new_signal && data.previous_signal !== data.new_signal) {
    msg += `⚡ Signal: ${data.previous_signal} → ${data.new_signal}\n`;
  }

  msg += `\n<i>Not financial advice. AI-generated analysis for educational purposes only. Do your own research.</i>`;
  return msg;
}

function fmt(val) {
  if (val == null || !isFinite(val)) return '—';
  return Number(val).toFixed(2);
}

async function fireAlert(alertData) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log(`[alerts] Telegram not configured — skipping alert for ${alertData.ticker}`);
    return;
  }

  try {
    const text = formatAlert(alertData);
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[alerts] Telegram API error for ${alertData.ticker}:`, err);
    } else {
      console.log(`[alerts] ✓ Alert sent for ${alertData.ticker} (${alertData.alert_type})`);
    }
  } catch (err) {
    console.error(`[alerts] Failed to send alert for ${alertData.ticker}:`, err.message);
  }
}

module.exports = { fireAlert };
