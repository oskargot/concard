-- The live project's `public` schema as it actually stood on 2026-09-23,
-- reconstructed read-only from its catalogs (pg_attribute, pg_constraint,
-- pg_get_functiondef, pg_get_triggerdef, pg_policies, acls), plus its
-- sticker and fandom rows.
--
-- Why this exists: the live database has drifted from `supabase/migrations/`
-- here. Live has no `stickers.glyph` / `stickers.rarity`, still has
-- `cards.title` (NOT NULL), has no `profiles.is_admin`, and carries four
-- migrations that were applied by hand from the app repo. New migrations
-- are tested against *this* (see scripts/db-test-pglite.mjs), because this
-- is what they will actually run on.
--
-- Test fixture only. Needs supabase/dev/auth_shim.sql first. Never run it
-- against a real database.

create type public.sticker_foil as enum ('none', 'glitter', 'holo');
create type public.sticker_rarity as enum ('common', 'uncommon', 'rare', 'legendary');
create type public.sticker_source as enum ('starter', 'drop', 'shop', 'event');

create or replace function public.card_links_valid(v jsonb)
 returns boolean
 language sql
 immutable parallel safe
as $function$
	select case
		when v is null then false
		when jsonb_typeof(v) <> 'array' then false
		when jsonb_array_length(v) > 6 then false
		else not exists (
			select 1
			from jsonb_array_elements(v) as e
			where jsonb_typeof(e) <> 'object'
				or jsonb_typeof(e -> 'url') <> 'string'
				or jsonb_typeof(e -> 'label') <> 'string'
				or length(e ->> 'url') > 300
				or length(e ->> 'label') > 40
				or (e ? 'icon' and jsonb_typeof(e -> 'icon') not in ('string', 'null'))
		)
	end;
$function$;

create table public.cards (id uuid default gen_random_uuid() not null, owner_id uuid not null, title text not null, bio text default ''::text not null, art_url text, style jsonb default '{}'::jsonb not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null, affiliation text, affiliation_x numeric(6,5) default 0.792 not null, affiliation_y numeric(6,5) default 0.851 not null, art_x numeric(6,5) default 0.5 not null, art_y numeric(6,5) default 0.5 not null, art_scale numeric(4,3) default 1 not null, links jsonb default '[]'::jsonb not null, display_name text, pronouns text, label text);
create table public.collections (id uuid default gen_random_uuid() not null, collector_id uuid not null, owner_id uuid not null, card_id uuid, card_snapshot jsonb not null, bonus_sticker_id text, event_id uuid, collected_at timestamp with time zone default now() not null, bonus_foil sticker_foil default 'none'::sticker_foil not null);
create table public.fandoms (id text not null, name text not null, mark text not null, color_a text not null, color_b text not null, sort_order integer default 0 not null, is_active boolean default true not null);
create table public.profiles (id uuid not null, username text not null, display_name text not null, bio text default ''::text not null, avatar_url text, links jsonb default '[]'::jsonb not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null, active_card_id uuid, pronouns text);
create table public.reserved_usernames (username text not null);
create table public.sticker_inventory (owner_id uuid not null, sticker_id text not null, quantity integer default 0 not null, updated_at timestamp with time zone default now() not null, foil sticker_foil default 'none'::sticker_foil not null);
create table public.sticker_placements (id uuid default gen_random_uuid() not null, card_id uuid not null, sticker_id text not null, x numeric(6,5) not null, y numeric(6,5) not null, rotation numeric(6,2) default 0 not null, scale numeric(4,2) default 1 not null, z_index integer default 0 not null, created_at timestamp with time zone default now() not null, foil sticker_foil default 'none'::sticker_foil not null, size numeric);
create table public.stickers (id text not null, name text not null, image_url text, source sticker_source default 'drop'::sticker_source not null, price_cents integer, sort_order integer default 0 not null, is_active boolean default true not null);

