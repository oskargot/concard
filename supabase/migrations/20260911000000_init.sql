-- concard: initial schema
--
-- Concepts
--   profiles            one row per auth user; username is the public URL (concard.me/<username>)
--   card_templates      static catalog of card layouts users pick from
--   cards               a user's trading cards; exactly one is "on display" via profiles.active_card_id
--   stickers            static catalog of stickers (cosmetics)
--   sticker_inventory   how many of each sticker a user owns
--   sticker_placements  stickers placed on a card (position, rotation, scale)
--   collections         "I collected your card": a frozen snapshot of the card at that moment
--
-- Rules enforced here rather than in the app so they hold for every client:
--   * usernames are lowercase, url-safe, and never a reserved route name
--   * a profile's active card must belong to that profile
--   * you can only place a sticker you own and haven't already placed elsewhere
--   * collecting is done via collect_card(): one collect per (collector, owner) per 72 hours,
--     never yourself, and the collector gets a copy of one random sticker from the card

-- ---------------------------------------------------------------------------
-- enums & helpers
-- ---------------------------------------------------------------------------

create type public.sticker_rarity as enum ('common', 'uncommon', 'rare', 'legendary');
create type public.sticker_source as enum ('starter', 'drop', 'shop', 'event');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- reserved usernames (route names and brand words)
-- ---------------------------------------------------------------------------

create table public.reserved_usernames (
  username text primary key
);

insert into public.reserved_usernames (username) values
  ('admin'), ('api'), ('auth'), ('login'), ('logout'), ('signup'), ('register'),
  ('me'), ('binder'), ('scan'), ('onboarding'), ('settings'), ('account'),
  ('about'), ('help'), ('support'), ('contact'), ('privacy'), ('terms'),
  ('concard'), ('root'), ('static'), ('_app'), ('favicon.ico'), ('robots.txt'),
  ('manifest.webmanifest'), ('sw.js'), ('events'), ('event'), ('shop'), ('store'),
  ('stickers'), ('sticker'), ('cards'), ('card'), ('u'), ('user'), ('users'),
  ('www'), ('mail'), ('null'), ('undefined'), ('search'), ('explore'), ('new');

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  display_name text not null,
  bio text not null default '',
  avatar_url text,
  -- [{ "label": "Bluesky", "url": "https://..." }, ...]
  links jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9][a-z0-9_]{2,19}$'),
  constraint profiles_display_name_len check (char_length(display_name) between 1 and 40),
  constraint profiles_bio_len check (char_length(bio) <= 200),
  constraint profiles_links_shape check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 8)
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.is_username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    lower(candidate) ~ '^[a-z0-9][a-z0-9_]{2,19}$'
    and not exists (select 1 from public.reserved_usernames r where r.username = lower(candidate))
    and not exists (select 1 from public.profiles p where p.username = lower(candidate));
$$;

create or replace function public.profiles_check_username()
returns trigger
language plpgsql
as $$
begin
  new.username := lower(new.username);
  if exists (select 1 from public.reserved_usernames r where r.username = new.username) then
    raise exception 'username_reserved' using errcode = '23514', hint = 'That username is reserved.';
  end if;
  return new;
end;
$$;

create trigger profiles_check_username
  before insert or update of username on public.profiles
  for each row execute function public.profiles_check_username();

-- ---------------------------------------------------------------------------
-- card templates & cards
-- ---------------------------------------------------------------------------

create table public.card_templates (
  id text primary key,
  name text not null,
  description text not null default '',
  -- free-form rendering hints for the client (fonts, frame style, default colors)
  config jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  is_active boolean not null default true
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  template_id text not null references public.card_templates (id),
  title text not null,
  subtitle text not null default '',
  flavor_text text not null default '',
  art_url text,
  -- { "primary": "#hex", "secondary": "#hex", "accent": "#hex" }
  colors jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cards_title_len check (char_length(title) between 1 and 40),
  constraint cards_subtitle_len check (char_length(subtitle) <= 60),
  constraint cards_flavor_len check (char_length(flavor_text) <= 200),
  constraint cards_colors_shape check (jsonb_typeof(colors) = 'object')
);

create index cards_owner_idx on public.cards (owner_id, created_at);

create trigger cards_set_updated_at
  before update on public.cards
  for each row execute function public.set_updated_at();

alter table public.profiles
  add column active_card_id uuid references public.cards (id) on delete set null;

-- the active card must be one of the profile's own cards
create or replace function public.profiles_check_active_card()
returns trigger
language plpgsql
as $$
begin
  if new.active_card_id is not null and not exists (
    select 1 from public.cards c where c.id = new.active_card_id and c.owner_id = new.id
  ) then
    raise exception 'active_card_not_owned' using errcode = '23514', hint = 'You can only display your own card.';
  end if;
  return new;
end;
$$;

