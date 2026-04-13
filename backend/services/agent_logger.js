const supabase = require('./supabase');
const log = require('./logger').child({ module: 'agent' });

/**
 * Log agent activity for the Agent Console.
 * Importance levels: INFO, NOTABLE, IMPORTANT, CRITICAL
 */
async function logActivity({ type, title, description, details = null, ticker = null, importance = 'INFO' }) {
  try {
    await supabase.from('agent_activity').insert({
      activity_type: type,
      title,
      description,
      details,
      ticker,
      importance,
    });

    // Send Telegram for CRITICAL and IMPORTANT events
    if (importance === 'CRITICAL' || importance === 'IMPORTANT') {
      sendTelegramAlert(importance, title, description, ticker).catch(() => {});
    }
  } catch (err) {
    // Don't let logging failures break the pipeline
    log.error({ err }, 'Failed to log agent activity');
  }
}

async function sendTelegramAlert(importance, title, description, ticker) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const emoji = importance === 'CRITICAL' ? '\u{1F6A8}' : '\u{1F4E2}';
  const tickerStr = ticker ? ` ($${ticker})` : '';
  const message = `${emoji} <b>${importance}</b>${tickerStr}\n${title}\n${description || ''}`;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
    });
  } catch (err) {
    log.error({ err }, 'Telegram alert failed');
  }
}

module.exports = { logActivity };
