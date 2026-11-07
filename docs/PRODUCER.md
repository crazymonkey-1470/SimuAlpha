# Producer guide: writing into the True Adam database

You write through SQL: the Supabase connector's `execute_sql`, or the SQL editor in the
dashboard. Both run as the `postgres` role, which **bypasses RLS**, so you need no
website login. Rows you insert this way are labelled **Producer** on the site.

- Project: **`TrueAdamPodcast`**, ref `olzqrpbwayzqyvjeotvz` (`https://olzqrpbwayzqyvjeotvz.supabase.co`). It's dedicated, not GovContractHunter.
- Schema source of truth: `supabase/migrations/20261106215937_init.sql`.
- The service_role / secret key never goes in the website. The site only uses the publishable (anon) key.

## Fastest path: `add_item(...)`

`add_item` inserts the item and its topics in one call and returns the new `id`. Pass only
the arguments you need, by name.

```sql
select add_item(
  title          => 'Survey: young men are returning to church faster than women',
  url            => 'https://www.example.com/2026/11/04/men-church',
  source         => 'Example News',
  published_at   => '2026-11-04',
  summary        => 'Two to five sentences in your own words.',
  talking_points => array[
    'Why would young men want more structure, not less?',
    'What did each of us see growing up?'
  ],
  quote          => 'Optional pull quote.',
  item_type      => 'article',        -- article | video | note | fun_fact | guest_idea | topic_idea
  status         => 'this_week',      -- inbox (default) | this_week | used | archived
  topics         => array['religion', 'news']
);
```

Fun fact. Items of type `fun_fact` get the `fun-facts` topic automatically:

```sql
select add_item(title => 'Octopuses have three hearts', summary => 'Two pump to the gills, one to the body.',
                item_type => 'fun_fact', status => 'this_week');
```

Guest idea. Items of type `guest_idea` get the `guests` topic automatically:

```sql
select add_item(title => 'Guest: pastor who runs a barbell gym ministry', item_type => 'guest_idea',
                guest_name => 'Name Here', why_them => 'Bridges faith and fitness.',
                contact_status => 'not_contacted', url => 'https://youtube.com/watch?v=...',
                topics => array['working-out', 'religion']);
```

Errors `add_item` raises:

| Problem | Error |
|---|---|
| URL already saved | `23505 Duplicate URL: already saved as "<title>" (status: <status>, id: <uuid>).` |
| Bad topic slug | `23503 Unknown topic slug(s): finance. Valid slugs: news, politics, ...` |
| URL without http(s):// | `23514 ... violates check constraint "items_url_check"` |
| Typo in a type or status | `22P02 invalid input value for enum item_type: "artcle"` |
| Blank title | `23514 ... violates check constraint "items_title_check"` |

Duplicate detection ignores `http`/`https`, `www.`/`m.`, trailing slashes, `#fragments`,
and tracking parameters (`utm_*`, `fbclid`, `gclid`, `si`, `smid`, ...). It also treats
`youtu.be/ID` and `youtube.com/watch?v=ID` as the same link. Before inserting, you can check:

```sql
select id, title, status from items where url_key = normalize_url('https://example.com/a?utm_source=x');
```

## Plain inserts (also fine)

```sql
with i as (
  insert into items (title, url, source, published_at, summary, talking_points, item_type)
  values ('Title', 'https://example.com/a', 'NYT', '2026-11-05', 'Summary.', array['Q1', 'Q2'], 'article')
  returning id
)
insert into item_topics (item_id, topic_slug)
select id, unnest(array['politics', 'economics']) from i;
```

A duplicate URL on a plain insert fails with
`duplicate key value violates unique constraint "items_url_unique"` / `Key (url_key)=(...) already exists.`
If you'd rather skip duplicates silently, add `on conflict (url_key) do nothing`.

## Everyday operations

