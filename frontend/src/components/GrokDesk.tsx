import { useState } from 'react';
import { errorText, supabase } from '../supabase';
import { copyText, href, useApp } from '../lib';
import type { GrokApplyReport, GrokResult } from '../types';

const KIND_LABEL: Record<GrokResult['kind'], string> = {
  item: 'Pick',
  research: 'Research answer',
  read: 'Verified read',
  memory: 'Memory',
  quote: 'Quote',
  nominate: 'Nominated',
  attach: 'Attached',
  show_notes: 'Show notes',
};

const DAILY_TASK = `YOUR TASK
1. Read "episode": its items and what it "still_needs".
2. From "news", choose the strongest candidates. Prefer stories several outlets covered ("outlets"), follow each host's tastes in "hosts" (likes, more_like, not_interested), and skip anything in "covered_recently".
3. Check each pick against its original source before you include it. If you can't verify something, leave it out.
4. Answer every entry in "research", with sources.
5. If the episode's quote doesn't fit its theme, propose a better one. Mark it verified only if you checked the exact wording against the source you cite.
6. Save anything you learned about the show or a host as a memory.
7. "mailbag" holds listener questions. If one is good, add it as an item of type "note".`;

const SHOW_NOTES_TASK = `YOUR TASK
This episode has been recorded. From its planned items and talking points below (you have not heard the recording, so say nothing that isn't in them), draft:
- a 2-3 sentence episode description,
- show notes: the stories discussed, in order, each with its source link,
- 3 to 5 clip ideas: the moment and why it would work as a short.
The crew will edit your draft. Reply with only the "show_notes" key.`;

function replyFormat(topicSlugs: string[], showNotesOnly: boolean): string {
  if (showNotesOnly) {
    return `REPLY FORMAT
Reply with ONE JSON object inside a \`\`\`json block:
{"show_notes": {"description": "", "notes": "", "clips": ["", ""]}}`;
  }
  return `REPLY FORMAT
Reply with ONE JSON object inside a \`\`\`json block, then a short plain-English summary of your picks. Every key is optional; leave out what you don't need.
{
  "items": [{"title": "", "url": "", "source": "", "published_at": "YYYY-MM-DD", "summary": "2-3 plain sentences", "talking_points": ["a question the hosts can argue about?"], "topics": ["religion"], "type": "article", "status": "this_week", "attach": true}],
  "research": [{"id": "<id from research>", "answer": "key numbers first, 2-6 sentences", "sources": ["https://…"]}],
  "reads": [{"url": "", "title": "", "summary": "what you verified", "key_points": [""], "sources": ["https://primary-source"], "verdict": "solid"}],
  "memories": [{"content": "one fact that makes sense on its own", "kind": "preference", "about": "<crew name; leave out for the whole show>", "importance": 6}],
  "quote": {"text": "", "author": "", "source": "book and chapter, speech and date, or verse and translation", "context": "", "questions": ["", ""], "topics": ["motivation"], "verified": true, "role": "opener"},
  "nominate": ["<id, link or exact title of an inbox item to move to This week>"],
  "attach": ["<id, link or exact title of an item to put on the episode>"]
}
- "type": article, video, note, fun_fact, guest_idea (add "guest_name" and "why_them") or topic_idea.
- "status": inbox or this_week. "attach": true puts the item on the episode.
- "verdict": solid, thin, misleading, opinion or paywalled.
- "kind": preference, fact, event, instruction or reflection. "role": opener or closer.
- "topics" must come from: ${topicSlugs.join(', ')}.
- Never invent a source or a quote. Don't copy paywalled text; summarise in your own words.`;
}

/** The text to paste into Grok: role, task, reply format and the data. */
export function buildBrief(data: unknown, topicSlugs: string[], showNotesOnly = false): string {
  return [
    'You are Grok, research producer for The True Adam Podcast (hosts Freddy, Stew and Mike). This is the brief from the crew’s prep room.',
    showNotesOnly ? SHOW_NOTES_TASK : DAILY_TASK,
    replyFormat(topicSlugs, showNotesOnly),
    'BRIEF (JSON)\n' + JSON.stringify(data),
  ].join('\n\n');
}

