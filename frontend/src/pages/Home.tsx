import { supabase } from '../supabase';
import { formatDay, freshness, href, today, useApp, useLoad } from '../lib';
import type { ItemCard } from '../types';
import ItemList from '../components/ItemList';
import SearchBox from '../components/SearchBox';
import LazyGlobe from '../globe/LazyGlobe';

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
  const hasFunFact = weekItems?.some((i) => i.item_type === 'fun_fact');
  const hasGuest = weekItems?.some((i) => i.item_type === 'guest_idea');

  return (
    <>
      <section className="hero">
        <LazyGlobe />
        <div className="hero-text">
          <div className="eyebrow">
            <span className="dot" />
            {next ? `Next recording${next.recording_date ? ` · ${formatDay(next.recording_date)} (${freshness(next.recording_date)})` : ''}` : 'Between episodes'}
          </div>
          <h1>
            {next ? next.title : <>This week’s <em>pile</em></>}
          </h1>
          <p>
            {weekItems ? `${weekItems.length} nominated` : '…'} · {inbox.data ? `${inbox.data.length}${inbox.data.length === 30 ? '+' : ''} in the inbox` : '…'}
          </p>
          {next && (
            <a className="button cta" href={href('e', next.id)}>
              Open episode plan →
            </a>
          )}
        </div>
      </section>

      <SearchBox />

      <section>
        <h2>
          This week <span className="count">{weekItems?.length ?? ''}</span>
        </h2>
        <p className="hint">Nominated for the next recording.</p>
        {weekItems && (!hasFunFact || !hasGuest) && (
          <p className="warn">
            Still needed: {[!hasFunFact && 'a fun fact', !hasGuest && 'a guest idea'].filter(Boolean).join(' and ')}.
          </p>
        )}
        <ItemList
          items={weekItems}
          loading={week.loading}
          error={week.error}
          onChange={reload}
          empty="Nothing nominated yet. Tap ★ This week on anything in the inbox."
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
