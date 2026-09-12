-- The photo slot crops to fill its box (object-fit: cover), which silently
-- chops off whatever doesn't fit the card's aspect ratio. There was no way to
-- see or change what got cropped. These columns let the owner pan and zoom
-- the photo within its frame; the card renders it with
-- `object-position: {art_x} {art_y}` for the pan and a `scale(art_scale)`
-- transform, anchored at the same point, for the zoom.
--
-- Defaults (0.5, 0.5, 1) reproduce today's plain centered cover-crop exactly,
-- so no existing card's appearance changes until its owner adjusts it.

alter table public.cards
  add column art_x numeric(6, 5) not null default 0.5
    constraint cards_art_x_range check (art_x between 0 and 1),
  add column art_y numeric(6, 5) not null default 0.5
    constraint cards_art_y_range check (art_y between 0 and 1),
  add column art_scale numeric(4, 3) not null default 1
    constraint cards_art_scale_range check (art_scale between 1 and 3);

-- collect_card(): the snapshot carries the photo's pan/zoom alongside its
-- style, so a collected card is framed exactly as the owner framed it.
-- Snapshots written before this default to (0.5, 0.5, 1) when read back (see
-- snapshotToView), which is the same centered crop they were drawn with, so
-- no version bump is needed.
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
               'rotation', sp.rotation, 'scale', sp.scale, 'z_index', sp.z_index)
             order by sp.z_index, sp.created_at)
        from public.sticker_placements sp
       where sp.card_id = v_card.id), '[]'::jsonb),
    'owner', jsonb_build_object(
      'id', v_owner.id,
      'username', v_owner.username,
      'display_name', v_owner.display_name,
      'avatar_url', v_owner.avatar_url)
  );

  select sp.sticker_id into v_bonus
    from public.sticker_placements sp
    join public.stickers s on s.id = sp.sticker_id
   where sp.card_id = v_card.id and s.is_active
   order by random()
   limit 1;

  insert into public.collections (collector_id, owner_id, card_id, card_snapshot, bonus_sticker_id)
  values (v_collector, v_owner.id, v_card.id, v_snapshot, v_bonus)
  returning id, collected_at into v_collection_id, v_collected_at;

  if v_bonus is not null then
    insert into public.sticker_inventory (owner_id, sticker_id, quantity)
    values (v_collector, v_bonus, 1)
    on conflict (owner_id, sticker_id)
    do update set quantity = public.sticker_inventory.quantity + 1;
  end if;

  return jsonb_build_object(
    'collection_id', v_collection_id,
    'collected_at', v_collected_at,
    'bonus_sticker_id', v_bonus,
    'card_snapshot', v_snapshot
  );
end;
$$;
