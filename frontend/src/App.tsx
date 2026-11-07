import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configError, supabase } from './supabase';
import { AppContext, href, roman, useApp, useLoad, useRoute, type AppData } from './lib';
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
import Picks from './pages/Picks';
import Research from './pages/Research';
import { Armillary, HomeIcon, MenuIcon, MicIcon, PlusIcon, SearchIcon, StarIcon } from './components/Icons';

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

const TABS: { key: string; label: string; icon: ComponentType<{ size?: number }>; match: (string | undefined)[] }[] = [
  { key: '', label: 'Home', icon: HomeIcon, match: [undefined] },
  { key: 'picks', label: 'Picks', icon: StarIcon, match: ['picks'] },
  { key: 'add', label: 'Add', icon: PlusIcon, match: ['add'] },
  { key: 'research', label: 'Grok', icon: SearchIcon, match: ['research'] },
  { key: 'episodes', label: 'Episodes', icon: MicIcon, match: ['episodes', 'e'] },
];

function Layout() {
  const [head, arg] = useRoute();
  const tabHref = (key: string) => (key ? href(key) : '#/');
  return (
    <div className="shell">
      <header className="topbar">
        <a className="wordmark" href="#/" aria-label="True Adam, home">
          <Armillary />
          <span className="wordmark-text">
            <span className="wordmark-name">TRUE·ADAM</span>
            <span className="wordmark-sub">PREP ROOM</span>
          </span>
        </a>
        <nav className="mainnav" aria-label="Main">
          {TABS.map((t) => (
            <a
              key={t.key}
              href={tabHref(t.key)}
              className={(t.key === 'add' ? 'add ' : '') + (t.match.includes(head) ? 'active' : '')}
              aria-current={t.match.includes(head) ? 'page' : undefined}
            >
              {t.key === 'add' && <PlusIcon size={15} />}
              {t.label}
            </a>
          ))}
        </nav>
        <a href={href('account')} className={'account-link ' + (head === 'account' ? 'active' : '')} aria-label="Account">
          <MenuIcon />
        </a>
      </header>
      <TopicNav current={head === 't' ? arg : undefined} />
      <main className="content">
        <Page head={head} arg={arg} />
      </main>
      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <a
            key={t.key}
            href={tabHref(t.key)}
            className={(t.key === 'add' ? 'tab-add ' : '') + (t.match.includes(head) ? 'active' : '')}
            aria-current={t.match.includes(head) ? 'page' : undefined}
          >
            {t.key === 'add' ? (
              <span className="tab-add-box">
                <PlusIcon size={18} />
              </span>
            ) : (
              <t.icon size={23} />
            )}
            <span>{t.label}</span>
          </a>
        ))}
      </nav>
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
    case 'picks':
      return <Picks />;
    case 'research':
      return <Research />;
    default:
      return <p className="empty">Page not found.</p>;
  }
}

function TopicNav({ current }: { current?: string }) {
  const { topics } = useApp();
  return (
    <nav className="topics" aria-label="Topics">
      <h2 className="topics-head">Topics</h2>
      {topics.map((t, i) => (
        <a
          key={t.slug}
          href={href('t', t.slug)}
          className={t.slug === current ? 'active' : ''}
          aria-current={t.slug === current ? 'page' : undefined}
        >
          <span className="numeral" aria-hidden="true">
            {roman(i + 1)}
          </span>
          <span className="topic-name">{t.name}</span>
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