create trigger profiles_check_active_card
  before insert or update of active_card_id on public.profiles
  for each row execute function public.profiles_check_active_card();

-- a user's first card automatically goes on display
create or replace function public.cards_autoactivate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set active_card_id = new.id
   where id = new.owner_id and active_card_id is null;
  return new;
end;
$$;

create trigger cards_autoactivate
  after insert on public.cards
  for each row execute function public.cards_autoactivate();

-- can the current user see this card? (own cards, or anyone's card on display)
create or replace function public.card_is_visible(p_card_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.cards c
      join public.profiles p on p.id = c.owner_id
     where c.id = p_card_id
       and (c.owner_id = auth.uid() or p.active_card_id = c.id)
  );
$$;

-- ---------------------------------------------------------------------------
-- stickers
-- ---------------------------------------------------------------------------

create table public.stickers (
  id text primary key,
  name text not null,
  -- v1 stickers are emoji glyphs; image_url wins when present
  glyph text,
  image_url text,
  rarity public.sticker_rarity not null default 'common',
  source public.sticker_source not null default 'drop',
  price_cents int check (price_cents is null or price_cents >= 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  constraint stickers_has_visual check (glyph is not null or image_url is not null)
);

create table public.sticker_inventory (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  sticker_id text not null references public.stickers (id),
  quantity int not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (owner_id, sticker_id)
);

create trigger sticker_inventory_set_updated_at
  before update on public.sticker_inventory
  for each row execute function public.set_updated_at();

create table public.sticker_placements (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  sticker_id text not null references public.stickers (id),
  -- normalised 0..1 position of the sticker centre on the card face
  x numeric(6, 5) not null check (x between 0 and 1),
  y numeric(6, 5) not null check (y between 0 and 1),
  rotation numeric(6, 2) not null default 0 check (rotation between -360 and 360),
  scale numeric(4, 2) not null default 1 check (scale between 0.25 and 3),
  z_index int not null default 0,
  created_at timestamptz not null default now()
);

create index sticker_placements_card_idx on public.sticker_placements (card_id, z_index);

-- copies of a sticker the user owns but has not placed on any card
create or replace function public.sticker_available_count(p_owner_id uuid, p_sticker_id text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select quantity from public.sticker_inventory
                    where owner_id = p_owner_id and sticker_id = p_sticker_id), 0)
       - (select count(*)::int
            from public.sticker_placements sp
            join public.cards c on c.id = sp.card_id
           where c.owner_id = p_owner_id and sp.sticker_id = p_sticker_id);
$$;

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
    if new.card_id <> old.card_id or new.sticker_id <> old.sticker_id then
      raise exception 'placement_immutable' using errcode = '23514',
        hint = 'Remove the sticker and place it again instead.';
    end if;
    return new;
  end if;
  if public.sticker_available_count(v_owner, new.sticker_id) < 1 then
    raise exception 'sticker_unavailable' using errcode = '23514',
      hint = 'You do not have a spare copy of that sticker.';
  end if;
  return new;
end;
$$;

create trigger sticker_placements_check
  before insert or update on public.sticker_placements
  for each row execute function public.sticker_placements_check();

-- everyone starts with a few stickers to decorate with
create or replace function public.grant_starter_stickers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sticker_inventory (owner_id, sticker_id, quantity)
  select new.id, s.id, 2
    from public.stickers s
   where s.source = 'starter' and s.is_active
  on conflict (owner_id, sticker_id) do nothing;
  return new;
end;
$$;

create trigger profiles_grant_starter_stickers
  after insert on public.profiles
  for each row execute function public.grant_starter_stickers();

-- ---------------------------------------------------------------------------
-- collections
-- ---------------------------------------------------------------------------

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  collector_id uuid not null references public.profiles (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  card_id uuid references public.cards (id) on delete set null,
  -- the card exactly as it looked when collected; see collect_card() for the shape
  card_snapshot jsonb not null,
  bonus_sticker_id text references public.stickers (id),
  -- reserved for the events feature; null until then
  event_id uuid,
  collected_at timestamptz not null default now(),
  constraint collections_not_self check (collector_id <> owner_id)
);

create index collections_collector_idx on public.collections (collector_id, collected_at desc);
create index collections_pair_idx on public.collections (collector_id, owner_id, collected_at desc);
create index collections_owner_idx on public.collections (owner_id, collected_at desc);

-- how long after collecting someone before you can collect them again.
-- roughly one con weekend; the events feature will scope this to the event itself.
create or replace function public.collect_cooldown()
returns interval
language sql
immutable
as $$ select interval '72 hours' $$;

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

  -- serialise concurrent collects of the same pair so a double-tap cannot collect twice
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
    'version', 1,
    'card_id', v_card.id,
    'template_id', v_card.template_id,
    'title', v_card.title,
    'subtitle', v_card.subtitle,
    'flavor_text', v_card.flavor_text,
    'art_url', v_card.art_url,
    'colors', v_card.colors,
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

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------

alter table public.reserved_usernames enable row level security;
alter table public.profiles enable row level security;
alter table public.card_templates enable row level security;
alter table public.cards enable row level security;
alter table public.stickers enable row level security;
alter table public.sticker_inventory enable row level security;
alter table public.sticker_placements enable row level security;
alter table public.collections enable row level security;

-- catalogs: readable by everyone, writable by nobody but the service role
create policy "reserved usernames are public" on public.reserved_usernames
  for select using (true);
create policy "templates are public" on public.card_templates
  for select using (true);
create policy "stickers are public" on public.stickers
  for select using (true);

-- profiles: public read, self write
create policy "profiles are public" on public.profiles
  for select using (true);
create policy "users create their own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "users update their own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- cards: own cards fully; other people's only when on display
create policy "cards on display are public" on public.cards
  for select using (public.card_is_visible(id));
create policy "users create their own cards" on public.cards
  for insert to authenticated with check (owner_id = auth.uid());
create policy "users update their own cards" on public.cards
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "users delete their own cards" on public.cards
  for delete to authenticated using (owner_id = auth.uid());

-- inventory: private, only written by functions
create policy "users see their own inventory" on public.sticker_inventory
  for select to authenticated using (owner_id = auth.uid());

-- placements: visible with the card; editable by the card owner (trigger checks inventory)
create policy "placements visible with card" on public.sticker_placements
  for select using (public.card_is_visible(card_id));
create policy "users place stickers on their own cards" on public.sticker_placements
  for insert to authenticated with check (
    exists (select 1 from public.cards c where c.id = card_id and c.owner_id = auth.uid()));
create policy "users move stickers on their own cards" on public.sticker_placements
  for update to authenticated using (
    exists (select 1 from public.cards c where c.id = card_id and c.owner_id = auth.uid()));
create policy "users remove stickers from their own cards" on public.sticker_placements
  for delete to authenticated using (
    exists (select 1 from public.cards c where c.id = card_id and c.owner_id = auth.uid()));

-- collections: you see what you collected and who collected you; only collect_card() writes
create policy "users see collections they are part of" on public.collections
  for select to authenticated using (collector_id = auth.uid() or owner_id = auth.uid());
create policy "collectors can discard a collected card" on public.collections
  for delete to authenticated using (collector_id = auth.uid());

-- functions callable from the client
revoke execute on function public.collect_card(text) from public, anon;
grant execute on function public.collect_card(text) to authenticated;
grant execute on function public.is_username_available(text) to anon, authenticated;
grant execute on function public.sticker_available_count(uuid, text) to authenticated;
grant execute on function public.card_is_visible(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- catalog data
-- ---------------------------------------------------------------------------

insert into public.card_templates (id, name, description, config, sort_order) values
  ('classic', 'Classic', 'A clean framed card with a big art window.',
   '{"frame":"solid","font":"serif","defaultColors":{"primary":"#1f2937","secondary":"#f8fafc","accent":"#f59e0b"}}', 10),
  ('holo', 'Holo', 'Shimmering foil gradient frame.',
   '{"frame":"gradient","font":"sans","defaultColors":{"primary":"#4c1d95","secondary":"#ede9fe","accent":"#22d3ee"}}', 20),
  ('pixel', 'Pixel', 'Chunky retro pixel border.',
   '{"frame":"pixel","font":"mono","defaultColors":{"primary":"#14532d","secondary":"#dcfce7","accent":"#facc15"}}', 30),
  ('minimal', 'Minimal', 'No frame, just your art and name.',
   '{"frame":"none","font":"sans","defaultColors":{"primary":"#0f172a","secondary":"#ffffff","accent":"#ef4444"}}', 40)
on conflict (id) do nothing;

insert into public.stickers (id, name, glyph, rarity, source, sort_order) values
  ('star',      'Star',        '⭐', 'common',    'starter', 10),
  ('heart',     'Heart',       '❤️', 'common',    'starter', 20),
  ('sparkles',  'Sparkles',    '✨', 'common',    'starter', 30),
  ('fire',      'Fire',        '🔥', 'common',    'starter', 40),
  ('cat',       'Cat',         '🐱', 'uncommon',  'drop',    50),
  ('rocket',    'Rocket',      '🚀', 'uncommon',  'drop',    60),
  ('sushi',     'Sushi',       '🍣', 'uncommon',  'drop',    70),
  ('dice',      'D20',         '🎲', 'uncommon',  'drop',    80),
  ('crown',     'Crown',       '👑', 'rare',      'drop',    90),
  ('dragon',    'Dragon',      '🐉', 'rare',      'drop',    100),
  ('ufo',       'UFO',         '🛸', 'rare',      'drop',    110),
  ('rainbow',   'Rainbow',     '🌈', 'legendary', 'drop',    120)
on conflict (id) do nothing;