```sql
-- What's nominated for the next recording
select title, item_type, topics, summary from this_week order by created_at desc;

-- Nominate / retire
update items set status = 'this_week' where id = '...';
update items set status = 'used'      where id = '...';

-- Leave a producer note on an item (shows as "Producer" on the site)
insert into comments (item_id, body) values ('...', 'Lead with this one.');

-- Add / remove a topic
insert into item_topics (item_id, topic_slug) values ('...', 'history') on conflict do nothing;
delete from item_topics where item_id = '...' and topic_slug = 'news';

-- Plan an episode and attach items
insert into episodes (title, recording_date) values ('Ep. 12: Men and church', '2026-11-12') returning id;
insert into item_episodes (item_id, episode_id) values ('<item id>', '<episode id>');

-- Items already used (so you don't resurface them)
select title, url, updated_at from items where status = 'used' order by updated_at desc;
```

## Tables and columns

Generated from the migrated schema. `*` = required, no default.

### `topics`
| column | type | notes |
|---|---|---|
| slug | text, PK | `news`, `politics`, `personal-finance`, `economics`, `religion`, `philosophy`, `history`, `working-out`, `dating-culture`, `science`, `literature`, `arts`, `pop-culture`, `music`, `movies` (includes MCU / comic-book films), `guests`, `fun-facts`, `motivation` (good news, comebacks, inspiring stories) |
| name | text * | tab label |
| sort_order | integer * | tab order |
| description | text | tagging guidance |

### `items`: one article, video, note, fun fact or guest idea
| column | type | notes |
|---|---|---|
| id | uuid | default `gen_random_uuid()` |
| title | text * | not blank |
| url | text | nullable; must start with `http://` or `https://`; unique after normalisation |
| url_key | text | **generated** from `url`; never insert it; unique constraint `items_url_unique` |
| source | text | NYT, YouTube, ... |
| published_at | date | `'2026-11-05'` (a full timestamp string is truncated to its date) |
| summary | text | your 2–5 sentences |
| talking_points | text[] | default `'{}'`; `array['Q1','Q2']` |
| quote | text | optional pull quote |
| item_type | `item_type` | default `article`; `article`, `video`, `note`, `fun_fact`, `guest_idea`, `topic_idea` (a pitch, usually no link) |
| status | `item_status` | default `inbox`; `inbox`, `this_week`, `used`, `archived` |
| guest_name | text | for `guest_idea` |
| why_them | text | for `guest_idea` |
| contact_status | `guest_contact_status` | `not_contacted`, `reached_out`, `confirmed`, `declined` |
| added_by | uuid → profiles | null when you insert via SQL; set automatically for website users |
| added_by_role | `member_role` | default `producer`; forced to the user's role for website inserts |
| created_at, updated_at | timestamptz | automatic |

### `item_topics`: many-to-many
| column | type | notes |
|---|---|---|
| item_id | uuid → items * | PK part; cascades on item delete |
| topic_slug | text → topics * | PK part |
| created_at | timestamptz | automatic |

### `episodes`
| column | type | notes |
|---|---|---|
| id | uuid | default |
| title | text * | |
| recording_date | date | |
| status | `episode_status` | default `planning`; `planning`, `recorded`, `published` |
| notes | text | |
| created_by | uuid → profiles | automatic for website users |
| created_at, updated_at | timestamptz | automatic |

### `item_episodes`
| column | type | notes |
|---|---|---|
| item_id | uuid → items * | PK part |
| episode_id | uuid → episodes * | PK part |
| added_by | uuid → profiles | automatic for website users |
| created_at | timestamptz | automatic |

### `comments`
| column | type | notes |
|---|---|---|
| id | uuid | default |
| item_id | uuid → items * | |
| author_id | uuid → profiles | null when you insert via SQL |
| author_role | `member_role` | default `producer` |
| body | text * | not blank |
| created_at, updated_at | timestamptz | automatic |

### `profiles`: one per crew member, maintained automatically
| column | type | notes |
|---|---|---|
| id | uuid → auth.users | PK |
| display_name | text * | users can rename themselves |
| role | `member_role` | `host` or `producer`; only changeable via SQL / `allowed_emails` |
| created_at, updated_at | timestamptz | automatic |

