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
  } catch (err) {
    // Don't let logging failures break the pipeline
    log.error({ err }, 'Failed to log agent activity');
  }
}

module.exports = { logActivity };
