-- Stickers, part 2 of 5: sticker definitions, their baked assets, the foil
-- ladder in combine_stickers(), and the `stickers` storage bucket.
--
-- Shape, and why:
--
-- * `kind` (deco | fandom) on the one `stickers` table rather than a table
--   per kind: inventory, placements, collections and combining all key on
--   `stickers.id` already, and both kinds flow through them identically.
--   A fandom sticker is the row `fandom-<fandoms.id>` with `fandom_id` set
--   (part 3 creates them on approval); a deco sticker has baked art.
-- * Deco art is three immutable WebPs baked once by concard-app's
--   `scripts/stickers/ingest.ts`: `full` (die-cut art), `mask` (the die-cut
--   silhouette the foil clips to) and `thumb` (drawer size). The columns
--   hold object paths in the `stickers` bucket, `<id>/<hash>-<kind>.webp`;
--   the hash is the content hash of the source + recipe, so a changed PNG
--   gets new objects and nothing is ever overwritten. `art_aspect` lets a
--   client size a sticker before its image has loaded.
-- * Paths, not absolute URLs: a client builds the public URL from its own
--   Supabase URL, and the objects never change, so a path is as permanent
--   as a URL without baking the project host into every row and snapshot.
-- * `glyph` and `rarity` exist in the web app's types and the original
--   init migration but not on the live table; they're added back (nullable
--   glyph, rarity defaulting to common) so both clients' code matches the
--   database again. `glyph` is legacy and goes once nothing reads it.
-- * Definitions are permanent. Snapshots and inventory point at them
--   forever, so deleting one is refused outright; `is_active = false`
--   retires a sticker from acquisition and nothing else.
-- * combine_stickers() climbs the full ladder via sticker_foil_next(), and
--   now requires two *available* copies (owned minus placed), so combining
--   can never consume a copy that's on a card. Live only checked the owned
--   quantity.
-- * Bucket `stickers`: public read (public bucket, served from
--   /object/public/), 1 MB WebP only, and no storage.objects policies at
--   all, so only the service role (the ingest script) can write.

-- definitions ---------------------------------------------------------------

alter table public.stickers
  add column if not exists kind public.sticker_kind not null default 'deco',
  add column if not exists glyph text,
  add column if not exists rarity public.sticker_rarity not null default 'common',
  add column if not exists full_path text,
  add column if not exists mask_path text,
  add column if not exists thumb_path text,
  add column if not exists art_aspect numeric(6,4),
  add column if not exists fandom_id text references public.fandoms (id);

alter table public.stickers
  add constraint stickers_kind_matches_id check ((kind = 'fandom') = (id like 'fandom-%')),
  add constraint stickers_fandom_link check ((kind = 'fandom') = (fandom_id is not null)),
  add constraint stickers_art_only_on_deco check (kind = 'deco' or full_path is null),
  add constraint stickers_art_complete check (
    (full_path is null) = (mask_path is null)
    and (full_path is null) = (thumb_path is null)
    and (full_path is null) = (art_aspect is null)
  ),
  -- `<id>/<16 hex>-<kind>.webp`, all three from one bake
  add constraint stickers_art_paths check (
    full_path is null or (
      split_part(full_path, '/', 1) = id
      and split_part(full_path, '/', 2) ~ '^[0-9a-f]{16}-full\.webp$'
      and mask_path = id || '/' || left(split_part(full_path, '/', 2), 16) || '-mask.webp'
      and thumb_path = id || '/' || left(split_part(full_path, '/', 2), 16) || '-thumb.webp'
    )
  ),
  add constraint stickers_art_aspect_range check (art_aspect is null or art_aspect between 0.2 and 5);

create unique index if not exists stickers_fandom_id_key on public.stickers (fandom_id)
  where fandom_id is not null;

create or replace function public.stickers_forbid_delete()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  raise exception 'sticker_definitions_are_permanent' using errcode = '23514',
    hint = 'Snapshots and inventories point at this sticker forever. Set is_active = false to retire it.';
end;
$$;

drop trigger if exists stickers_forbid_delete on public.stickers;
create trigger stickers_forbid_delete before delete on public.stickers
  for each row execute function public.stickers_forbid_delete();

revoke execute on function public.stickers_forbid_delete() from public, anon, authenticated;

-- the foil ladder -----------------------------------------------------------

create or replace function public.sticker_foil_next(p_foil public.sticker_foil)
returns public.sticker_foil
language sql
immutable
set search_path to ''
as $$
  select case p_foil
    when 'none' then 'glitter'
    when 'glitter' then 'holo'
    when 'holo' then 'cosmic'
    when 'cosmic' then 'mosaic'
  end::public.sticker_foil
$$;

create or replace function public.combine_stickers(p_sticker_id text, p_foil public.sticker_foil default 'none')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_owner uuid := auth.uid();
  v_next public.sticker_foil := public.sticker_foil_next(p_foil);
  v_spare int;
begin
  if v_owner is null then
    raise exception 'not_authenticated' using errcode = '28000', hint = 'Sign in to combine stickers.';
  end if;

  if v_next is null then
    raise exception 'max_tier' using errcode = 'P0001',
      hint = 'That sticker is already as shiny as it gets.';
  end if;

  -- serialise concurrent combines of the same pile so a double-tap can't spend one copy twice
  perform pg_advisory_xact_lock(hashtext(v_owner::text || ':' || p_sticker_id || ':' || p_foil::text));

  perform 1 from public.sticker_inventory
   where owner_id = v_owner and sticker_id = p_sticker_id and foil = p_foil
     for update;

  -- owned minus placed: a copy on a card is in use
  v_spare := public.sticker_available_count(v_owner, p_sticker_id, p_foil);
  if v_spare < 2 then
    raise exception 'not_enough_copies' using errcode = 'P0001',
      hint = 'You need two spare copies of the same sticker, at the same foil, to combine them.';
  end if;

  update public.sticker_inventory
     set quantity = quantity - 2
   where owner_id = v_owner and sticker_id = p_sticker_id and foil = p_foil;

  delete from public.sticker_inventory
   where owner_id = v_owner and sticker_id = p_sticker_id and foil = p_foil and quantity = 0;

  insert into public.sticker_inventory (owner_id, sticker_id, foil, quantity)
  values (v_owner, p_sticker_id, v_next, 1)
  on conflict (owner_id, sticker_id, foil)
  do update set quantity = public.sticker_inventory.quantity + 1;

  return jsonb_build_object('sticker_id', p_sticker_id, 'foil', v_next);
end;
$$;

revoke execute on function public.combine_stickers(text, public.sticker_foil) from public, anon;
grant execute on function public.combine_stickers(text, public.sticker_foil) to authenticated;

-- storage -------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stickers', 'stickers', true, 1048576, array['image/webp'])
on conflict (id) do nothing;