### `allowed_emails`: who can get in (SQL only; invisible to the site)
| column | type | notes |
|---|---|---|
| email | text, PK | lower-case |
| display_name | text * | initial display name |
| role | `member_role` | default `host` |
| created_at | timestamptz | automatic |

### `item_highlights`: a crew member's ★ on an item
| column | type | notes |
|---|---|---|
| item_id | uuid → items * | PK part; cascades |
| user_id | uuid → profiles | PK part; set from the session on the website |
| created_at | timestamptz | automatic |

### `research_requests`: jobs for the Grok bot
| column | type | notes |
|---|---|---|
| id | uuid | default |
| item_id | uuid → items | optional: the article it's about (cascades) |
| episode_id | uuid → episodes | optional |
| kind | `research_kind` | `deep_research` (default), `stats`, `fact_check`, `counterpoints`, `guest_lookup`, `other` |
| request | text * | what to find out |
| status | `research_status` | `open` (default), `in_progress`, `done`, `cancelled` |
| requested_by / requested_by_role | uuid → profiles / `member_role` | set automatically |
| response | text | the answer; setting it stamps `answered_at` and moves `open`/`in_progress` to `done` |
| sources | text[] | links backing the answer |
| answered_by | text | label shown on the site, e.g. `Grok` |
| answered_at, created_at, updated_at | timestamptz | automatic |

### Views (read-only, respect RLS)
- `item_cards`: every `items` column plus `topics text[]` (in tab order), `episode_ids uuid[]`, `comment_count int`, `added_by_name text`, `highlighted_by uuid[]`, `highlight_count int`, `research_open int`, `research_done int`.
- `this_week`: `item_cards` filtered to `status = 'this_week'`.
- `research_queue`: open / in-progress research requests with the article's title, url, source, summary and talking points.

### Functions
- `add_item(...)` → `uuid` (above).
- `answer_research(request_id, response, sources default '{}', answered_by default 'Grok')`: answers and closes a request.
- `normalize_url(text)` → `text`, the duplicate-detection key.

## Grok research queue

The crew leaves Grok jobs on the site: on an article (🔎 Grok) or from the Grok tab.
Answers show up on the Grok tab and under the article.

**If Grok (or any agent) has database access**, it works the queue in two calls:

```sql
-- 1. What's waiting (oldest first), with the article context
select id, kind, request, requested_by_name, item_title, item_url, item_summary from research_queue;

-- optional: claim it so the crew sees it's being worked on
update research_requests set status = 'in_progress' where id = '...';

-- 2. Answer it (closes the request; shows on the site labelled "Grok")
select answer_research(
  '...request id...',
  'Concise answer with the key numbers. 2-6 sentences.',
  array['https://source-1', 'https://source-2']
);
```

Errors: an unknown id raises `No research request with id …`; an empty answer is rejected.

**If Grok has no database access**, the crew uses the site: **Copy for Grok** puts a
ready-made prompt (request + article context) on the clipboard, then they paste Grok's reply
with **Paste answer** (tick "This answer came from Grok").

To see what the hosts care about: `select title, highlight_count from item_cards where highlight_count > 0 order by highlight_count desc;`

## Source inbox: filter before reading (saves Grok tokens)

The database collects headlines on its own, so Grok doesn't have to search the web every time.

- **Fetching:** news feeds, YouTube channels and podcasts, listed and managed on the site's
  **Feed → Sources** page. The **Railway worker** (see `docs/RAILWAY.md`) pulls everything
  every 20 minutes. If it stops, the database's own fetcher (`pg_cron` + `pg_net`) takes over.
  It keeps the headline, date, link, a ≤400-character preview and, for videos and episodes,
  the thumbnail, duration, views, audio link and transcript link. It never keeps full
  articles. Headlines nobody acted on are kept up to `ingest_state.keep_days` (365), capped at
  `ingest_state.max_headlines` (150,000, about 255 MB; the oldest go first). Expect about 75 MB a
  month, so on Supabase Free (500 MB) the cap keeps roughly 3–4 months. On Pro, run
  `update ingest_state set max_headlines = 600000 where id;` for a full year. Prep-room items,
  headlines with crew votes, Grok's reads and memories are never pruned.