alter table public.cards add constraint cards_affiliation_x_range CHECK (((affiliation_x >= '-0.14'::numeric) AND (affiliation_x <= 1.02)));
alter table public.cards add constraint cards_affiliation_y_range CHECK (((affiliation_y >= '-0.10'::numeric) AND (affiliation_y <= 0.96)));
alter table public.cards add constraint cards_art_scale_range CHECK (((art_scale >= (1)::numeric) AND (art_scale <= (3)::numeric)));
alter table public.cards add constraint cards_art_x_range CHECK (((art_x >= (0)::numeric) AND (art_x <= (1)::numeric)));
alter table public.cards add constraint cards_art_y_range CHECK (((art_y >= (0)::numeric) AND (art_y <= (1)::numeric)));
alter table public.cards add constraint cards_bio_len CHECK ((char_length(bio) <= 200));
alter table public.cards add constraint cards_links_valid CHECK (card_links_valid(links));
alter table public.cards add constraint cards_pkey PRIMARY KEY (id);
alter table public.cards add constraint cards_style_shape CHECK (((jsonb_typeof(style) = 'object'::text) AND (COALESCE((style ->> 'frame'::text), 'silver'::text) = ANY (ARRAY['silver'::text, 'gold'::text, 'holo'::text, 'ink'::text])) AND (COALESCE((style ->> 'bg'::text), 'paper'::text) = ANY (ARRAY['paper'::text, 'mint'::text, 'sky'::text, 'blush'::text, 'butter'::text, 'red'::text, 'orange'::text, 'amber'::text, 'lime'::text, 'green'::text, 'teal'::text, 'cyan'::text, 'blue'::text, 'indigo'::text, 'violet'::text, 'magenta'::text, 'rose'::text, 'slate'::text])) AND (COALESCE((style ->> 'shape'::text), 'rounded'::text) = ANY (ARRAY['rect'::text, 'rounded'::text, 'shaved'::text])) AND (COALESCE((style ->> 'photo_shape'::text), 'rounded'::text) = ANY (ARRAY['sharp'::text, 'rounded'::text, 'arch'::text, 'circle'::text, 'square'::text, 'round'::text])) AND (COALESCE((style ->> 'alignment'::text), 'left'::text) = ANY (ARRAY['left'::text, 'center'::text, 'right'::text])) AND (COALESCE((style ->> 'bio_align'::text), 'left'::text) = ANY (ARRAY['left'::text, 'center'::text, 'right'::text])) AND ((NOT (style ? 'photo_height'::text)) OR ((jsonb_typeof((style -> 'photo_height'::text)) = 'number'::text) AND ((((style ->> 'photo_height'::text))::numeric >= (112)::numeric) AND (((style ->> 'photo_height'::text))::numeric <= (260)::numeric))))));
alter table public.cards add constraint cards_title_len CHECK (((char_length(title) >= 1) AND (char_length(title) <= 40)));
alter table public.collections add constraint collections_not_self CHECK ((collector_id <> owner_id));
alter table public.collections add constraint collections_pkey PRIMARY KEY (id);
alter table public.fandoms add constraint fandoms_mark_check CHECK (((char_length(mark) >= 1) AND (char_length(mark) <= 3)));
alter table public.fandoms add constraint fandoms_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_bio_len CHECK ((char_length(bio) <= 200));
alter table public.profiles add constraint profiles_display_name_len CHECK (((char_length(display_name) >= 1) AND (char_length(display_name) <= 40)));
alter table public.profiles add constraint profiles_links_shape CHECK (((jsonb_typeof(links) = 'array'::text) AND (jsonb_array_length(links) <= 8)));
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_username_format CHECK ((username ~ '^[a-z0-9][a-z0-9_]{2,19}$'::text));
alter table public.profiles add constraint profiles_username_key UNIQUE (username);
alter table public.reserved_usernames add constraint reserved_usernames_pkey PRIMARY KEY (username);
alter table public.sticker_inventory add constraint sticker_inventory_pkey PRIMARY KEY (owner_id, sticker_id, foil);
alter table public.sticker_inventory add constraint sticker_inventory_quantity_check CHECK ((quantity >= 0));
alter table public.sticker_placements add constraint sticker_placements_pkey PRIMARY KEY (id);
alter table public.sticker_placements add constraint sticker_placements_rotation_check CHECK (((rotation >= ('-360'::integer)::numeric) AND (rotation <= (360)::numeric)));
alter table public.sticker_placements add constraint sticker_placements_scale_check CHECK (((scale >= 0.25) AND (scale <= (3)::numeric)));
alter table public.sticker_placements add constraint sticker_placements_size_range CHECK (((size IS NULL) OR ((size > (0)::numeric) AND (size <= (1)::numeric))));
alter table public.sticker_placements add constraint sticker_placements_x_range CHECK (((x >= '-0.14'::numeric) AND (x <= 1.02)));
alter table public.sticker_placements add constraint sticker_placements_y_range CHECK (((y >= '-0.10'::numeric) AND (y <= 0.96)));
alter table public.stickers add constraint stickers_pkey PRIMARY KEY (id);
alter table public.stickers add constraint stickers_price_cents_check CHECK (((price_cents IS NULL) OR (price_cents >= 0)));

