import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configError, supabase } from './supabase';
import { AppContext, href, useApp, useLoad, useRoute, type AppData } from './lib';
import type { Episode, Profile, Topic } from './types';
import Login from './pages/Login';
import Home from './pages/Home';
import TopicPage from './pages/TopicPage';
import ItemPage from './pages/ItemPage';
import ItemForm from './pages/ItemForm';
import Episodes from './pages/Episodes';
import EpisodePage from './pages/EpisodePage';
import Account from './pages/Account';
import Search from './pages/Search';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (configError) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (configError) return <Centered title="Not configured">{configError}</Centered>;
  if (session === undefined) return <Centered title="Loading…" />;
  if (!session) return <Login />;
  return <SignedIn key={session.user.id} session={session} />;
}

function SignedIn({ session }: { session: Session }) {
  const uid = session.user.id;
  const profiles = useLoad(() => supabase.from('profiles').select('id, display_name, role'), []);
  const topics = useLoad(() => supabase.from('topics').select('*').order('sort_order'), []);
  const episodes = useLoad(
    () => supabase.from('episodes').select('*').order('recording_date', { ascending: true, nullsFirst: false }),
    [],
  );

  const profileMap = useMemo(
    () => new Map(((profiles.data ?? []) as Profile[]).map((p) => [p.id, p])),
    [profiles.data],
  );
  const me = profileMap.get(uid);

  const value: AppData | null = me
    ? {
        session,
        me,
        topics: (topics.data ?? []) as Topic[],
        profiles: profileMap,
        episodes: (episodes.data ?? []) as Episode[],
        reloadEpisodes: episodes.reload,
        reloadProfiles: profiles.reload,
      }
    : null;

  if (profiles.loading && !profiles.data) return <Centered title="Loading…" />;
  if (profiles.error) return <Centered title="Couldn’t load your profile">{profiles.error}</Centered>;
  if (!value) {
    return (
      <Centered title="You’re not on the crew list yet">
        <p>
          Signed in as <b>{session.user.email}</b>, but this email isn’t on the True Adam allow-list.
          Ask the producer to add it, then reload.
        </p>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </Centered>
    );
  }

  return (
    <AppContext.Provider value={value}>
      <Layout />
    </AppContext.Provider>
  );
}

function Layout() {
  const [head, arg] = useRoute();
  return (
    <div className="shell">
      <header className="topbar">
        <a className="wordmark" href="#/">
          True<em>Adam</em>
        </a>
        <nav className="mainnav">
          <a href="#/" className={!head ? 'active' : ''}>This week</a>
          <a href={href('episodes')} className={head === 'episodes' || head === 'e' ? 'active' : ''}>Episodes</a>
          <a href={href('add')} className={'add ' + (head === 'add' ? 'active' : '')}>+ Add</a>
          <a href={href('account')} className={head === 'account' ? 'active' : ''} aria-label="Account">☰</a>
        </nav>
      </header>
      <TopicNav current={head === 't' ? arg : undefined} />
      <main className="content">
        <Page head={head} arg={arg} />
      </main>
    </div>
  );
}

function Page({ head, arg }: { head?: string; arg?: string }) {
  switch (head) {
    case undefined:
      return <Home />;
    case 't':
      return <TopicPage key={arg} slug={arg ?? ''} />;
    case 'i':
      return <ItemPage key={arg} id={arg ?? ''} />;
    case 'add':
      return <ItemForm key={'new-' + (arg ?? '')} defaultTopic={arg} />;
    case 'edit':
      return <ItemForm key={arg} id={arg} />;
    case 'episodes':
      return <Episodes />;
    case 'e':
      return <EpisodePage key={arg} id={arg ?? ''} />;
    case 'account':
      return <Account />;
    case 'search':
      return <Search key={arg} q={arg ?? ''} />;
    default:
      return <p className="empty">Page not found.</p>;
  }
}

function TopicNav({ current }: { current?: string }) {
  const { topics } = useApp();
  return (
    <nav className="topics" aria-label="Topics">
      {topics.map((t) => (
        <a key={t.slug} href={href('t', t.slug)} className={t.slug === current ? 'active' : ''}>
          {t.name}
        </a>
      ))}
    </nav>
  );
}

function Centered({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="centered">
      <h1>{title}</h1>
      {children}
    </div>
  );
}