- **Archive search:** the Feed and `source_inbox` show the last 62 days. Search everything older
  with `select * from search_headlines('fatherhood survey', since => '2026-06-01', topic => 'dating-culture');`.
  Every word must appear in the title. Use it to check whether a story was covered before, or how
  coverage changed over time.
- **Month backfill:** each source is backfilled once with its last 31 days. New sources are
  backfilled automatically on their first run, about a dozen sources per worker run.
  WordPress-style sites are paged back (`?paged=2…`). Everything else goes through Google News
  search for that site, one week at a time. `feeds.backfilled_at` records when it happened; set
  it to null (or tap **Backfill the last month again** on the Sources page) to redo it.
- **Categorisation:** every headline is filed by its words (`topic_terms`), on top of its feed's
  topics, with at most three detected topics. For general news feeds (topic `news`) the detected
  topic comes first, so `topics[1]` is the real subject: the digest and the Feed's topic filter
  use it. Specialised feeds keep their own topic first.
- **Junk filter:** headlines matching `entry_filters` (shopping deals, gift guides, stock-quote
  pages) are not stored.
- **Duplicates:** the same link (ignoring tracking parameters) is stored once. The same
  story from different outlets is grouped into one story with an outlet count; more
  outlets is a signal that it matters.
- **Crew buttons** (Feed tab): **Discuss this** puts the story in the prep-room inbox.
  **More like this** and **Not interested** (with an optional reason) teach Grok what to pick.

### Grok's cheap loop

```sql
-- 1. One compact call. Default: last 3 days, top 4 per topic (≈4–5k tokens).
select producer_digest();
--    Narrower and cheaper (≈600 tokens for two topics):
select producer_digest(days => 1, per_topic => 3, only_topics => array['religion', 'dating-culture']);
--    Returns: topics.{slug}: [{title, url, type? (video|podcast), min?, views?, src, date, outlets?, preview,
--                              discuss?, more?, not?, read?}],
--             this_week, covered (used in the last 45 days), episodes, hosts[{name, likes, more_like, not_interested[{title, why}]}]

-- 2. Shortlist from titles, previews, outlet counts and votes. Skip stories marked read.
--    Stories already in the prep room are left out of the digest.

-- 3. Before reading an article, check the read-once store:
select * from get_read('<url>');                    -- returns a row if it was read in the last 30 days
select * from get_read('<url>', interval '7 days'); -- stricter freshness for fast-moving news

-- 4. Read only the 2–3 strongest candidates in depth, then save the verified read:
select save_read('<url>', '<2-4 sentence verified summary>',
                 array['<key point>', '<key number>'], array['<source url>'], 'solid', '<title>');
--    verdict: free text, e.g. solid / thin / misleading / paywalled

-- 5. Promote winners: the crew taps "Discuss this", or
select add_item(title => '...', url => '...', source => '...', summary => '...', talking_points => array['...'],
                topics => array['religion']);
```