alter table public.cards add constraint cards_affiliation_fkey FOREIGN KEY (affiliation) REFERENCES fandoms(id) ON DELETE SET NULL;
alter table public.cards add constraint cards_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.collections add constraint collections_bonus_sticker_id_fkey FOREIGN KEY (bonus_sticker_id) REFERENCES stickers(id);
alter table public.collections add constraint collections_card_id_fkey FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE SET NULL;
alter table public.collections add constraint collections_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.collections add constraint collections_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_active_card_id_fkey FOREIGN KEY (active_card_id) REFERENCES cards(id) ON DELETE SET NULL;
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.sticker_inventory add constraint sticker_inventory_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.sticker_inventory add constraint sticker_inventory_sticker_id_fkey FOREIGN KEY (sticker_id) REFERENCES stickers(id);
alter table public.sticker_placements add constraint sticker_placements_card_id_fkey FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE;
alter table public.sticker_placements add constraint sticker_placements_sticker_id_fkey FOREIGN KEY (sticker_id) REFERENCES stickers(id);

CREATE INDEX cards_owner_idx ON public.cards USING btree (owner_id, created_at);
CREATE INDEX collections_collector_idx ON public.collections USING btree (collector_id, collected_at DESC);
CREATE INDEX collections_owner_idx ON public.collections USING btree (owner_id, collected_at DESC);
CREATE INDEX collections_pair_idx ON public.collections USING btree (collector_id, owner_id, collected_at DESC);
CREATE INDEX sticker_placements_card_idx ON public.sticker_placements USING btree (card_id, z_index);

alter table public.cards enable row level security;
alter table public.collections enable row level security;
alter table public.fandoms enable row level security;
alter table public.profiles enable row level security;
alter table public.reserved_usernames enable row level security;
alter table public.sticker_inventory enable row level security;
alter table public.sticker_placements enable row level security;
alter table public.stickers enable row level security;

-- functions ----------------------------------------------------------------

create or replace function public.set_updated_at()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

create or replace function public.collect_cooldown()
 returns interval
 language sql
 immutable
 set search_path to ''
as $function$ select interval '72 hours' $function$;

create or replace function public.cards_autoactivate()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  update public.profiles
     set active_card_id = new.id
   where id = new.owner_id and active_card_id is null;
  return new;
end;
$function$;

