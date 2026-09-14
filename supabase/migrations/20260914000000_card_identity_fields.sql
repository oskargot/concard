-- Per-card identity, for the app's multiple-cards flow.
--
-- 20260912000003 moved name and bio onto the profile so every card read one
-- source. The design bible (§5, §6) puts display name, pronouns and bio back on
-- the *card*, and that is the point of having several: a Business card showing
-- your cosplay bio is wrong.
--
-- Rather than reverse that migration, these columns are **nullable overrides**.
-- Null means "use the profile's value", which is exactly today's behaviour, so
-- every existing card is unchanged and the web app keeps working untouched. A
-- card that sets one speaks for itself.
--
--   * cards.display_name / pronouns / bio  — per-card overrides, null = profile
--   * cards.label                          — the user's name for the card in the
--                                            switcher ("Cosplay", "Business")
--   * profiles.pronouns                    — the profile-level default
--   * profiles.notifications_on_collect     — bible §5
--   * cards_style_shape                    — now also validates bio_align and
--                                            link_layout, which the app stores
--                                            in `style` with the other axes
--   * a five-cards-per-user cap            — bible §6
--   * collect_card()                       — resolves card-over-profile into the
--                                            same version 2 snapshot keys, so
--                                            snapshotToView needs no change

-- ---------------------------------------------------------------------------
-- profile-level defaults
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column pronouns text,
  add column notifications_on_collect boolean not null default true,
  add constraint profiles_pronouns_len check (pronouns is null or char_length(pronouns) <= 30);

-- ---------------------------------------------------------------------------
-- per-card overrides
-- ---------------------------------------------------------------------------

alter table public.cards
  add column display_name text,
  add column pronouns text,
  add column bio text,
  add column label text,
  -- an override that is present must be usable; an empty string would render as
  -- a blank name rather than falling back, so it is rejected outright
  add constraint cards_display_name_len
    check (display_name is null or char_length(display_name) between 1 and 40),
  add constraint cards_pronouns_len
    check (pronouns is null or char_length(pronouns) <= 30),
  -- 200 matches profiles.bio so a profile value can always be copied down into
  -- an override; the bible's 140 is enforced in the app's editor
  add constraint cards_bio_len
    check (bio is null or char_length(bio) <= 200),
  add constraint cards_label_len
    check (label is null or char_length(label) between 1 and 24);

-- ---------------------------------------------------------------------------
-- style: two more axes
-- ---------------------------------------------------------------------------

-- Mirrors src/card/card-style.ts in the app and src/lib/card-style.ts on the web.
-- Both default when absent, so cards written before this are still valid.
alter table public.cards
  drop constraint cards_style_shape,
  add constraint cards_style_shape check (
    jsonb_typeof(style) = 'object'
    and coalesce(style->>'frame', 'silver') in ('silver', 'gold', 'holo', 'ink')
    and coalesce(style->>'bg', 'paper') in (
      'paper', 'mint', 'sky', 'blush', 'butter',
      'red', 'orange', 'amber', 'lime', 'green', 'teal', 'cyan',
      'blue', 'indigo', 'violet', 'magenta', 'rose',
      'slate'
    )
    and coalesce(style->>'shape', 'rounded') in ('rect', 'rounded', 'shaved')
    and coalesce(style->>'photo_shape', 'round') in ('square', 'round', 'arch', 'circle')
    and coalesce(style->>'bio_align', 'left') in ('left', 'center', 'right')
    and coalesce(style->>'link_layout', 'rows') in ('rows', 'grid')
  );

-- ---------------------------------------------------------------------------
-- five cards per user (bible §6)
-- ---------------------------------------------------------------------------

-- Its own function so the cap is tunable in one place, like collect_cooldown().
create or replace function public.cards_per_user_cap()
returns int
language sql
immutable
as $$ select 5 $$;

create or replace function public.cards_enforce_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  -- count under the same lock the insert takes, so two concurrent inserts can
  -- not both see four and both succeed
  perform pg_advisory_xact_lock(hashtext('card_cap:' || new.owner_id::text));

  select count(*) into v_count from public.cards where owner_id = new.owner_id;

  if v_count >= public.cards_per_user_cap() then
    raise exception 'card_cap_reached' using errcode = 'P0001',
      hint = 'You can have five cards. Delete one to make room.';
  end if;

  return new;
end;
$$;

create trigger cards_enforce_cap
  before insert on public.cards
  for each row execute function public.cards_enforce_cap();

-- ---------------------------------------------------------------------------
-- collect_card(): resolve the overrides, still writing a version 2 snapshot
-- ---------------------------------------------------------------------------
--
-- The snapshot keys are unchanged, so the web app's snapshotToView() reads it
-- exactly as before; `pronouns` is a new key, and that function ignores keys it
-- does not know. Bumping to version 3 would have meant changing the web app in
-- lockstep for no gain.

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
    -- the card speaks for itself when it has an override, otherwise the profile
    'title', coalesce(v_card.display_name, v_owner.display_name),
    'bio', coalesce(v_card.bio, v_owner.bio),
    'pronouns', coalesce(v_card.pronouns, v_owner.pronouns),
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
