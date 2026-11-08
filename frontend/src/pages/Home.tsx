import { supabase } from '../supabase';
import { formatDay, freshness, href, today, useApp, useLoad } from '../lib';
import type { ItemCard, QuoteCard as Quote } from '../types';
import QuoteCard from '../components/QuoteCard';
import ItemList from '../components/ItemList';
import SearchBox from '../components/SearchBox';
import Fresco from '../components/Fresco';
import { ArrowIcon, Lozenge, LozengeRule } from '../components/Icons';

export default function Home() {
  const { episodes } = useApp();
  const week = useLoad(() => supabase.from('this_week').select('*').order('created_at', { ascending: false }), []);
  const inbox = useLoad(
    () =>
      supabase.from('item_cards').select('*').eq('status', 'inbox').order('created_at', { ascending: false }).limit(30),
    [],
  );
  const reload = () => {
    week.reload();
    inbox.reload();
  };

  const weekItems = week.data as ItemCard[] | null;
  const next = episodes.find((e) => e.status === 'planning' && (!e.recording_date || e.recording_date >= today()));
  const quote = useLoad<Quote>(
    () =>
      next?.quote_id
        ? supabase.from('quote_cards').select('*').eq('id', next.quote_id).maybeSingle<Quote>()
        : Promise.resolve({ data: null, error: null }),
    [next?.quote_id],
  );
  const hasFunFact = weekItems?.some((i) => i.item_type === 'fun_fact');
  const hasGuest = weekItems?.some((i) => i.item_type === 'guest_idea');

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <Fresco />
        <div className="hero-text">
          <p className="eyebrow">
            <Lozenge size={6} />
            <span>
              {next
                ? `Next recording${next.recording_date ? ` · ${formatDay(next.recording_date)} (${freshness(next.recording_date)})` : ''}`
                : 'Between episodes'}
            </span>
            <Lozenge size={6} />
          </p>
          <h1 id="hero-title">{next ? next.title : 'This week’s pile'}</h1>
          <LozengeRule width={200} />
          <p className="hero-counts">
            {weekItems ? `${weekItems.length} nominated` : '…'} ·{' '}
            {inbox.data ? `${inbox.data.length}${inbox.data.length === 30 ? '+' : ''} in the inbox` : '…'}
          </p>
          {next && (
            <a className="button primary cta" href={href('e', next.id)}>
              Open episode plan
              <ArrowIcon size={16} />
            </a>
          )}
        </div>
      </section>

      {next && quote.data && next.quote_id && (
        <section className="home-quote" aria-labelledby="home-quote-title">
          <h2 id="home-quote-title">
            Quote of the show <span className="badge">{next.quote_role === 'opener' ? 'Opener' : 'Closer'}</span>
          </h2>
          <QuoteCard q={quote.data} compact />
          <a className="link-more" href={href('e', next.id)}>
            Questions, swap or choose another
            <ArrowIcon size={14} />
          </a>
        </section>
      )}

      <SearchBox />

      <section>
        <h2>
          This week <span className="count">{weekItems?.length ?? ''}</span>
        </h2>
        <p className="hint">Nominated for the next recording.</p>
        {weekItems && (!hasFunFact || !hasGuest) && (
          <p className="warn">
            <span className="pilcrow" aria-hidden="true">¶</span>
            Still needed: {[!hasFunFact && 'a fun fact', !hasGuest && 'a guest idea'].filter(Boolean).join(' and ')}.
          </p>
        )}
        <ItemList
          items={weekItems}
          loading={week.loading}
          error={week.error}
          onChange={reload}
          empty="Nothing nominated yet. Tap This week on anything in the inbox."
        />
      </section>

      <section>
        <h2>Latest in the inbox</h2>
        <ItemList
          items={inbox.data as ItemCard[] | null}
          loading={inbox.loading}
          error={inbox.error}
          onChange={reload}
          empty="Inbox is empty."
        />
      </section>
    </>
  );
}