| Table / view | What it holds |
|---|---|
| `feeds` | `name`, `url`, `topics`, `active`, `last_fetched_at`, `last_status`, `last_error`, `last_new_count` |
| `feed_entries` | one headline: `title`, `url`, `published_at`, `preview`, `topics`, `story_id` (shared by outlets covering the same story), `item_id` (once it's in the prep room), `media_type` (article/video/podcast), `media_url`, `thumbnail_url`, `duration_seconds`, `views`, `transcript_url` |
| `source_feedback` | `member_id`, `entry_id`, `kind` (`discuss`, `more_like_this`, `not_interested`), `reason` |
| `article_reads` | read-once store keyed by normalised URL: `summary`, `key_points`, `sources`, `verdict`, `checked_at` |
| `source_inbox` (view) | one row per story: lead headline, `outlets`, `outlet_count`, vote counts, `my_feedback`, `in_prep`, `read`, `read_summary` |

Tune the categorisation by SQL. Terms are lower-case regex fragments matched as whole words:

```sql
insert into topic_terms (topic, term) values ('religion', 'lent'), ('working-out', 'barbells?');
delete from topic_terms where topic = 'fun-facts' and term = 'weird';
select reclassify_entries();              -- re-file every stored headline with the new lists
select classify_topics('Pope Leo visits Uruguay');   -- test a headline: {religion}
insert into entry_filters (pattern, note) values ('\msponsored\M', 'ads');   -- never store these
```

Add a source by SQL with `insert into feeds (name, url, topics) values ('Name', 'https://…/feed', '{history}');`.
Run `select refresh_feeds();` to fetch everything now. Feed errors show on the Sources page
and in `feeds.last_error`.

The newsroom mix runs left to right on purpose (Fox News, CNN, AP, Reuters, WSJ, BBC, ABC, CBS, NBC,
PBS, NPR, Christian Science Monitor, The Hill, Axios, NewsNation, The Free Press, Politico), so
`outlets` on a story shows who did and didn't cover it. Use that as a quick check: a story only
one side covers is worth a second source before it goes in the prep room.
Outlets without a working RSS feed (CNN, AP, Reuters, WSJ) come through Google News filtered to
their site: `https://news.google.com/rss/search?q=site:cnn.com+when:1d&hl=en-US&gl=US&ceid=US:en`.
Their links open via news.google.com. For podcast takeaways, Podcast Notes and Tim Ferriss's
show notes and transcripts are in `guests` and `motivation`. Good-news and comeback stories are
in `motivation`.

## Quote of the show

Every episode carries one motivational quote, used as the **opener** (wisdom to start the
conversation) or the **closer** (send-off). A new episode automatically gets the least-used
verified quote from the bank. The crew can swap it, choose another (Episodes → Quote bank) or flip
opener and closer. The digest's `episodes` list shows each one's `quote` and `quote_role`, or
`needs_quote: true`.

```sql
-- Add a quote (and optionally put it on an episode as the opener or closer):
select add_quote(quote => 'Watch ye, stand fast in the faith, quit you like men, be strong.',
                 author => '1 Corinthians 16:13', source => 'King James Version (1611)',
                 context => 'Paul''s closing charge to the church at Corinth.',
                 questions => array['What does "act like men" mean today?'],
                 topics => array['religion', 'motivation'], verified => true,
                 episode_id => '<episode id>', role => 'opener');
select swap_quote('<episode id>');         -- give an episode a different quote
select * from quote_cards order by used_count, author;   -- the bank, least used first
```

**Accuracy rule.** Set `verified => true` only when the exact wording and the attribution were
checked against a primary source, and cite it in `source`: book and chapter, speech and date, or
verse and translation. Many famous quotes are misattributed. For example, "We are what we
repeatedly do" is Will Durant summarising Aristotle, not Aristotle. When unsure, leave
`verified` false; the site then labels the quote "Attribution not verified". Prefer
public-domain wording, such as the KJV and older translations, over modern copyrighted
translations. Write two short questions that connect the quote to the episode's topics.

## Grok's memory (second brain)

Grok doesn't learn on its own; it only knows what it's given. Its long-term memory lives in
this database, so it carries over between sessions and survives switching bots.

| What | Where | Notes |
|---|---|---|
| Distilled memories | `memories` | `kind`: `preference`, `fact`, `event`, `instruction` (how to work), `reflection` (insight). About a crew member (`about_member`), a topic, an item, an episode, an outside person/thing (`about_entity`), or the whole show (all empty). `importance` 1–10, `confidence` 0–1, `pinned` = always included. |
| Conversation history | `conversations`, `conversation_messages` | Raw long-context log of talks with Grok on any channel; full-text searchable. |
| Ranked lookup | `recall()` | Keyword + typo-tolerant match, weighted by importance, recency (~60-day half-life), confirmations and pins. |
| One-call context | `member_briefing(member)`, `show_briefing()` | Everything to read before answering. |

Memories are never silently overwritten. A near-duplicate **reinforces** the existing one
(it raises the count, importance and confidence). A correction **retires** the old memory
(`invalid_at`, `superseded_by`) and keeps it for history. Privacy: memories about a person
are visible on the site only to that person and producers. Show and topic memories are
visible to the whole crew. Everyone can see and edit what Grok knows about them under
**☰ Account**.

### Grok's loop (with database access)

```sql
-- BEFORE answering a research request (research_queue has requested_by):
select show_briefing();                              -- house rules, crew, recent episodes, what's been covered
select member_briefing('<requested_by uuid>');       -- their pinned notes, likes, instructions, favorite topics,
                                                     -- recent stars / requests / conversations
select * from recall('<keywords from the request>', about_member => '<uuid>');   -- anything else relevant

-- ... answer it ...
select answer_research('<request id>', '<answer>', array['<source url>']);

-- AFTER: store what you learned (duplicates are merged automatically)
select remember('Stew wants the original study, not news coverage.', 'preference',
                about_member => '<uuid>', importance => 7, source_research => '<request id>');
select remember('Episode 14 covered fasting; the crew wants a follow-up on Lent.', 'event', importance => 6);
select remember('Never use Wikipedia as a primary source.', 'instruction', pinned => true, importance => 9);

-- Correct or retire
select revise_memory('<memory id>', 'Mike now prefers short answers.', 'he said so on 2026-11-07');
select forget('<memory id>', 'no longer true');

-- Keep the raw conversation (long context), then search it later
select log_conversation('[{"role":"user","content":"…"},{"role":"assistant","content":"…"}]'::jsonb,
                        member_id => '<uuid>', title => 'Fasting follow-up', summary => 'One-line summary');
select * from search_conversations('fasting lent', member_id => '<uuid>');
```

Good habits for the bot: one fact per memory, written so it makes sense on its own. Use
`importance` 8–10 only for things that should shape most answers. Once a week, write a
`reflection` that sums up patterns (e.g. "The crew's strongest episodes mix history with
personal stories").

### Without database access

**Copy for Grok** already includes the house rules and what Grok knows about the person
who asked, and asks Grok to list anything it **LEARNED**. When pasting the answer, put
those lines in **"What did Grok learn about …?"** and they're saved to memory. Anyone can
also add notes under ☰ Account or the **Grok → Memory** tab.

### Not built yet (possible next step)

Meaning-based (vector) search, which matches "fatherhood" to "being a dad". The live
project supports pgvector. It needs an embedding source: a Supabase Edge Function with a
built-in small model, or an API key. Until then, recall uses keywords plus fuzzy matching,
which is plenty for a few thousand memories.

## Crew access

A person can see the site only when **both** of these are true:

1. Their email is in `allowed_emails`.
2. They have a confirmed Supabase Auth user with that email.

Order doesn't matter: the profile is created as soon as both exist.

```sql
insert into allowed_emails (email, display_name, role) values
  ('freddy@...', 'Freddy', 'host'),
  ('stew@...',   'Stew',   'host'),
  ('mike@...',   'Mike',   'host');
```

Then in the dashboard: **Authentication → Users → Add user → Create new user**. Enter the
email and a temporary password, and tick **Auto Confirm User**. Send each host their
password; they can change it under ☰ on the site.

- Remove access: `delete from allowed_emails where email = '...';` takes effect immediately. Their items and comments stay.
- Make someone a producer: `update allowed_emails set role = 'producer' where email = '...';`
- Reset a password from SQL:
  `update auth.users set encrypted_password = extensions.crypt('new-temp-password', extensions.gen_salt('bf')) where email = '...';`

## What website users can do (enforced by RLS)

| | Hosts | Producer login | You via SQL |
|---|---|---|---|
| Read everything (except `allowed_emails`) | ✓ | ✓ | ✓ |
| Add items, comments, episodes | ✓ | ✓ | ✓ |
| Change any item's status / guest contact status, tag it, attach it to episodes | ✓ | ✓ | ✓ |
| Edit an item's text (title, summary, talking points, ...) | own items only | all | all |
| Delete items | own only | all | all |
| Edit / delete comments | own only | delete any | all |
| Star items (★) | as themselves | as themselves | any |
| Ask Grok, answer or update research | ✓ | ✓ | ✓ |
| Delete research requests | own only | all | all |
| Change roles / allow-list | ✗ | ✗ | ✓ |
