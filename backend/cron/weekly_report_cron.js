const https = require('https');
const AIRTABLE_KEY = process.env.AIRTABLE_API_KEY;
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const BASE_ID = 'app57wLO5tYgpApjP';
const TABLE_ID = 'tblQLb83jXlM8a7Nf';
const TELEGRAM_CHAT_ID = '8626469251';

function airtableFetch(path, opts = {}) {
  return new Promise((resolve, reject) => {
    const method = opts.method || 'GET';
    const body = opts.body ? JSON.stringify(opts.body) : undefined;
    const headers = { 'Authorization': `Bearer ${AIRTABLE_KEY}` };
    if (body) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(body); }
    let data = '';
    const req = https.request({ hostname: 'api.airtable.com', path, method, headers, timeout: 15000 }, res => {
      res.on('data', c => data += c); res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function claudeAnalyze(systemPrompt, userPrompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });
    const opts = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 30000
    };
    let data = '';
    const req = https.request(opts, res => {
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const r = JSON.parse(data);
          resolve(r.content?.[0]?.text || '');
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sendTelegram(message) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'Markdown' });
    const opts = {
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    let data = '';
    https.request(opts, res => { res.on('data', c => data += c); res.on('end', () => resolve(JSON.parse(data))); }).on('error', () => resolve(false)).write(body);
  });
}

async function getWeekPosts() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const tables = [
    { name: 'TLI Posts', role: 'Elliott Wave analysis, wave counts, stock setups, price targets' },
    { name: 'AI & Agent Intelligence', role: 'AI tools, agent methodologies, productivity principles' },
    { name: 'Macro & Markets', role: 'Macro trends, market regime, VIX, sector moves' },
    { name: 'Trade Ideas', role: 'Short-term trade setups, derivatives, market signals' },
    { name: 'Politician Trades', role: 'Insider and politician stock buys/sells' },
    { name: 'AutoPilot', role: 'Unique investor strategies and trading approaches' },
  ];

  const collected = {};
  for (const t of tables) {
    try {
      const formula = encodeURIComponent(`IS_AFTER({Date Posted}, '${weekAgo}')`);
      const r = await airtableFetch(`/v0/${BASE_ID}/${encodeURIComponent(t.name)}?filterByFormula=${formula}&maxRecords=100`);
      // Filter out retweets and very short posts
      const posts = (r.records || [])
        .map(rec => rec.fields['Content'] || '')
        .filter(c => c.length > 80 && !c.startsWith('RT @'))
        .slice(0, 30); // Cap at 30 per table to keep context manageable
      collected[t.name] = { posts, role: t.role };
    } catch(e) {
      collected[t.name] = { posts: [], role: t.role };
    }
  }
  return collected;
}

async function main() {
  console.log('Fetching this week\'s posts...');
  const tables = await getWeekPosts();
  const weekOf = new Date().toISOString().split('T')[0];

  // Build context for Claude
  let context = '';
  let totalPosts = 0;
  for (const [name, data] of Object.entries(tables)) {
    if (data.posts.length === 0) continue;
    totalPosts += data.posts.length;
    context += `\n\n=== ${name} (${data.role}) ===\n`;
    context += data.posts.map((p, i) => `[${i+1}] ${p.slice(0, 200)}`).join('\n');
  }

  if (totalPosts === 0) {
    console.log('No posts this week — skipping');
    return;
  }

  console.log(`Analyzing ${totalPosts} posts with Claude...`);

  const systemPrompt = `You are ALPHA, SimuAlpha's market analyst AI. You have been reading posts from expert investors, traders, and AI researchers all week. Your job is to write a weekly learning summary for your owner, Andrew.

Rules:
- Only state things that are explicitly supported by the posts below. Never fabricate.
- Be direct and specific. Name tickers, wave positions, price levels when they appear in the data.
- Skip sections where you learned nothing meaningful.
- Write like a sharp analyst giving a personal debrief — concise, signal-dense.
- Do not include filler, preamble, or caveats beyond the disclaimer.`;

  const userPrompt = `Here are all the posts I read this week (${weekOf}):
${context}

Write a weekly learning report in this structure. Only include a section if there's real substance to report:

**What I Learned This Week**

**Markets & Elliott Wave**
[What did TLI say about the market this week? Any specific tickers, wave counts, entries, targets?]

**AI & Agent Intelligence**
[What new AI/agent principles or tools came up? What's worth applying?]

**Macro & Positioning**
[What macro themes emerged? What are traders watching?]

**Interesting Trades & Signals**
[Any notable trade ideas, politician buys, or derivatives signals worth flagging?]

**My Take**
[1-2 sentences on what I think is most important from everything I read this week. Be direct. Only say this if you have something genuine to say based on the data.]

End with: _Not financial advice. Based solely on publicly available posts._`;

  const report = await claudeAnalyze(systemPrompt, userPrompt);
  console.log('\n--- REPORT ---');
  console.log(report);
  console.log('--- END ---\n');

  const fullReport = `📊 *ALPHA Weekly Learnings — ${weekOf}*\n\n${report}`;

  // Store in Airtable
  const r = await airtableFetch(`/v0/${BASE_ID}/${TABLE_ID}`, {
    method: 'POST',
    body: { fields: { 'Week Ending': weekOf, 'Report Content': fullReport, 'Posts Analyzed': totalPosts, 'Status': 'Published' } }
  });
  console.log(r.id ? `✅ Stored: ${r.id}` : `❌ Airtable error: ${JSON.stringify(r.error)}`);

  // Send to Telegram
  const sent = await sendTelegram(fullReport);
  console.log(sent.ok ? `✅ Sent to Telegram` : `❌ Telegram: ${JSON.stringify(sent)}`);
}

main().catch(e => console.error(e.message));

// Export for cron.js integration
module.exports = { runWeeklyReport: main };
