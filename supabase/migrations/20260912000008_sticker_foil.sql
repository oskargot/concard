-- Sticker upgrades: two copies of the same sticker (at the same tier) can be
-- combined into one copy of the next tier. Glitter is the card's own "light
-- sweeps a fixed sparkle texture" effect (CardShell's .glint); holo is the
-- parallax version of that effect that was tried and shelved for the card
-- face itself (see docs/DESIGN.md) — the sparkle texture drifts with tilt
-- instead of holding still under the light. Holo is the ceiling for now; two
-- holo copies do not combine further.
create type public.sticker_foil as enum ('none', 'glitter', 'holo');

-- Owning a plain and a glitter copy of the same sticker are different piles,
-- so foil joins the inventory key.
alter table public.sticker_inventory
  drop constraint sticker_inventory_pkey,
  add column foil public.sticker_foil not null default 'none',
  add constraint sticker_inventory_pkey primary key (owner_id, sticker_id, foil);

-- A placement freezes which pile it was drawn from, so the card (and any
-- snapshot taken of it) remembers whether the sticker shown is foil.
alter table public.sticker_placements
  add column foil public.sticker_foil not null default 'none';

-- Record which tier a collect's bonus sticker came in, alongside which
-- sticker it was.
alter table public.collections
  add column bonus_foil public.sticker_foil not null default 'none';

drop function if exists public.sticker_available_count(uuid, text);

create function public.sticker_available_count(
  p_owner_id uuid, p_sticker_id text, p_foil public.sticker_foil default 'none'
)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select quantity from public.sticker_inventory
                    where owner_id = p_owner_id and sticker_id = p_sticker_id and foil = p_foil), 0)
       - (select count(*)::int
            from public.sticker_placements sp
            join public.cards c on c.id = sp.card_id
           where c.owner_id = p_owner_id and sp.sticker_id = p_sticker_id and sp.foil = p_foil);
$$;

grant execute on function public.sticker_available_count(uuid, text, public.sticker_foil) to authenticated;

create or replace function public.sticker_placements_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.cards where id = new.card_id;
  if v_owner is null then
    raise exception 'card_not_found' using errcode = 'P0002';
  end if;
  if tg_op = 'UPDATE' then
    if new.card_id <> old.card_id or new.sticker_id <> old.sticker_id or new.foil <> old.foil then
      raise exception 'placement_immutable' using errcode = '23514',
        hint = 'Remove the sticker and place it again instead.';
    end if;
    return new;
  end if;
  if public.sticker_available_count(v_owner, new.sticker_id, new.foil) < 1 then
    raise exception 'sticker_unavailable' using errcode = '23514',
      hint = 'You do not have a spare copy of that sticker.';
  end if;
  return new;
end;
$$;

-- Starter stickers are always granted plain; the on-conflict target just
-- needs to match the widened primary key.
create or replace function public.grant_starter_stickers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sticker_inventory (owner_id, sticker_id, foil, quantity)
  select new.id, s.id, 'none', 2
    from public.stickers s
   where s.source = 'starter' and s.is_active
  on conflict (owner_id, sticker_id, foil) do nothing;
  return new;
end;
$$;

