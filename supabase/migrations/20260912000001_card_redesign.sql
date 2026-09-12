-- Card redesign (see docs/DESIGN.md "The card"): a con badge rather than a
-- creature card.
--
--   * templates are retired; a card's look is four enums stored in `style`
--     (frame, bg, shape, photo_shape) plus one fandom `affiliation`
--   * `flavor_text` becomes `bio`; `subtitle` goes away (the handle comes from
--     the profile)
--   * stickers may hang over the card edge, so their position range widens
--   * collect_card() writes snapshot version 2, which carries the style, the
--     fandom, and the owner's links so the binder can render the footer

-- ---------------------------------------------------------------------------
-- fandoms: the badge catalogue
-- ---------------------------------------------------------------------------

create table public.fandoms (
  id text primary key,
  name text not null,
  -- 1–3 character mark shown on the badge
  mark text not null check (char_length(mark) between 1 and 3),
  color_a text not null,
  color_b text not null,
  sort_order int not null default 0,
  is_active boolean not null default true
);

alter table public.fandoms enable row level security;
create policy "fandoms are public" on public.fandoms for select using (true);

insert into public.fandoms (id, name, mark, color_a, color_b, sort_order) values
  ('anime',    'Anime',         'ANI', '#ff7eb6', '#7c4dff', 10),
  ('scifi',    'Sci-fi',        'SF',  '#4dd0e1', '#1a237e', 20),
  ('tcg',      'Trading cards', 'TCG', '#ffd54f', '#e65100', 30),
  ('gaming',   'Gaming',        'GG',  '#69f0ae', '#00695c', 40),
  ('cosplay',  'Cosplay',       'COS', '#f48fb1', '#ad1457', 50),
  ('comics',   'Comics',        'CMX', '#ff8a65', '#bf360c', 60),
  ('tabletop', 'Tabletop',      'D20', '#b39ddb', '#4527a0', 70),
  ('fantasy',  'Fantasy',       'FAN', '#a5d6a7', '#1b5e20', 80)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- cards
-- ---------------------------------------------------------------------------

alter table public.cards
  drop constraint cards_subtitle_len,
  drop constraint cards_flavor_len,
  drop constraint cards_colors_shape,
  drop column subtitle,
  drop column template_id;

alter table public.cards rename column flavor_text to bio;
alter table public.cards rename column colors to style;

alter table public.cards
  add column affiliation text references public.fandoms (id) on delete set null,
  add constraint cards_bio_len check (char_length(bio) <= 200),
  add constraint cards_style_shape check (
    jsonb_typeof(style) = 'object'
    and coalesce(style->>'frame', 'silver') in ('silver', 'gold', 'holo', 'ink')
    and coalesce(style->>'bg', 'paper') in ('paper', 'mint', 'sky', 'blush', 'butter', 'slate')
    and coalesce(style->>'shape', 'rounded') in ('rect', 'rounded', 'shaved')
    and coalesce(style->>'photo_shape', 'round') in ('square', 'round', 'arch', 'circle')
  );

drop table public.card_templates;

-- ---------------------------------------------------------------------------
-- stickers may overhang the card edge
-- ---------------------------------------------------------------------------

alter table public.sticker_placements
  drop constraint sticker_placements_x_check,
  drop constraint sticker_placements_y_check,
  add constraint sticker_placements_x_range check (x between -0.14 and 1.02),
  add constraint sticker_placements_y_range check (y between -0.10 and 0.96);

-- ---------------------------------------------------------------------------
-- collect_card(): snapshot version 2
-- ---------------------------------------------------------------------------

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
    'title', v_card.title,
    'bio', v_card.bio,
    'art_url', v_card.art_url,
    'style', coalesce(v_card.style, '{}'::jsonb),
    'affiliation', (
      select jsonb_build_object(
               'id', f.id, 'name', f.name, 'mark', f.mark,
               'color_a', f.color_a, 'color_b', f.color_b)
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
