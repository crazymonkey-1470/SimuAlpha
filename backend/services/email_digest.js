const supabase = require('./supabase');
const log = require('./logger').child({ module: 'email_digest' });

async function generateWeeklyDigest() {
  const { data: topStocks } = await supabase.from('screener_results')
    .select('ticker, company_name, total_score, signal, current_price, revenue_growth_pct')
    .in('signal', ['LOAD THE BOAT', 'ACCUMULATE'])
    .order('total_score', { ascending: false })
    .limit(5);

  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const { data: newSignals } = await supabase.from('sain_signals')
    .select('ticker, direction, signal_date')
    .gte('signal_date', weekAgo)
    .order('signal_date', { ascending: false })
    .limit(10);

  const { data: fsc } = await supabase.from('sain_consensus')
    .select('ticker, total_sain_score, layers_aligned')
    .eq('is_full_stack_consensus', true);

  const { data: agentHighlights } = await supabase.from('agent_activity')
    .select('title, description')
    .in('importance', ['IMPORTANT', 'CRITICAL'])
    .gte('created_at', weekAgo)
    .limit(5);

  const { count } = await supabase.from('screener_results')
    .select('*', { count: 'exact', head: true });

  return {
    generated_at: new Date().toISOString(),
    top_opportunities: topStocks || [],
    sain_signals_count: newSignals?.length || 0,
    sain_highlights: newSignals?.slice(0, 5) || [],
    full_stack_consensus: fsc || [],
    agent_highlights: agentHighlights || [],
    total_stocks_scored: count || 0,
  };
}

function buildDigestHTML(digest) {
  const topStocksHTML = digest.top_opportunities.map(s => `
    <tr>
      <td style="padding:8px;font-weight:bold;">${s.ticker}</td>
      <td style="padding:8px;">${s.company_name || ''}</td>
      <td style="padding:8px;text-align:center;">${s.total_score}</td>
      <td style="padding:8px;color:#16a34a;">${s.signal?.replace(/_/g, ' ')}</td>
      <td style="padding:8px;">$${s.current_price != null ? Number(s.current_price).toFixed(2) : '\u2014'}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#111827;color:#e5e7eb;">
  <div style="text-align:center;padding:20px 0;">
    <h1 style="color:#10b981;margin:0;">The Long Screener</h1>
    <p style="color:#9ca3af;margin:4px 0;">Weekly Intelligence Digest</p>
    <p style="color:#6b7280;font-size:12px;">${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
  </div>

  <div style="background:#1f2937;border-radius:8px;padding:16px;margin:16px 0;">
    <h2 style="color:#10b981;margin:0 0 12px;">Top Opportunities</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr style="color:#9ca3af;border-bottom:1px solid #374151;">
        <th style="padding:8px;text-align:left;">Ticker</th>
        <th style="padding:8px;text-align:left;">Company</th>
        <th style="padding:8px;text-align:center;">Score</th>
        <th style="padding:8px;text-align:left;">Signal</th>
        <th style="padding:8px;text-align:left;">Price</th>
      </tr>
      ${topStocksHTML || '<tr><td colspan="5" style="padding:8px;color:#6b7280;">No high-conviction signals this week</td></tr>'}
    </table>
  </div>

  ${digest.full_stack_consensus?.length > 0 ? `
  <div style="background:#1f2937;border-radius:8px;padding:16px;margin:16px 0;border-left:4px solid #f59e0b;">
    <h2 style="color:#f59e0b;margin:0 0 8px;">Full Stack Consensus</h2>
    <p style="color:#e5e7eb;margin:0;">
      ${digest.full_stack_consensus.map(f => f.ticker).join(', ')} \u2014 All 4 intelligence layers aligned
    </p>
  </div>` : ''}

  <div style="background:#1f2937;border-radius:8px;padding:16px;margin:16px 0;">
    <h2 style="color:#10b981;margin:0 0 8px;">SAIN Intelligence</h2>
    <p style="color:#9ca3af;font-size:13px;">${digest.sain_signals_count} new signals this week</p>
    ${digest.sain_highlights.map(s => `
      <p style="color:#e5e7eb;font-size:13px;margin:4px 0;">
        \u2022 ${s.direction || ''} ${s.ticker}
      </p>
    `).join('')}
  </div>

  <div style="background:#1f2937;border-radius:8px;padding:16px;margin:16px 0;">
    <h2 style="color:#10b981;margin:0 0 8px;">Agent Activity</h2>
    ${digest.agent_highlights.map(a => `
      <p style="color:#e5e7eb;font-size:13px;margin:4px 0;">\u2022 ${a.title}</p>
    `).join('') || '<p style="color:#6b7280;font-size:13px;">No notable agent activity this week</p>'}
  </div>

  <div style="text-align:center;padding:20px 0;border-top:1px solid #374151;margin-top:20px;">
    <p style="color:#4b5563;font-size:12px;">
      ${digest.total_stocks_scored} stocks scored | Generated ${new Date().toISOString().split('T')[0]}
    </p>
    <p style="color:#6b7280;font-size:11px;">
      The Long Screener \u2014 Hephzibah Technologies LLC<br>
      Not financial advice. AI-generated analysis for educational purposes only.
    </p>
  </div>
</body>
</html>`;
}

module.exports = { generateWeeklyDigest, buildDigestHTML };
