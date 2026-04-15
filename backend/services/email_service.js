/**
 * email_service.js
 * 
 * Transactional email via Resend
 * - Welcome emails on signup
 * - Launch notifications to waitlist
 * - Weekly digest for premium subscribers
 * - Signal alerts for active traders
 */

const log      = require('./logger').child({ module: 'email_service' });
const supabase = require('./supabase');

const EMAIL_LOG_TABLE = 'email_log';

class EmailService {
  constructor() {
    // Would integrate with Resend API in production
    this.provider = 'resend'; // or 'sendgrid'
    this.fromEmail = 'noreply@simualpha.com';
  }

  /**
   * Log one email attempt to the `email_log` table. Logging failures never
   * throw — we don't want an audit-table outage to break user signup.
   */
  async _logEmail({ email, type, subject, status, error = null, provider_id = null }) {
    try {
      const { error: dbErr } = await supabase
        .from(EMAIL_LOG_TABLE)
        .insert({
          email,
          type,
          subject,
          status,
          provider: this.provider,
          provider_id,
          error,
        });
      if (dbErr) {
        log.warn({ err: dbErr, email, type }, 'email_log insert failed (non-fatal)');
      }
    } catch (err) {
      log.warn({ err, email, type }, 'email_log exception (non-fatal)');
    }
  }

  /**
   * Send welcome email on signup
   */
  async sendWelcomeEmail(email, userName) {
    const subject = 'Welcome to SimuAlpha';
    try {
      const template = this.getWelcomeTemplate(userName);
      await this.send({ to: email, subject, html: template });
      await this._logEmail({ email, type: 'welcome', subject, status: 'sent' });
      log.info({ email }, 'Welcome email sent');
      return true;
    } catch (err) {
      await this._logEmail({
        email, type: 'welcome', subject, status: 'failed',
        error: err?.message || String(err),
      });
      log.error({ err, email }, 'Failed to send welcome email');
      return false;
    }
  }

  /**
   * Send launch notification to waitlist
   */
  async sendLaunchNotification(emails) {
    const subject = 'SimuAlpha is Live - Your Early Access is Ready';
    try {
      const template = this.getLaunchTemplate();
      let sent = 0;

      for (const email of emails) {
        try {
          await this.send({ to: email, subject, html: template });
          await this._logEmail({ email, type: 'launch', subject, status: 'sent' });
          sent++;
        } catch (err) {
          await this._logEmail({
            email, type: 'launch', subject, status: 'failed',
            error: err?.message || String(err),
          });
          log.warn({ email }, 'Failed to send launch email');
        }
      }

      log.info({ sent, total: emails.length }, 'Launch emails sent');
      return sent === emails.length;
    } catch (err) {
      log.error({ err }, 'Batch launch notification failed');
      return false;
    }
  }

  /**
   * Send weekly digest for premium subscribers
   */
  async sendWeeklyDigest(email, digestData) {
    const subject = `Your Weekly SimuAlpha Digest - Week of ${digestData.week}`;
    try {
      const template = this.getDigestTemplate(digestData);
      await this.send({ to: email, subject, html: template });
      await this._logEmail({ email, type: 'digest', subject, status: 'sent' });
      log.info({ email }, 'Weekly digest sent');
      return true;
    } catch (err) {
      await this._logEmail({
        email, type: 'digest', subject, status: 'failed',
        error: err?.message || String(err),
      });
      log.error({ err, email }, 'Failed to send digest');
      return false;
    }
  }

  /**
   * Send signal alert
   */
  async sendSignalAlert(email, signalData) {
    const subject = `${signalData.tier} Signal: ${signalData.ticker}`;
    try {
      const template = this.getSignalAlertTemplate(signalData);
      await this.send({ to: email, subject, html: template });
      await this._logEmail({ email, type: 'alert', subject, status: 'sent' });
      log.info({ email, ticker: signalData.ticker }, 'Signal alert sent');
      return true;
    } catch (err) {
      await this._logEmail({
        email, type: 'alert', subject, status: 'failed',
        error: err?.message || String(err),
      });
      log.error({ err, email }, 'Failed to send signal alert');
      return false;
    }
  }