-- collect_card(): the snapshot now carries each placed sticker's foil tier,
-- and the random bonus copy is granted in whichever tier was actually on
-- display, so collecting someone's holo sticker gives a holo copy.
create or replace function public.collect_card(target_username text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_collector uuid := auth.uid();
  v_owner public.profiles%rowtype;
  v_card public.cards%rowtype;
  v_last timestamptz;
  v_snapshot jsonb;
  v_bonus text;
  v_bonus_foil public.sticker_foil;
  v_collection_id uuid;
  v_collected_at timestamptz;
begin
  if v_collector is null then
    raise exception 'not_authenticated' using errcode = '28000', hint = 'Sign in to collect cards.';
  end if;

  select * into v_owner from public.profiles where username = lower(target_username);
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002', hint = 'No one has that username.';
  end if;

  if v_owner.id = v_collector then
    raise exception 'cannot_collect_self' using errcode = 'P0001', hint = 'That is your own card.';
  end if;

  if v_owner.active_card_id is null then
    raise exception 'no_active_card' using errcode = 'P0001', hint = 'They have no card on display yet.';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_collector::text || ':' || v_owner.id::text));

  select max(collected_at) into v_last
    from public.collections
   where collector_id = v_collector and owner_id = v_owner.id;

  if v_last is not null and v_last > now() - public.collect_cooldown() then
    raise exception 'cooldown' using errcode = 'P0001',
      detail = (v_last + public.collect_cooldown())::text,
      hint = 'You already collected this card recently.';
  end if;

  select * into v_card from public.cards where id = v_owner.active_card_id;

  v_snapshot := jsonb_build_object(
    'version', 2,
    'card_id', v_card.id,
    'title', v_owner.display_name,
    'bio', v_owner.bio,
    'art_url', v_card.art_url,
    'art_x', v_card.art_x,
    'art_y', v_card.art_y,
    'art_scale', v_card.art_scale,
    'style', coalesce(v_card.style, '{}'::jsonb),
    'affiliation', (
      select jsonb_build_object(
               'id', f.id, 'name', f.name, 'mark', f.mark,
               'color_a', f.color_a, 'color_b', f.color_b,
               'x', v_card.affiliation_x, 'y', v_card.affiliation_y)
        from public.fandoms f
       where f.id = v_card.affiliation),
    'links', coalesce(v_owner.links, '[]'::jsonb),
    'stickers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'sticker_id', sp.sticker_id,
               'x', sp.x, 'y', sp.y,
               'rotation', sp.rotation, 'scale', sp.scale, 'z_index', sp.z_index,
               'foil', sp.foil)
             order by sp.z_index, sp.created_at)
        from public.sticker_placements sp
       where sp.card_id = v_card.id), '[]'::jsonb),
    'owner', jsonb_build_object(
      'id', v_owner.id,
      'username', v_owner.username,
      'display_name', v_owner.display_name,
      'avatar_url', v_owner.avatar_url)
  );

  select sp.sticker_id, sp.foil into v_bonus, v_bonus_foil
    from public.sticker_placements sp
    join public.stickers s on s.id = sp.sticker_id
   where sp.card_id = v_card.id and s.is_active
   order by random()
   limit 1;

  insert into public.collections (collector_id, owner_id, card_id, card_snapshot, bonus_sticker_id, bonus_foil)
  values (v_collector, v_owner.id, v_card.id, v_snapshot, v_bonus, coalesce(v_bonus_foil, 'none'))
  returning id, collected_at into v_collection_id, v_collected_at;

  if v_bonus is not null then
    insert into public.sticker_inventory (owner_id, sticker_id, foil, quantity)
    values (v_collector, v_bonus, v_bonus_foil, 1)
    on conflict (owner_id, sticker_id, foil)
    do update set quantity = public.sticker_inventory.quantity + 1;
  end if;

  return jsonb_build_object(
    'collection_id', v_collection_id,
    'collected_at', v_collected_at,
    'bonus_sticker_id', v_bonus,
    'bonus_foil', coalesce(v_bonus_foil, 'none'),
    'card_snapshot', v_snapshot
  );
end;
$$;

-- Merge two same-tier copies of a sticker into one copy of the next tier.
create function public.combine_stickers(p_sticker_id text, p_foil public.sticker_foil default 'none')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_next public.sticker_foil;
  v_have int;
begin
  if v_owner is null then
    raise exception 'not_authenticated' using errcode = '28000', hint = 'Sign in to combine stickers.';
  end if;

  v_next := case p_foil
    when 'none' then 'glitter'
    when 'glitter' then 'holo'
    else null
  end;
  if v_next is null then
    raise exception 'max_tier' using errcode = 'P0001',
      hint = 'That sticker is already as shiny as it gets.';
  end if;

  -- serialise concurrent combines of the same pile so a double-tap can't spend one copy twice
  perform pg_advisory_xact_lock(hashtext(v_owner::text || ':' || p_sticker_id || ':' || p_foil::text));

  select quantity into v_have from public.sticker_inventory
   where owner_id = v_owner and sticker_id = p_sticker_id and foil = p_foil
     for update;

  if coalesce(v_have, 0) < 2 then
    raise exception 'not_enough_copies' using errcode = 'P0001',
      hint = 'You need two of the same sticker, at the same tier, to combine them.';
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
