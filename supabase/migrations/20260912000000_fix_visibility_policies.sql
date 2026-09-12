-- Fix: creating a card (or placing a sticker) failed with
-- "new row violates row-level security policy".
--
-- The SELECT policies used card_is_visible(), a STABLE security-definer
-- function that queries the cards table. Postgres evaluates a STABLE function
-- with the calling statement's snapshot, in which the row being inserted does
-- not exist yet, so INSERT ... RETURNING (which supabase-js uses for
-- .insert().select()) failed the visibility check on the brand-new row.
-- Express the same rule inline instead: the row's own owner_id is visible to
-- the check, and profiles is a different table.

drop policy "cards on display are public" on public.cards;
create policy "cards on display are public" on public.cards
  for select using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.profiles p
       where p.id = cards.owner_id and p.active_card_id = cards.id
    )
  );

drop policy "placements visible with card" on public.sticker_placements;
create policy "placements visible with card" on public.sticker_placements
  for select using (
    exists (
      select 1 from public.cards c
       where c.id = sticker_placements.card_id
         and (
           c.owner_id = auth.uid()
           or exists (
             select 1 from public.profiles p
              where p.id = c.owner_id and p.active_card_id = c.id
           )
         )
    )
  );

drop function public.card_is_visible(uuid);
