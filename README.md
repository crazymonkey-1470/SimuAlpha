# True Adam Podcast: prep site

A private, shared newsroom for Freddy, Stew and Mike for the week between episodes. It has
topic tabs, saved articles with summaries and talking points, a "this week" pile, episode
planning, and comments. The producer fills it from the database side; the hosts browse,
add their own finds, comment, and mark items used.

The visual design (dark palette, Cormorant Garamond + IBM Plex Mono, dotted globe)
comes from the SimuAlpha design system.

```
frontend/              the site: Vite + React + supabase-js, static, mobile-first
supabase/migrations/   schema, RLS, seed topics: the contract the producer writes against
supabase/tests/        schema + RLS tests (run on plain Postgres via scripts/test-db.sh)
docs/PRODUCER.md       how to insert items, plus the exact table/column list
.github/workflows/     CI: DB tests + site build
```

## How it fits together

- **Database**: the dedicated Supabase project **`TrueAdamPodcast`** (ref `olzqrpbwayzqyvjeotvz`).
  RLS is on for every table, and the anon role gets nothing. Signed-in users only see data
  if their email is in `allowed_emails`. Hosts can't rewrite text they didn't add.
- **Producer**: writes with SQL (Supabase connector or SQL editor), which bypasses RLS.
  See [docs/PRODUCER.md](docs/PRODUCER.md).
- **Website**: a single-page app (static files on Cloudflare; all data read and written live in
  Supabase) using the *publishable* key only. It reads
  `VITE_TRUEADAM_SUPABASE_URL` / `VITE_TRUEADAM_SUPABASE_KEY` from `frontend/.env.production`.
  These names are deliberately distinct, so leftover `VITE_SUPABASE_*` variables on a host
  can't point the site at a different project. The build refuses `sb_secret_…` /
  `service_role` keys. Login is email + password; there's no SMTP, so no magic links.

## Deploy (Cloudflare Pages)

| Setting | Value |
|---|---|
| Root directory | `frontend` |
| Build command | `npm run build` |
| Build output | `dist` |
| Production branch | `main` |
| `NODE_VERSION` | `22` (Vite 8 needs Node ≥ 20.19) |

No other environment variables are needed. Routing is hash-based (`#/…`), so no SPA
rewrite rules are required.

## Live project status

- Migrations `20261106215937_init.sql` and `20261106232444_highlights_research.sql` are applied
  (filenames match the remote history, so `supabase db push` only applies future migrations).
- Auth: public sign-ups disabled, minimum password length 8.
- Crew access: insert into `allowed_emails`, then create users in Authentication → Users →
  Add user with **Auto Confirm User** ticked. See [docs/PRODUCER.md](docs/PRODUCER.md#crew-access).

## Local development

```bash
cd frontend
cp .env.example .env.local   # or rely on .env.production
npm install
npm run dev
```

## Tests

```bash
scripts/test-db.sh   # needs Postgres 15+ server binaries; runs on GitHub's ubuntu runners
```

This applies the migration to a throwaway Postgres (with a small Supabase stand-in) and
checks 100 behaviours: the allow-list, duplicate URLs, topic validation, anon lockout,
host vs. producer edit rights, attribution, highlights, the Grok research queue, and the views.

## Site map

| Route | What |
|---|---|
| `#/` | Globe hero with the next recording, **This week** pile (flags a missing fun fact or guest), latest inbox |
| `#/t/<slug>` | Topic tab: inbox + this week, used, archived, all |
| `#/i/<id>` | One item with comments (shareable link) |
| `#/add` | Add an item (article, video, note, fun fact, guest idea) |
| `#/episodes`, `#/e/<id>` | Episode ideas: attach items, checklist (date, guest, fun fact, 3+ discussion items), mark all used |
| `#/picks` | ★ Crew picks (most-starred first) and topic pitches |
| `#/research` | Grok research queue: ask, copy prompt for Grok, paste answers |
| `#/search/<q>` | Search titles, summaries, sources |
| `#/account` | Display name, password, sign out |
