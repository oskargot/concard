# concard

A trading card themed social app for cons and events. Make a card for
yourself, flip it to show your QR code, collect everyone you meet, and pick up
a sticker from each card you grab.

Product and architecture notes live in [`docs/DESIGN.md`](docs/DESIGN.md).

## Stack

- [SvelteKit](https://svelte.dev/docs/kit) with Svelte 5, TypeScript and Tailwind v4, shipped as a PWA
- [Supabase](https://supabase.com) for Postgres, Auth and Storage
- pnpm

## Getting started

1. Install dependencies

   ```sh
   pnpm install
   ```

2. Create a Supabase project and apply the schema. Either paste the files in
   `supabase/migrations/` into the SQL editor in order, or with the CLI:

   ```sh
   supabase init          # once, creates supabase/config.toml
   supabase link --project-ref <your-ref>
   supabase db push
   ```

   In the Supabase dashboard, add `http://localhost:5173/auth/callback` (and
   your production URL) to **Authentication → URL Configuration → Redirect URLs**.

3. Configure the app

   ```sh
   cp .env.example .env
   # fill in PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY
   ```

4. Run it

   ```sh
   pnpm dev
   ```

   Open http://localhost:5173, create an account, pick a username, make a card.
   To test collecting, sign up a second account in a private window and visit
   the first account's `/<username>` page.

## Scripts

| Command                       | What it does                                                                                                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                    | Dev server                                                                                                                                                                              |
| `pnpm build` / `pnpm preview` | Production build and local preview                                                                                                                                                      |
| `pnpm check`                  | Svelte + TypeScript type check                                                                                                                                                          |
| `pnpm lint` / `pnpm format`   | Prettier + ESLint                                                                                                                                                                       |
| `pnpm test`                   | Unit tests (Vitest)                                                                                                                                                                     |
| `pnpm db:test`                | Applies the migrations to a scratch Postgres and runs `supabase/dev/test_schema.sql`. Needs a local Postgres reachable via the usual `PG*` variables. Not for a real Supabase database. |
| `pnpm icons`                  | Regenerates `static/icons/*.png` from `static/icon.svg`                                                                                                                                 |

## Layout

```
supabase/migrations/   schema, RLS policies, collect_card() and friends
supabase/dev/          fake auth schema + SQL tests for local Postgres
src/lib/components/    Card, CardBack, FlipCard, Nav
src/lib/               card view helpers, collect error mapping, username rules
src/routes/            pages: /, /login, /onboarding, /me, /me/cards/[id], /binder, /scan, /[username]
```