  /**
   * Core send function (would use Resend SDK)
   */
  async send(options) {
    try {
      // In production, this would call:
      // const resend = new Resend(process.env.RESEND_API_KEY);
      // await resend.emails.send({
      //   from: this.fromEmail,
      //   to: options.to,
      //   subject: options.subject,
      //   html: options.html
      // });

      log.debug({ to: options.to }, 'Email sent via ' + this.provider);
      return true;
    } catch (err) {
      throw err;
    }
  }

  /**
   * Email templates
   */
  getWelcomeTemplate(userName) {
    return `
      <h1>Welcome to SimuAlpha!</h1>
      <p>Hi ${userName},</p>
      <p>Thanks for joining our early access list. We're building the future of Elliott Wave analysis.</p>
      <p>You'll be among the first to access SimuAlpha when we launch.</p>
      <p>In the meantime, explore our methodology and learn how institutions use Elliott Wave for entry analysis.</p>
      <p>- The SimuAlpha Team</p>
    `;
  }

  getLaunchTemplate() {
    return `
      <h1>SimuAlpha is Live!</h1>
      <p>Your early access is ready.</p>
      <p>Log in now to:</p>
      <ul>
        <li>See real-time Elliott Wave analysis</li>
        <li>Track institutional positions</li>
        <li>Get entry signals with confluence zones</li>
        <li>Access our backtested performance data</li>
      </ul>
      <p><a href="https://simualpha.com">Get Started →</a></p>
    `;
  }

  getDigestTemplate(digestData) {
    return `
      <h1>Your Weekly Digest</h1>
      <p>This week, our system analyzed ${digestData.signals_analyzed || 0} opportunities.</p>
      <p>Win rate: ${digestData.win_rate || '0'}%</p>
      <p>Top pick: ${digestData.top_pick || 'N/A'}</p>
      <p><a href="https://simualpha.com/dashboard">View Full Dashboard →</a></p>
    `;
  }

  getSignalAlertTemplate(signalData) {
    return `
      <h1>${signalData.tier} Signal: ${signalData.ticker}</h1>
      <p>Price: $${signalData.price}</p>
      <p>Confidence: ${signalData.confidence}%</p>
      <p>Entry Zone: $${signalData.entry_low} - $${signalData.entry_high}</p>
      <p><a href="https://simualpha.com/ticker/${signalData.ticker}">View Analysis →</a></p>
    `;
  }

  /**
   * Aggregate send counts from `email_log`. Supabase doesn't support
   * GROUP BY directly from the JS client, so we use `count` with filters.
   */
  async getEmailStats() {
    try {
      const now = new Date();
      const dayAgo  = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const weekAgo = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000).toISOString();

      const countSince = async (since, status = 'sent') => {
        const { count, error } = await supabase
          .from(EMAIL_LOG_TABLE)
          .select('*', { count: 'exact', head: true })
          .gte('sent_at', since)
          .eq('status', status);
        if (error) {
          log.warn({ err: error }, 'getEmailStats count failed');
          return 0;
        }
        return count || 0;
      };

      const [dayCount, weekCount, weekFailed, weekBounced] = await Promise.all([
        countSince(dayAgo,  'sent'),
        countSince(weekAgo, 'sent'),
        countSince(weekAgo, 'failed'),
        countSince(weekAgo, 'bounced'),
      ]);

      const weekTotal = weekCount + weekFailed + weekBounced;
      const bounceRate = weekTotal > 0
        ? Math.round((weekBounced / weekTotal) * 10000) / 100
        : 0;

      return {
        emails_sent_today: dayCount,
        emails_sent_week:  weekCount,
        emails_failed_week:  weekFailed,
        emails_bounced_week: weekBounced,
        bounce_rate: bounceRate,
        // open_rate / click_rate require provider webhook data not yet wired.
        open_rate:  null,
        click_rate: null,
      };
    } catch (err) {
      log.error({ err }, 'Failed to get email stats');
      return null;
    }
  }
}

module.exports = new EmailService();
