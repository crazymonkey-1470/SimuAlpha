/**
 * Skill: self_improve — Agent Self-Improvement Engine
 *
 * Runs weekly. Analyzes the knowledge base, scoring outcomes, and error logs
 * to identify gaps between what the system KNOWS and what it CAN DO.
 * Stores actionable suggestions with exact Claude Code prompts in agent_suggestions.
 */

const log = require('../../services/logger').child({ module: 'self_improve' });
const { complete } = require('../../services/llm');
const supabase = require('../../services/supabase');
const { logActivity } = require('../../services/agent_logger');

const SYSTEM_PROMPT = `You are SimuAlpha's self-improvement engine. You analyze
the gap between what the system knows (knowledge base) and what it actually
implements (scoring engine, skills, pipeline).

You look for:
1. MISSING FEATURES: Concepts mentioned in the knowledge base that aren't
   implemented in the scoring algorithm. Example: "RSI bullish divergence
   is mentioned as a +2 confluence signal in the TLI spec but the confluence
   scorer doesn't compute RSI."

2. DATA GAPS: Fields referenced in scoring rules that aren't being fetched
   from any data source. Example: "insider_net_buying is used in the Lynch
   screen but we don't have SEC Form 4 data flowing in."

3. WEIGHT ADJUSTMENTS: Based on signal outcomes, which weights should change.

4. NEW SKILLS: Capabilities mentioned in documents that don't exist as skills.

5. BUG PATTERNS: Recurring errors in the LLM call logs that indicate
   systemic issues.

For each suggestion, write the EXACT Claude Code prompt that would implement
the fix. The prompt should be specific enough that someone can paste it into
Claude Code and get a working implementation.

Return JSON array:
[
  {
    "suggestion_type": "MISSING_FEATURE",
    "title": "Add RSI divergence to confluence scorer",
    "description": "The TLI spec awards +2 points for RSI bullish divergence at support, but confluence_scorer.js doesn't compute RSI.",
    "priority": "MEDIUM",
    "evidence": "Found in knowledge chunk: 'TLI Scoring Algorithm v1.0' section 5.4",
    "claude_code_prompt": "In backend/pipeline/confluence_scorer.js, add RSI bullish divergence detection. Compute 14-period RSI from the weekly price data already available in stock.weeklyPrices. RSI divergence = price making lower low while RSI makes higher low. If detected at a support level, add +2 to confluence score and push 'RSI_DIVERGENCE' to the supports array. The RSI calculation: ..."
  }
]

Rules:
- Generate between 1 and 5 suggestions per run
- Only suggest things with clear evidence (don't invent problems)
- Prioritize suggestions that would directly improve scoring accuracy
- Each claude_code_prompt must be self-contained and actionable
- If there are no meaningful gaps to report, return an empty array []`;

async function execute() {
  // Gather system state for analysis

  // 1. Knowledge base summary
  const { data: chunks } = await supabase.from('knowledge_chunks')
    .select('source_name, topics, tickers_mentioned')
    .limit(500);

  // 2. Recent LLM errors (agent_activity doesn't exist, use llm_calls failures)
  const { data: recentErrors } = await supabase.from('llm_calls')
    .select('task, error, created_at')
    .not('error', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);

  // 3. Signal outcomes with matured returns
  const { data: outcomes } = await supabase.from('signal_outcomes')
    .select('*')
    .not('return_3mo', 'is', null)
    .limit(50);

  // 4. Current scoring config
  const { data: config } = await supabase.from('scoring_config').select('*');

  // 5. Learned principles
  const { data: principles } = await supabase.from('learned_principles')
    .select('rule_text, confidence, layer, status')
    .order('confidence', { ascending: false })
    .limit(20);

  // Build the analysis prompt
  const uniqueSources = [...new Set(chunks?.map(c => c.source_name) || [])];
  const allTopics = [...new Set(chunks?.flatMap(c => c.topics) || [])];

  let outcomeSummary = 'No outcomes yet';
  if (outcomes?.length > 0) {
    const avg3mo = outcomes.reduce((a, b) => a + (b.return_3mo || 0), 0) / outcomes.length;
    const winRate = outcomes.filter(o => o.return_3mo > 0).length / outcomes.length * 100;
    outcomeSummary = `${outcomes.length} matured signals. Average 3mo return: ${avg3mo.toFixed(1)}%. Win rate: ${winRate.toFixed(0)}%`;
  }

  const result = await complete({
    task: 'WEIGHT_ADJUST',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `Analyze SimuAlpha's current state and suggest improvements.

KNOWLEDGE BASE: ${chunks?.length || 0} chunks across these sources:
${uniqueSources.join('\n')}

Topics covered: ${allTopics.join(', ')}

RECENT ERRORS (${recentErrors?.length || 0}):
${recentErrors?.map(e => `[${e.task}] ${e.error}`).join('\n') || 'None'}

SIGNAL OUTCOMES: ${outcomeSummary}

CURRENT SCORING CONFIG:
${config?.map(c => `${c.config_key}: ${c.config_value}`).join('\n') || 'Not loaded'}

LEARNED PRINCIPLES (${principles?.length || 0}):
${principles?.map(p => `[${p.layer}/${p.status}] ${p.rule_text} (conf: ${p.confidence})`).join('\n') || 'None'}

Identify gaps and write specific Claude Code prompts to fix them.`,
    maxTokens: 3000,
  });

  // Parse and store suggestions
  let suggestionsStored = 0;
  try {
    const cleaned = result.replace(/```json|```/g, '').trim();
    const suggestions = JSON.parse(cleaned);

    if (!Array.isArray(suggestions)) {
      log.warn('LLM returned non-array, skipping storage');
      return { suggestions_generated: 0, raw: result };
    }

    for (const s of suggestions) {
      const { error } = await supabase.from('agent_suggestions').insert({
        suggestion_type: s.suggestion_type || 'MISSING_FEATURE',
        title: s.title,
        description: s.description,
        claude_code_prompt: s.claude_code_prompt || null,
        evidence: s.evidence || null,
        priority: s.priority || 'MEDIUM',
        status: 'PENDING',
      });

      if (error) {
        log.error({ err: error }, 'Insert failed');
      } else {
        suggestionsStored++;
        log.info({ title: s.title, priority: s.priority }, 'Stored suggestion');
        logActivity({
          type: 'SUGGESTION',
          title: s.title,
          description: s.description,
          details: { priority: s.priority, type: s.suggestion_type },
          importance: s.priority === 'HIGH' ? 'IMPORTANT' : 'NOTABLE',
        });
      }
    }

    return { suggestions_generated: suggestionsStored, suggestions };
  } catch (e) {
    log.error({ err: e }, 'Failed to parse LLM response');
    return { suggestions_generated: 0, error: 'Failed to parse suggestions', raw: result };
  }
}

module.exports = { execute };