/** Pull the JSON object out of Grok's reply (a ```json block, or the first {...} in the text). */
export function parseGrokReply(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidates = [fenced, text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)].filter((c): c is string => !!c && c.includes('{'));
  for (const c of candidates) {
    try {
      const v = JSON.parse(c.trim().replace(/[“”]/g, '"'));
      if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error('Couldn’t find Grok’s JSON in that text. Paste the whole reply, including the ```json block.');
}

/** Paste Grok's reply; its picks, answers, memories and quote are checked and saved. */
export function ApplyGrokReply({ episodeId, onApplied, placeholder }: { episodeId?: string; onApplied?: () => void; placeholder?: string }) {
  const { reloadEpisodes } = useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [report, setReport] = useState<GrokApplyReport | null>(null);

  async function apply() {
    setErr('');
    setReport(null);
    let reply: unknown;
    try {
      reply = parseGrokReply(text);
    } catch (e) {
      return setErr((e as Error).message);
    }
    setBusy(true);
    const { data, error } = await supabase.rpc('apply_grok_reply', { reply, episode: episodeId ?? null });
    setBusy(false);
    if (error) return setErr(errorText(error));
    setReport(data as GrokApplyReport);
    if ((data as GrokApplyReport).failed === 0) setText('');
    reloadEpisodes(); // the reply can change an episode's quote, items or show notes
    onApplied?.();
  }

  return (
    <div className="grok-apply">
      <textarea
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder ?? 'Paste Grok’s whole reply here'}
        aria-label="Grok’s reply"
        spellCheck={false}
      />
      <div className="actions">
        <button className="primary" disabled={busy || !text.trim()} onClick={apply}>
          {busy ? 'Saving…' : 'Apply Grok’s reply'}
        </button>
      </div>
      {err && <p className="error">{err}</p>}
      {report && (
        <div className="grok-report" role="status">
          <p className={report.failed ? 'warn' : 'success'}>
            Saved {report.saved}
            {report.failed ? `. ${report.failed} couldn’t be saved; the reasons are below.` : '.'}
            {report.saved + report.failed === 0 && ' The reply had nothing in it to save.'}
          </p>
          <ul>
            {report.results.map((r, i) => (
              <li key={i} className={r.ok ? 'ok' : 'failed'}>
                <b>{KIND_LABEL[r.kind] ?? r.kind}</b>{' '}
                {r.ok && r.id && (r.kind === 'item' || r.kind === 'nominate' || r.kind === 'attach') ? (
                  <a href={href('i', r.id)}>{r.label}</a>
                ) : (
                  <span>{r.label}</span>
                )}
                {r.note && <span className="muted"> · {r.note}</span>}
                {r.error && <span className="why"> · {r.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Copy a brief for Grok. With an episode id and showNotes, it asks for show notes for that episode. */
export function BriefGrokButton({ episodeId, showNotes = false, label }: { episodeId?: string; showNotes?: boolean; label?: string }) {
  const { topics } = useApp();
  const [state, setState] = useState<'idle' | 'busy' | 'copied'>('idle');
  const [err, setErr] = useState('');
  const [manual, setManual] = useState<string | null>(null);

  async function copy() {
    setState('busy');
    setErr('');
    const { data, error } = await supabase.rpc('grok_brief', { episode: episodeId ?? null });
    if (error) {
      setState('idle');
      return setErr(errorText(error));
    }
    const brief = buildBrief(data, topics.map((t) => t.slug), showNotes);
    if (await copyText(brief)) {
      setState('copied');
      window.setTimeout(() => setState('idle'), 2500);
    } else {
      setState('idle');
      setManual(brief); // the clipboard was blocked: show it to copy by hand
    }
  }

  return (
    <>
      <button className={showNotes ? '' : 'primary'} disabled={state === 'busy'} onClick={copy}>
        {state === 'copied' ? 'Copied. Paste it into Grok' : state === 'busy' ? 'Gathering…' : label ?? 'Brief Grok'}
      </button>
      {err && <p className="error">{err}</p>}
      {manual && (
        <textarea className="grok-manual" readOnly rows={6} value={manual} onFocus={(e) => e.currentTarget.select()} aria-label="Brief for Grok" />
      )}
    </>
  );
}

/** The daily run: brief Grok, paste its reply back. No database editor needed. */
export default function GrokDesk({ onApplied }: { onApplied?: () => void }) {
  return (
    <section className="grok-desk">
      <ol className="grok-steps">
        <li>
          <h3>Brief Grok</h3>
          <p className="small">
            One tap copies everything Grok needs: the next episode and what it still needs, the crew’s open questions,
            who’s free, today’s sorted news and each host’s tastes.
          </p>
          <div className="actions">
            <BriefGrokButton />
          </div>
        </li>
        <li>
          <h3>Paste it into Grok</h3>
          <p className="small">Open Grok, paste, and let it work. It replies with its picks in a format this page understands.</p>
        </li>
        <li>
          <h3>Paste Grok’s reply here</h3>
          <p className="small">
            Each part is checked and saved on its own: picks go to the prep room, answers to the people who asked, and
            what Grok learned into its memory. Anything that can’t be saved is listed with the reason.
          </p>
          <ApplyGrokReply onApplied={onApplied} />
        </li>
      </ol>
    </section>
  );
}