create or replace function public.is_username_available(candidate text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    lower(candidate) ~ '^[a-z0-9][a-z0-9_]{2,19}$'
    and not exists (select 1 from public.reserved_usernames r where r.username = lower(candidate))
    and not exists (select 1 from public.profiles p where p.username = lower(candidate));
$function$;

create or replace function public.profiles_check_active_card()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if new.active_card_id is not null and not exists (
    select 1 from public.cards c where c.id = new.active_card_id and c.owner_id = new.id
  ) then
    raise exception 'active_card_not_owned' using errcode = '23514', hint = 'You can only display your own card.';
  end if;
  return new;
end;
$function$;

create or replace function public.profiles_check_username()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  new.username := lower(new.username);
  if exists (select 1 from public.reserved_usernames r where r.username = new.username) then
    raise exception 'username_reserved' using errcode = '23514', hint = 'That username is reserved.';
  end if;
  return new;
end;
$function$;

create or replace function public.sticker_available_count(p_owner_id uuid, p_sticker_id text, p_foil sticker_foil default 'none'::sticker_foil)
 returns integer
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case when auth.uid() = p_owner_id then
    coalesce((select quantity from public.sticker_inventory
                where owner_id = p_owner_id and sticker_id = p_sticker_id and foil = p_foil), 0)
    - (select count(*)::int
         from public.sticker_placements sp
         join public.cards c on c.id = sp.card_id
        where c.owner_id = p_owner_id and sp.sticker_id = p_sticker_id and sp.foil = p_foil)
  else 0 end;
$function$;

create or replace function public.sticker_placements_check()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
$function$;

create or replace function public.grant_starter_stickers()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into public.sticker_inventory (owner_id, sticker_id, foil, quantity)
  select new.id, s.id, 'none', 2
    from public.stickers s
   where s.source = 'starter' and s.is_active
  on conflict (owner_id, sticker_id, foil) do nothing;
  return new;
end;
$function$;

create or replace function public.combine_stickers(p_sticker_id text, p_foil sticker_foil default 'none'::sticker_foil)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
$function$;

create or replace function public.collect_card(target_username text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
    'version', 3,
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
               'x', v_card.affiliation_x, 'y', v_card.affiliation_y)
        from public.fandoms f
       where f.id = v_card.affiliation),
    'links', case
      when jsonb_array_length(coalesce(v_card.links, '[]'::jsonb)) > 0 then v_card.links
      else coalesce(v_owner.links, '[]'::jsonb)
    end,
    'stickers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'sticker_id', sp.sticker_id,
               'x', sp.x, 'y', sp.y,
               'rotation', sp.rotation, 'scale', sp.scale, 'z_index', sp.z_index,
               'foil', sp.foil, 'size', sp.size)
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
$function$;

-- triggers -----------------------------------------------------------------

CREATE TRIGGER cards_autoactivate AFTER INSERT ON public.cards FOR EACH ROW EXECUTE FUNCTION cards_autoactivate();
CREATE TRIGGER cards_set_updated_at BEFORE UPDATE ON public.cards FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER profiles_check_active_card BEFORE INSERT OR UPDATE OF active_card_id ON public.profiles FOR EACH ROW EXECUTE FUNCTION profiles_check_active_card();
CREATE TRIGGER profiles_check_username BEFORE INSERT OR UPDATE OF username ON public.profiles FOR EACH ROW EXECUTE FUNCTION profiles_check_username();
CREATE TRIGGER profiles_grant_starter_stickers AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION grant_starter_stickers();
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER sticker_inventory_set_updated_at BEFORE UPDATE ON public.sticker_inventory FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER sticker_placements_check BEFORE INSERT OR UPDATE ON public.sticker_placements FOR EACH ROW EXECUTE FUNCTION sticker_placements_check();

-- policies -----------------------------------------------------------------

