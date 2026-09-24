-- Stickers, part 4 of 5: placement rules, and the affiliation becomes a sticker.
--
-- Placement rules, enforced here and not only in the editors:
-- * At most max_stickers_per_card() = 20 stickers on a card (the free
--   affiliation included). Checked on insert under a lock on the card row,
--   so two devices placing at once can't both slip in at 20.
-- * scale 0.5–2 of the sticker's base size (was 0.25–3). The one live row
--   outside that (2.09) is clamped first.
-- * x / y are the sticker's centre as 0..1 of the card (both clients already
--   draw them as centres), so a centre can never leave the card. Stickers may
--   still hang past the edge. Was −0.14..1.02 / −0.10..0.96.
-- * `size` (base width as a fraction of card width) is null on older rows,
--   which draw at the old 15.33% base; the app writes 0.24 for new stickers.
--   Bounded to 0.05–0.5 so nothing enormous can be stored.
-- * z_index ≥ 0.
--
-- The affiliation: choosing your fandom used to be three columns on `cards`
-- (`affiliation`, `affiliation_x`, `affiliation_y`). It becomes a placement
-- of that fandom's sticker flagged `is_affiliation`: free (it doesn't use an
-- inventory copy; sticker_available_count() skips it), always foil `none`,
-- at most one per card, and it can be moved, scaled and rotated like any
-- other sticker. Existing affiliations are copied into placements below.
--
-- The old columns stay until the web app stops reading them, so for now the
-- two are kept in step both ways by triggers: set `cards.affiliation*` (the
-- web editor, or the app's picker) and the placement follows; move or remove
-- the placement (the app) and the columns follow. pg_trigger_depth() stops
-- each side re-triggering the other. Drop the columns and both triggers in a
-- later migration once no client reads them.

create or replace function public.max_stickers_per_card()
returns int
language sql
immutable
set search_path to ''
as $$ select 20 $$;

-- ranges ------------------------------------------------------------------

update public.sticker_placements
   set scale = least(greatest(scale, 0.5), 2)
 where scale < 0.5 or scale > 2;
update public.sticker_placements
   set x = least(greatest(x, 0), 1), y = least(greatest(y, 0), 1)
 where x < 0 or x > 1 or y < 0 or y > 1;
update public.sticker_placements set z_index = 0 where z_index < 0;

alter table public.sticker_placements
  drop constraint if exists sticker_placements_scale_check,
  drop constraint if exists sticker_placements_x_range,
  drop constraint if exists sticker_placements_y_range,
  drop constraint if exists sticker_placements_size_range;

alter table public.sticker_placements
  add constraint sticker_placements_scale_range check (scale between 0.5 and 2),
  add constraint sticker_placements_x_range check (x between 0 and 1),
  add constraint sticker_placements_y_range check (y between 0 and 1),
  add constraint sticker_placements_size_range check (size is null or size between 0.05 and 0.5),
  add constraint sticker_placements_z_index_range check (z_index >= 0);

-- the free affiliation -----------------------------------------------------

alter table public.sticker_placements
  add column if not exists is_affiliation boolean not null default false;

alter table public.sticker_placements
  add constraint sticker_placements_affiliation_plain check (not is_affiliation or foil = 'none');

create unique index if not exists sticker_placements_one_affiliation
  on public.sticker_placements (card_id) where is_affiliation;

-- a copy on a card is in use; the free affiliation never was a copy
create or replace function public.sticker_available_count(p_owner_id uuid, p_sticker_id text, p_foil public.sticker_foil default 'none')
returns integer
language sql
stable security definer
set search_path to 'public'
as $$
  select case when auth.uid() = p_owner_id then
    coalesce((select quantity from public.sticker_inventory
                where owner_id = p_owner_id and sticker_id = p_sticker_id and foil = p_foil), 0)
    - (select count(*)::int
         from public.sticker_placements sp
         join public.cards c on c.id = sp.card_id
        where c.owner_id = p_owner_id and sp.sticker_id = p_sticker_id and sp.foil = p_foil
          and not sp.is_affiliation)
  else 0 end;
$$;

revoke execute on function public.sticker_available_count(uuid, text, public.sticker_foil) from public, anon;
grant execute on function public.sticker_available_count(uuid, text, public.sticker_foil) to authenticated;

create or replace function public.sticker_placements_check()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_owner uuid;
  v_kind public.sticker_kind;
  v_fandom text;
begin
  if tg_op = 'UPDATE' then
    if new.card_id <> old.card_id or new.sticker_id <> old.sticker_id or new.foil <> old.foil
       or new.is_affiliation <> old.is_affiliation then
      raise exception 'placement_immutable' using errcode = '23514',
        hint = 'Remove the sticker and place it again instead.';
    end if;
    return new;
  end if;

  select owner_id into v_owner from public.cards where id = new.card_id;
  if v_owner is null then
    raise exception 'card_not_found' using errcode = 'P0002';
  end if;
  -- BEFORE triggers run ahead of RLS's WITH CHECK, so refuse someone else's
  -- card here, before locking it. (auth.uid() is null for migrations and the
  -- service role, which may place on any card.)
  if auth.uid() is not null and v_owner <> auth.uid() then
    raise exception 'not_your_card' using errcode = '42501';
  end if;
  -- lock the card: serialises the per-card cap across concurrent inserts
  perform 1 from public.cards where id = new.card_id for update;

  select kind, fandom_id into v_kind, v_fandom from public.stickers where id = new.sticker_id;

  if new.is_affiliation then
    if v_kind is distinct from 'fandom'
       or not exists (select 1 from public.fandoms f
                       where f.id = v_fandom and f.status = 'approved' and f.is_active) then
      raise exception 'affiliation_invalid' using errcode = '23514',
        hint = 'Only an approved fandom can be a card''s affiliation.';
    end if;
  elsif public.sticker_available_count(v_owner, new.sticker_id, new.foil) < 1 then
    raise exception 'sticker_unavailable' using errcode = '23514',
      hint = 'You do not have a spare copy of that sticker.';
  end if;

  if (select count(*) from public.sticker_placements where card_id = new.card_id)
     >= public.max_stickers_per_card() then
    raise exception 'too_many_stickers' using errcode = '23514',
      hint = 'A card holds 20 stickers at most. Take one off first.';
  end if;

  return new;
end;
$$;

revoke execute on function public.sticker_placements_check() from public, anon, authenticated;

-- keeping cards.affiliation* and the placement in step ----------------------

create or replace function public.cards_sync_affiliation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sticker text;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if tg_op = 'UPDATE'
     and new.affiliation is not distinct from old.affiliation
     and new.affiliation_x = old.affiliation_x
     and new.affiliation_y = old.affiliation_y then
    return null;
  end if;

  if new.affiliation is null then
    delete from public.sticker_placements where card_id = new.id and is_affiliation;
    return null;
  end if;

  v_sticker := 'fandom-' || new.affiliation;
  update public.sticker_placements
     set x = least(greatest(new.affiliation_x, 0), 1),
         y = least(greatest(new.affiliation_y, 0), 1)
   where card_id = new.id and is_affiliation and sticker_id = v_sticker;
  if not found then
    delete from public.sticker_placements where card_id = new.id and is_affiliation;
    insert into public.sticker_placements (card_id, sticker_id, x, y, foil, is_affiliation, size, z_index)
    values (new.id, v_sticker,
            least(greatest(new.affiliation_x, 0), 1), least(greatest(new.affiliation_y, 0), 1),
            'none', true, 0.256,
            coalesce((select max(z_index) + 1 from public.sticker_placements where card_id = new.id), 0));
  end if;
  return null;
end;
$$;

drop trigger if exists cards_sync_affiliation on public.cards;
create trigger cards_sync_affiliation after insert or update of affiliation, affiliation_x, affiliation_y
  on public.cards for each row execute function public.cards_sync_affiliation();

create or replace function public.placements_sync_affiliation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if tg_op = 'DELETE' then
    if old.is_affiliation then
      update public.cards set affiliation = null where id = old.card_id;
    end if;
    return null;
  end if;
  if new.is_affiliation then
    update public.cards
       set affiliation = (select fandom_id from public.stickers where id = new.sticker_id),
           affiliation_x = new.x,
           affiliation_y = new.y
     where id = new.card_id;
  end if;
  return null;
end;
$$;

drop trigger if exists placements_sync_affiliation on public.sticker_placements;
create trigger placements_sync_affiliation after insert or update or delete
  on public.sticker_placements for each row execute function public.placements_sync_affiliation();

revoke execute on function public.cards_sync_affiliation() from public, anon, authenticated;
revoke execute on function public.placements_sync_affiliation() from public, anon, authenticated;

-- existing affiliations become placements ----------------------------------

insert into public.sticker_placements (card_id, sticker_id, x, y, foil, is_affiliation, size, z_index)
select c.id, 'fandom-' || c.affiliation,
       least(greatest(c.affiliation_x, 0), 1), least(greatest(c.affiliation_y, 0), 1),
       'none', true, 0.256,
       coalesce((select max(sp.z_index) + 1 from public.sticker_placements sp where sp.card_id = c.id), 0)
  from public.cards c
  join public.stickers s on s.id = 'fandom-' || c.affiliation
 where c.affiliation is not null
   and not exists (select 1 from public.sticker_placements sp where sp.card_id = c.id and sp.is_affiliation);
