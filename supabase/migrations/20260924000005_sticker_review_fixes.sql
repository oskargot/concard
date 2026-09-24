-- Stickers, part 6: the two review fixes, for a database that already has
-- parts 1–5 as they were first written.
--
-- Parts 3 (…0003) and 4 (…0004) were fixed after review, on 2026-09-24, but
-- live had already applied their first versions. Re-running those files would
-- fail on their `add constraint`s, so this re-creates just the two functions
-- that changed, word for word as they now stand in those files. On a database
-- built from the fixed files it changes nothing.
--
-- * sticker_placements_check(): the affiliation no longer counts toward the
--   20-sticker cap. Picking a fandom is part of a card save, and on a card
--   already holding 20 stickers the synced affiliation placement tripped the
--   cap and rolled the whole save back.
-- * collect_card(): each snapshot sticker carries its placement `id`, which
--   seeds its wobble, so a collected card tilts its stickers exactly as the
--   owner's does.
--
-- Safe to run more than once.

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

  -- the affiliation sits outside the cap (at most one per card, by index), so
  -- picking a fandom can never fail a card save that already holds 20
  if not new.is_affiliation
     and (select count(*) from public.sticker_placements
           where card_id = new.card_id and not is_affiliation)
         >= public.max_stickers_per_card() then
    raise exception 'too_many_stickers' using errcode = '23514',
      hint = 'A card holds 20 stickers at most. Take one off first.';
  end if;

  return new;
end;
$$;

revoke execute on function public.sticker_placements_check() from public, anon, authenticated;

create or replace function public.collect_card(target_username text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_collector uuid := auth.uid();
  v_owner public.profiles%rowtype;
  v_card public.cards%rowtype;
  v_last timestamptz;
  v_snapshot jsonb;
  v_collection_id uuid;
  v_collected_at timestamptz;
  v_kind public.sticker_kind;
  v_pick jsonb;
  v_foil public.sticker_foil;
  v_grants jsonb := '[]'::jsonb;
  v_bonus text;
  v_bonus_foil public.sticker_foil := 'none';
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
    'version', 4,
    'card_id', v_card.id,
    'title', coalesce(v_card.display_name, v_owner.display_name),
    'pronouns', coalesce(v_card.pronouns, v_owner.pronouns),
    'bio', coalesce(v_card.bio, v_owner.bio),
    'art_url', v_card.art_url,
    'art_x', v_card.art_x,
    'art_y', v_card.art_y,
    'art_scale', v_card.art_scale,
    'style', coalesce(v_card.style, '{}'::jsonb),
    'affiliation', (
      select jsonb_build_object(
               'id', f.id, 'name', f.name, 'mark', f.mark,
               'color_a', f.color_a, 'color_b', f.color_b,
               'style_category', f.style_category,
               'x', v_card.affiliation_x, 'y', v_card.affiliation_y)
        from public.fandoms f
       where f.id = v_card.affiliation),
    'links', case
      when jsonb_array_length(coalesce(v_card.links, '[]'::jsonb)) > 0 then v_card.links
      else coalesce(v_owner.links, '[]'::jsonb)
    end,
    'stickers', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               -- the placement id seeds each sticker's wobble, so a collected
               -- card tilts its stickers exactly as the owner's does
               'id', sp.id,
               'sticker_id', sp.sticker_id,
               'kind', s.kind,
               'name', s.name,
               'x', sp.x, 'y', sp.y,
               'rotation', sp.rotation, 'scale', sp.scale, 'z_index', sp.z_index,
               'foil', sp.foil, 'size', sp.size,
               'is_affiliation', sp.is_affiliation,
               -- deco: the baked, immutable art
               'full_path', s.full_path, 'mask_path', s.mask_path,
               'thumb_path', s.thumb_path, 'art_aspect', s.art_aspect,
               'glyph', s.glyph,
               -- fandom: what the generative renderer draws from
               'fandom_id', s.fandom_id, 'label', f.name, 'style_category', f.style_category))
             order by sp.z_index, sp.created_at)
        from public.sticker_placements sp
        join public.stickers s on s.id = sp.sticker_id
        left join public.fandoms f on f.id = s.fandom_id
       where sp.card_id = v_card.id), '[]'::jsonb),
    'owner', jsonb_build_object(
      'id', v_owner.id,
      'username', v_owner.username,
      'display_name', v_owner.display_name,
      'avatar_url', v_owner.avatar_url)
  );

  insert into public.collections (collector_id, owner_id, card_id, card_snapshot)
  values (v_collector, v_owner.id, v_card.id, v_snapshot)
  returning id, collected_at into v_collection_id, v_collected_at;

  foreach v_kind in array enum_range(null::public.sticker_kind) loop
    select e into v_pick
      from jsonb_array_elements(v_snapshot -> 'stickers') e
      join public.stickers s on s.id = e ->> 'sticker_id'
     where s.kind = v_kind and s.is_active
     order by random()
     limit 1;

    continue when v_pick is null;

    v_foil := case when random() < public.sticker_copy_foil_chance()
                   then (v_pick ->> 'foil')::public.sticker_foil
                   else 'none' end;

    insert into public.sticker_inventory (owner_id, sticker_id, foil, quantity)
    values (v_collector, v_pick ->> 'sticker_id', v_foil, 1)
    on conflict (owner_id, sticker_id, foil)
    do update set quantity = public.sticker_inventory.quantity + 1;

    insert into public.collection_sticker_grants (collection_id, kind, sticker_id, foil)
    values (v_collection_id, v_kind, v_pick ->> 'sticker_id', v_foil);

    v_grants := v_grants || jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'kind', v_kind, 'sticker_id', v_pick ->> 'sticker_id', 'foil', v_foil,
        'name', v_pick -> 'name',
        'full_path', v_pick -> 'full_path', 'mask_path', v_pick -> 'mask_path',
        'thumb_path', v_pick -> 'thumb_path', 'art_aspect', v_pick -> 'art_aspect',
        'label', v_pick -> 'label', 'style_category', v_pick -> 'style_category')));

    if v_bonus is null or v_kind = 'deco' then
      v_bonus := v_pick ->> 'sticker_id';
      v_bonus_foil := v_foil;
    end if;
    v_pick := null;
  end loop;

  if v_bonus is not null then
    update public.collections
       set bonus_sticker_id = v_bonus, bonus_foil = v_bonus_foil
     where id = v_collection_id;
  end if;

  return jsonb_build_object(
    'collection_id', v_collection_id,
    'collected_at', v_collected_at,
    'stickers', v_grants,
    'bonus_sticker_id', v_bonus,
    'bonus_foil', v_bonus_foil,
    'card_snapshot', v_snapshot
  );
end;
$$;

revoke execute on function public.collect_card(text) from public, anon;
grant execute on function public.collect_card(text) to authenticated;

grant select on public.collection_sticker_grants to authenticated;