create policy "cards on display are public" on public.cards as PERMISSIVE for SELECT to public using (((owner_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = cards.owner_id) AND (p.active_card_id = cards.id))))));
create policy "collectors can discard a collected card" on public.collections as PERMISSIVE for DELETE to authenticated using ((collector_id = auth.uid()));
create policy "fandoms are public" on public.fandoms as PERMISSIVE for SELECT to public using (true);
create policy "placements visible with card" on public.sticker_placements as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1 FROM cards c WHERE ((c.id = sticker_placements.card_id) AND ((c.owner_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = c.owner_id) AND (p.active_card_id = c.id)))))))));
create policy "profiles are public" on public.profiles as PERMISSIVE for SELECT to public using (true);
create policy "reserved usernames are public" on public.reserved_usernames as PERMISSIVE for SELECT to public using (true);
create policy "stickers are public" on public.stickers as PERMISSIVE for SELECT to public using (true);
create policy "users create their own cards" on public.cards as PERMISSIVE for INSERT to authenticated with check ((owner_id = auth.uid()));
create policy "users create their own profile" on public.profiles as PERMISSIVE for INSERT to authenticated with check ((id = auth.uid()));
create policy "users delete their own cards" on public.cards as PERMISSIVE for DELETE to authenticated using ((owner_id = auth.uid()));
create policy "users move stickers on their own cards" on public.sticker_placements as PERMISSIVE for UPDATE to authenticated using ((EXISTS ( SELECT 1 FROM cards c WHERE ((c.id = sticker_placements.card_id) AND (c.owner_id = auth.uid())))));
create policy "users place stickers on their own cards" on public.sticker_placements as PERMISSIVE for INSERT to authenticated with check ((EXISTS ( SELECT 1 FROM cards c WHERE ((c.id = sticker_placements.card_id) AND (c.owner_id = auth.uid())))));
create policy "users remove stickers from their own cards" on public.sticker_placements as PERMISSIVE for DELETE to authenticated using ((EXISTS ( SELECT 1 FROM cards c WHERE ((c.id = sticker_placements.card_id) AND (c.owner_id = auth.uid())))));
create policy "users see collections they are part of" on public.collections as PERMISSIVE for SELECT to authenticated using (((collector_id = auth.uid()) OR (owner_id = auth.uid())));
create policy "users see their own inventory" on public.sticker_inventory as PERMISSIVE for SELECT to authenticated using ((owner_id = auth.uid()));
create policy "users update their own cards" on public.cards as PERMISSIVE for UPDATE to authenticated using ((owner_id = auth.uid())) with check ((owner_id = auth.uid()));
create policy "users update their own profile" on public.profiles as PERMISSIVE for UPDATE to authenticated using ((id = auth.uid())) with check ((id = auth.uid()));

-- function grants, as live ---------------------------------------------------

revoke execute on function public.cards_autoactivate() from public, anon, authenticated;
revoke execute on function public.grant_starter_stickers() from public, anon, authenticated;
revoke execute on function public.sticker_placements_check() from public, anon, authenticated;
revoke execute on function public.collect_card(text) from public, anon;
revoke execute on function public.combine_stickers(text, public.sticker_foil) from public, anon;
revoke execute on function public.sticker_available_count(uuid, text, public.sticker_foil) from public, anon;

-- data ---------------------------------------------------------------------

insert into public.stickers (id, name, source, sort_order) values
  ('star', 'Star', 'starter', 10), ('heart', 'Heart', 'starter', 20),
  ('sparkles', 'Sparkles', 'starter', 30), ('fire', 'Fire', 'starter', 40),
  ('cat', 'Cat', 'drop', 50), ('rocket', 'Rocket', 'drop', 60), ('sushi', 'Sushi', 'drop', 70),
  ('dice', 'D20', 'drop', 80), ('crown', 'Crown', 'drop', 90), ('dragon', 'Dragon', 'drop', 100),
  ('ufo', 'UFO', 'drop', 110), ('rainbow', 'Rainbow', 'drop', 120);

insert into public.fandoms (id, name, mark, color_a, color_b, sort_order) values
  ('anime', 'Anime', 'ANI', '#ff7eb6', '#ff7eb6', 10), ('scifi', 'Sci-fi', 'SF', '#4dd0e1', '#4dd0e1', 20),
  ('tcg', 'Trading cards', 'TCG', '#ffd54f', '#ffd54f', 30), ('gaming', 'Gaming', 'GG', '#69f0ae', '#69f0ae', 40),
  ('cosplay', 'Cosplay', 'COS', '#f48fb1', '#f48fb1', 50), ('comics', 'Comics', 'CMX', '#ff8a65', '#ff8a65', 60),
  ('tabletop', 'Tabletop', 'D20', '#b39ddb', '#b39ddb', 70), ('fantasy', 'Fantasy', 'FAN', '#a5d6a7', '#a5d6a7', 80);
