# concard design notes

A trading-card themed social app for cons and events. You _are_ the card: each
person has one QR code that links to `concard.me/<username>`, where their card
on display and their social links live. Meeting someone means scanning each
other. Collecting is the incentive to actually talk to people in the room.

This document records the product decisions made so far and how the code maps
onto them. Update it when a decision changes.

## Decisions

| Topic             | Decision                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform          | Web app, installable as a PWA. The QR code is a plain URL, so any camera app can open a profile; the in-app scanner exists because iOS gives the installed PWA a separate cookie jar from Safari.                                                                                                                                                                                                                          |
| Stack             | SvelteKit (Svelte 5, TypeScript, Tailwind v4) + Supabase (Postgres, Auth, Storage). pnpm.                                                                                                                                                                                                                                                                                                                                  |
| Identity          | One username per user, lowercase `[a-z0-9_]`, 3–20 chars, immutable, never a reserved route word. The QR encodes `<origin>/<username>` and never changes.                                                                                                                                                                                                                                                                  |
| Cards             | A user owns many cards; exactly one is on display (`profiles.active_card_id`). The first card created goes on display automatically. Cards are built from templates plus title, type line, flavor text, one art image and three colours.                                                                                                                                                                                   |
| Card back         | Your own card's back shows your QR code. A collected card's back shows collection notes (who, when, event, whether it was a mutual trade) and **no QR**, so cards can't be re-scanned remotely.                                                                                                                                                                                                                            |
| Collecting        | Scan → profile page → Collect. Done server-side by `collect_card()`. One collect per (collector, owner) per **72 hours**, regardless of which card is on display, so swapping cards can't be farmed. The events feature will later scope this window to the event itself. You can't collect yourself, or someone with no card on display.                                                                                  |
| Trades            | A trade is simply two collects pointing at each other. No pairing session, so it works on con-hall wifi. The binder marks these as mutual.                                                                                                                                                                                                                                                                                 |
| Binder            | Shows a frozen **snapshot** of the card as it was when collected, in miniature. The snapshot is JSON on the collection row so it survives edits and deletions.                                                                                                                                                                                                                                                             |
| Stickers          | Cosmetic. Placed on cards with position/rotation/scale. Whoever collects a card gets a **copy** of one random sticker from it; the owner keeps theirs. Everyone starts with a few. Some are drop-only, some will be purchasable (cosmetics only, all obtainable for free too).                                                                                                                                             |
| Sticker inventory | Owning N copies lets you place N at once across all your cards. Placing consumes a copy; removing returns it. Enforced by a trigger.                                                                                                                                                                                                                                                                                       |
| Fandom badge      | Placed on the card like a sticker rather than fixed into the footer: pick one from a tray, then drag it. `cards.affiliation_x/y` hold the position, defaulting to the footer corner the badge always occupied, so existing cards are unchanged. The snapshot carries the position; snapshots written before it read back at that same default. Still one badge per card — the deco/fandom sticker split is a later change. |
| Events            | Not in v1. `collections.event_id` is reserved. Idea for later: a per-event global chat to find other players.                                                                                                                                                                                                                                                                                                              |
| Social            | Friends and DMs are deliberately out of v1: the point is talking in person.                                                                                                                                                                                                                                                                                                                                                |
| Auth              | Email + password for now (Supabase Auth). Magic links and OAuth can be added without schema changes.                                                                                                                                                                                                                                                                                                                       |
| Domain            | `concard.me`, not yet registered. `PUBLIC_SITE_URL` controls what the QR encodes.                                                                                                                                                                                                                                                                                                                                          |

## v1 scope

Sign up → pick username → make a card (template, text, colours, art, stickers)
→ show QR (flip your card) → scan others → collect, get a bonus sticker →
browse binder → edit profile links.

Out of v1: events, chat, friends, purchases, native apps.

## The card

`src/lib/components/CardShell.svelte` draws the frame band, inset face,
silhouette clip and the effect layers from a `CardStyle`: a holo wash, a faint
smooth specular for volume, a glitter layer (a holo tint revealed
through a fixed grain texture, only inside the light spot, so the light moves
over the glitter rather than the glitter moving), and an inner edge. A
parallax version, where the flecks drift with tilt, was tried and shelved: it
read as depth rather than surface. It may return for holographic stickers. `Card.svelte` puts the face content and the sticker overlay in
it; `CardBack.svelte` puts the QR or the collector's record in it.
`FlipCard.svelte` owns pointer tilt and tap-to-flip and passes `rx`/`ry` down
so the light can never desync from the card. Tokens live in
`src/lib/card-style.ts`. Everything is sized in `cqw` off the container, and
below 180px the card drops its bio and chips so binder thumbnails stay legible.

