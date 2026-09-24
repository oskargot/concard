-- Stickers, part 5 of 5: collecting a card grants its stickers.
--
-- Replaces the single random `bonus_sticker_id` with up to one deco and up to
-- one fandom sticker per collect:
--
-- * For each kind, one sticker placed on the card is picked uniformly at
--   random (per placement, so a sticker placed twice is twice as likely).
--   A card with none of a kind grants nothing for that kind. The free
--   affiliation counts: it's a fandom sticker visible on the card. Retired
--   stickers (`is_active = false`) are never granted.
-- * The pick is made from the snapshot this same call just froze, not from a
--   second read of `sticker_placements`, so the sticker you get is always one
--   you can see on the card you collected.
-- * The copy's foil is `none`, except that with probability
--   sticker_copy_foil_chance() (10%) it keeps the placed sticker's foil.
--   random() runs here, server-side; the client has no input into the pick
--   or the roll (collect_card still takes only a username).
-- * The owner keeps theirs; the collector's `sticker_inventory` goes up by one
--   per grant. The per-person cooldown is unchanged and covers the grant.
--
-- What was granted is recorded in `collection_sticker_grants` (one row per
-- kind granted) rather than as two more nullable id/foil pairs on
-- `collections`: it's per-kind data, a table keeps it queryable and room for
-- more kinds later, and it cascades away with a discarded collection. It's
-- also returned from the RPC as `stickers`, so the client can show the grant
-- without a second query. `bonus_sticker_id` / `bonus_foil` are still written
-- (the deco grant, else the fandom one) so a web client that reads them keeps
-- working; drop them once nothing does.
--
-- The snapshot is now version 4. Each placed sticker carries everything
-- needed to draw it forever without a live lookup: its kind, and for deco
-- the immutable asset paths + aspect, for fandom the label + style category
-- (the same pattern as `affiliation`). `affiliation` itself is still written
-- for older clients, now with its `style_category`.

create or replace function public.sticker_copy_foil_chance()
returns numeric
language sql
immutable
set search_path to ''
as $$ select 0.10::numeric $$;

create table if not exists public.collection_sticker_grants (
  collection_id uuid not null references public.collections (id) on delete cascade,
  kind public.sticker_kind not null,
  sticker_id text not null references public.stickers (id),
  foil public.sticker_foil not null,
  primary key (collection_id, kind)
);

alter table public.collection_sticker_grants enable row level security;

drop policy if exists "collectors see what they were granted" on public.collection_sticker_grants;
create policy "collectors see what they were granted" on public.collection_sticker_grants
  for select to authenticated using (
    exists (select 1 from public.collections c
             where c.id = collection_sticker_grants.collection_id and c.collector_id = auth.uid())
  );

-- written only by collect_card(); nobody else writes here
revoke insert, update, delete, truncate on public.collection_sticker_grants from anon, authenticated;

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
