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
  item_type      => 'article',        -- article | video | note | fun_fact | guest_idea
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
| slug | text, PK | `news`, `politics`, `personal-finance`, `economics`, `religion`, `philosophy`, `history`, `working-out`, `dating-culture`, `science`, `literature`, `arts`, `pop-culture`, `music`, `movies` (includes MCU / comic-book films), `guests`, `fun-facts` |
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
| item_type | `item_type` | default `article`; `article`, `video`, `note`, `fun_fact`, `guest_idea` |
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

### Views (read-only, respect RLS)
- `item_cards`: every `items` column plus `topics text[]` (in tab order), `episode_ids uuid[]`, `comment_count int`, `added_by_name text`.
- `this_week`: `item_cards` filtered to `status = 'this_week'`.

### Functions
- `add_item(...)` → `uuid` (above).
- `normalize_url(text)` → `text`, the duplicate-detection key.

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
| Change roles / allow-list | ✗ | ✗ | ✓ |