`/dev/cards` is a dev-server-only gallery of every combination on fixture data.

## The app around the card

The chrome exists to display the card, so it follows the card's logic rather
than a separate one. Tokens live in `src/routes/layout.css`.

- **Neutral, not blue and not brown.** The darks are the card's own dark family
  from `card-style.ts`: its ink (`#17161b`), its slate background and the
  hatches tuned against it — a graphite with a faint violet lean. A blue slate
  fights the warm card faces; a brown competes with them. Neutral chrome leaves
  the cards as the only warm thing on screen, which is what makes them read as
  the lit object. The ground (`#121116`) sits one step below the card's ink on
  purpose: the card back is drawn in that ink, so a flipped card still has to
  lift off the page rather than merge into it. Dark stays throughout, because it
  makes the cards the brightest thing on screen.
- **The accent is the card's holo frame** (`FRAMES.holo`), the most distinctive
  material the card has. `--holo` is the gradient itself, used for the wordmark
  and the primary action; `--color-holo` is the solid drawn out of it, for the
  borders, rings, icons and small labels a gradient cannot carry legibly. The
  text version sweeps nearly horizontally and shrink-wraps its box, or a line of
  type samples one stop and reads as a flat tint.
- **The type is the card's own type carried outward.** Fredoka for display
  (`display`), Space Mono for labels and small caps (`meta`), Archivo for body.
  Both halves of the app now speak the same language.
- **Panels are stock, not glass**: a flat raised surface with a real hairline.
- **Fonts are self-hosted** via `@fontsource`, not fetched from Google. A con
  hall is exactly where a third-party font request fails. They bundle under
  `client/`, which the service worker already precaches, so type survives
  offline.

Signed in, the home page is a dashboard: your card on display, then the cards
you most recently collected, linking through to the binder. Signed out it shows
a live, tiltable card built from `src/lib/demo-card.ts` — the same fixture the
`/dev/cards` gallery uses — rather than describing the product in prose.

## Data model

See the migrations in `supabase/migrations/`; they're commented. Summary:

```
profiles ──< cards ──< sticker_placements >── stickers
   │  └ active_card_id ─┘   └ affiliation ──> fandoms
   ├──< sticker_inventory ───────────────────────┘
   └──< collections (collector_id, owner_id, card_snapshot jsonb, bonus_sticker_id)
reserved_usernames
```

Snapshots are versioned. `collect_card()` writes version 2 (style, fandom,
owner links, stickers). `snapshotToView` maps version 1 rows forward to the
default look so old binders keep working and never change appearance twice.

Everything is behind row-level security:

- Profiles, templates, stickers, and cards **on display** are public. Other
  cards are visible only to their owner.
- Inventory is private. Collections are visible to collector and owner.
- Inventory and collections are written only by `security definer` functions;
  clients can't insert a collection or grant themselves stickers.

## Key flows in code

| Flow                                                            | Where                                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Session handling, route protection, onboarding redirect         | `src/hooks.server.ts`                                                           |
| Sign in / up, email link landing                                | `src/routes/login`, `src/routes/auth/callback`                                  |
| Username claim with live availability check                     | `src/routes/onboarding`                                                         |
| Your card, QR back, card list, stats                            | `src/routes/me`                                                                 |
| Card editor (text, template, colours, art upload, sticker drag) | `src/routes/me/cards/[id]`                                                      |
| Public profile + Collect action                                 | `src/routes/[username=username]`                                                |
| Camera scanner (jsQR)                                           | `src/routes/scan`                                                               |
| Binder grid and card detail with notes back                     | `src/routes/binder`                                                             |
| One component renders live cards and snapshots                  | `src/lib/components/Card.svelte` via the `CardView` shape in `src/lib/types.ts` |

## Open questions

- Should a collected card show the owner's _current_ display name/username in
  the binder, or the snapshot's? (Currently: snapshot on the card, live link
  underneath.)
- Sticker rarity weighting for the bonus pick: uniform over placed stickers
  for now. Weight by rarity later?
- Fandom list: eight curated to start. User-suggestable brings moderation.
- Should the holo frame be earned rather than picked? It is visibly the best.
- Sticker upgrades: collecting duplicates of a sticker could upgrade it to a
  holographic, parallax-glitter version, making duplicates worth something and
  giving rarity a visible tier. Later.
- Rate limiting account creation to stop sticker farming via alt accounts.
- Card art moderation / reporting before launch.
