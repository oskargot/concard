-- Exercises the sticker migrations (20260924000000–04) on top of the live
-- schema. Every check raises on failure. Run with `pnpm db:test:stickers`
-- (PGlite, no local Postgres needed). Acts as real `authenticated` users with
-- RLS on, switching identity through the auth shim's request.jwt.claim.sub.

-- helpers -------------------------------------------------------------------

create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), false);
end $$;

-- runs `sql`, and passes only if it raises an error whose message contains `expect`
create function pg_temp.expect_error(sql text, expect text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if position(expect in sqlerrm) = 0 then
      raise exception 'expected error "%" from [%], got "%"', expect, sql, sqlerrm;
    end if;
    return;
  end;
  raise exception 'expected error "%" from [%], but it succeeded', expect, sql;
end $$;

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'check failed: %', what; end if;
end $$;

-- users ---------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.com');

set role authenticated;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.profiles (id, username, display_name) values ('00000000-0000-0000-0000-00000000000a', 'alice', 'Alice');
insert into public.cards (id, owner_id, title) values ('00000000-0000-0000-0000-0000000000ca', '00000000-0000-0000-0000-00000000000a', 'Alice');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.profiles (id, username, display_name) values ('00000000-0000-0000-0000-00000000000b', 'bob', 'Bob');
insert into public.cards (id, owner_id, title) values ('00000000-0000-0000-0000-0000000000cb', '00000000-0000-0000-0000-00000000000b', 'Bob');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into public.profiles (id, username, display_name) values ('00000000-0000-0000-0000-00000000000c', 'cara', 'Cara');
insert into public.cards (id, owner_id, title) values ('00000000-0000-0000-0000-0000000000cc', '00000000-0000-0000-0000-00000000000c', 'Cara');

-- definitions ---------------------------------------------------------------

select pg_temp.check((select count(*) = 8 from public.stickers where kind = 'fandom'), 'the 8 approved fandoms have stickers');
select pg_temp.check((select kind = 'fandom' and fandom_id = 'scifi' from public.stickers where id = 'fandom-scifi'), 'fandom-scifi is linked');
select pg_temp.check((select count(*) = 12 from public.stickers where kind = 'deco'), 'the 12 existing stickers are deco');
select pg_temp.check((select style_category = 'retro-sci-fi' from public.fandoms where id = 'scifi'), 'style category backfilled');
select pg_temp.expect_error($$insert into public.stickers (id, name) values ('x', 'X')$$, 'row-level security');

reset role;
-- asset columns are all-or-nothing and path-checked
select pg_temp.expect_error($$update public.stickers set full_path = 'cat/0123456789abcdef-full.webp' where id = 'cat'$$, 'stickers_art_complete');
select pg_temp.expect_error($$update public.stickers set full_path = 'dog/0123456789abcdef-full.webp', mask_path = 'dog/0123456789abcdef-mask.webp', thumb_path = 'dog/0123456789abcdef-thumb.webp', art_aspect = 1 where id = 'cat'$$, 'stickers_art_paths');
select pg_temp.expect_error($$update public.stickers set full_path = 'cat/0123456789abcdef-full.webp', mask_path = 'cat/fedcba9876543210-mask.webp', thumb_path = 'cat/0123456789abcdef-thumb.webp', art_aspect = 1 where id = 'cat'$$, 'stickers_art_paths');
update public.stickers set full_path = 'cat/0123456789abcdef-full.webp', mask_path = 'cat/0123456789abcdef-mask.webp',
  thumb_path = 'cat/0123456789abcdef-thumb.webp', art_aspect = 1.1045 where id = 'cat';
select pg_temp.expect_error($$delete from public.stickers where id = 'rocket'$$, 'sticker_definitions_are_permanent');
select pg_temp.expect_error($$insert into public.stickers (id, name, kind) values ('fandom-x', 'X', 'deco')$$, 'stickers_kind_matches_id');
select pg_temp.check((select public and 'image/webp' = any(allowed_mime_types) from storage.buckets where id = 'stickers'), 'public webp-only stickers bucket');

-- combining climbs the full ladder, from spare copies only --------------------

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select quantity = 2 from public.sticker_inventory where sticker_id = 'star' and foil = 'none'), 'starter stars');
select public.combine_stickers('star', 'none');
select pg_temp.check((select quantity = 1 from public.sticker_inventory where sticker_id = 'star' and foil = 'glitter'), 'star → glitter');
select pg_temp.check(not exists (select 1 from public.sticker_inventory where sticker_id = 'star' and foil = 'none'), 'spent pile removed');

reset role;
insert into public.sticker_inventory (owner_id, sticker_id, foil, quantity) values
  ('00000000-0000-0000-0000-00000000000a', 'crown', 'holo', 2),
  ('00000000-0000-0000-0000-00000000000a', 'crown', 'mosaic', 2);
set role authenticated;
select public.combine_stickers('crown', 'holo');
select pg_temp.check((select quantity = 1 from public.sticker_inventory where sticker_id = 'crown' and foil = 'cosmic'), 'holo → cosmic');
select pg_temp.expect_error($$select public.combine_stickers('crown', 'mosaic')$$, 'max_tier');

-- a placed copy isn't spare: 2 hearts, one on the card, can't combine
insert into public.sticker_placements (card_id, sticker_id, x, y, foil, size)
  values ('00000000-0000-0000-0000-0000000000ca', 'heart', 0.3, 0.3, 'none', 0.24);
select pg_temp.check(public.sticker_available_count('00000000-0000-0000-0000-00000000000a', 'heart', 'none') = 1, 'one heart spare');
select pg_temp.expect_error($$select public.combine_stickers('heart', 'none')$$, 'not_enough_copies');

-- placement rules -----------------------------------------------------------

select pg_temp.expect_error($$insert into public.sticker_placements (card_id, sticker_id, x, y, scale) values ('00000000-0000-0000-0000-0000000000ca', 'heart', 0.5, 0.5, 2.5)$$, 'sticker_placements_scale_range');
select pg_temp.expect_error($$insert into public.sticker_placements (card_id, sticker_id, x, y) values ('00000000-0000-0000-0000-0000000000ca', 'heart', 1.1, 0.5)$$, 'sticker_placements_x_range');
select pg_temp.expect_error($$insert into public.sticker_placements (card_id, sticker_id, x, y) values ('00000000-0000-0000-0000-0000000000ca', 'rocket', 0.5, 0.5)$$, 'sticker_unavailable');
-- someone else's card
select pg_temp.expect_error($$insert into public.sticker_placements (card_id, sticker_id, x, y) values ('00000000-0000-0000-0000-0000000000cb', 'heart', 0.5, 0.5)$$, 'not_your_card');
-- moving is fine, changing what it is isn't
update public.sticker_placements set x = 0.4, scale = 2, rotation = 30 where card_id = '00000000-0000-0000-0000-0000000000ca' and sticker_id = 'heart';
select pg_temp.expect_error($$update public.sticker_placements set foil = 'glitter' where sticker_id = 'heart'$$, 'placement_immutable');

-- the 20 cap (Cara, with plenty of copies)
reset role;
insert into public.sticker_inventory (owner_id, sticker_id, foil, quantity)
  values ('00000000-0000-0000-0000-00000000000c', 'dice', 'none', 25);
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into public.sticker_placements (card_id, sticker_id, x, y, z_index)
  select '00000000-0000-0000-0000-0000000000cc', 'dice', 0.5, 0.5, g from generate_series(1, 20) g;
select pg_temp.expect_error($$insert into public.sticker_placements (card_id, sticker_id, x, y) values ('00000000-0000-0000-0000-0000000000cc', 'dice', 0.5, 0.5)$$, 'too_many_stickers');
-- the affiliation sits outside the cap: picking a fandom on a full card saves
update public.cards set affiliation = 'anime', affiliation_x = 0.5, affiliation_y = 0.5
 where id = '00000000-0000-0000-0000-0000000000cc';
select pg_temp.check((select count(*) = 21 from public.sticker_placements where card_id = '00000000-0000-0000-0000-0000000000cc'), 'affiliation placed on a full card');
-- ...and doesn't free a slot for a 21st ordinary sticker
select pg_temp.expect_error($$insert into public.sticker_placements (card_id, sticker_id, x, y) values ('00000000-0000-0000-0000-0000000000cc', 'dice', 0.5, 0.5)$$, 'too_many_stickers');
update public.cards set affiliation = null where id = '00000000-0000-0000-0000-0000000000cc';
delete from public.sticker_placements where card_id = '00000000-0000-0000-0000-0000000000cc';

-- the free affiliation --------------------------------------------------------

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update public.cards set affiliation = 'scifi', affiliation_x = 0.8, affiliation_y = 0.85
 where id = '00000000-0000-0000-0000-0000000000ca';
select pg_temp.check((select count(*) = 1 from public.sticker_placements
  where card_id = '00000000-0000-0000-0000-0000000000ca' and is_affiliation and sticker_id = 'fandom-scifi' and x = 0.8), 'affiliation became a placement');
select pg_temp.check(public.sticker_available_count('00000000-0000-0000-0000-00000000000a', 'fandom-scifi', 'none') = 0, 'affiliation uses no inventory');
-- move the placement → columns follow
update public.sticker_placements set x = 0.2, y = 0.3, rotation = -12, scale = 1.5
 where card_id = '00000000-0000-0000-0000-0000000000ca' and is_affiliation;
select pg_temp.check((select affiliation_x = 0.2 and affiliation_y = 0.3 from public.cards where id = '00000000-0000-0000-0000-0000000000ca'), 'columns follow the placement');
-- an unrelated card save leaves the moved placement alone
update public.cards set bio = 'hi' where id = '00000000-0000-0000-0000-0000000000ca';
select pg_temp.check((select rotation = -12 and x = 0.2 from public.sticker_placements where card_id = '00000000-0000-0000-0000-0000000000ca' and is_affiliation), 'placement untouched by other edits');
-- switch fandom via the columns → placement swaps
update public.cards set affiliation = 'anime' where id = '00000000-0000-0000-0000-0000000000ca';
select pg_temp.check((select sticker_id = 'fandom-anime' from public.sticker_placements where card_id = '00000000-0000-0000-0000-0000000000ca' and is_affiliation), 'placement swapped');
-- a second affiliation placement is refused; foil must be none
select pg_temp.expect_error($$insert into public.sticker_placements (card_id, sticker_id, x, y, is_affiliation) values ('00000000-0000-0000-0000-0000000000ca', 'fandom-scifi', 0.5, 0.5, true)$$, 'sticker_placements_one_affiliation');
-- fandom stickers as ordinary stickers still need a copy
select pg_temp.expect_error($$insert into public.sticker_placements (card_id, sticker_id, x, y) values ('00000000-0000-0000-0000-0000000000ca', 'fandom-scifi', 0.5, 0.5)$$, 'sticker_unavailable');

-- fandom submissions -----------------------------------------------------------

select pg_temp.check((public.submit_fandom('  Homestuck  ', 'general') ->> 'status') = 'pending', 'submitted');
select pg_temp.check((select name = 'Homestuck' and submitted_by = '00000000-0000-0000-0000-00000000000a' from public.fandoms where status = 'pending'), 'trimmed, owned');
select pg_temp.expect_error($$select public.submit_fandom('homestuck')$$, 'fandom_exists');
select pg_temp.expect_error($$select public.submit_fandom('Anime')$$, 'fandom_exists');
select pg_temp.expect_error($$select public.submit_fandom('This Name Is Far Too Long For A Sticker')$$, 'fandom_name_invalid');
select pg_temp.expect_error($$select public.submit_fandom('   ')$$, 'fandom_name_invalid');
select public.submit_fandom('Splatoon', 'cute');
select public.submit_fandom('Dungeon Meshi', 'fantasy');
select pg_temp.expect_error($$select public.submit_fandom('Star Trek')$$, 'too_many_pending');
-- pending isn't usable
select pg_temp.expect_error($$update public.cards set affiliation = (select id from public.fandoms where name = 'Homestuck') where id = '00000000-0000-0000-0000-0000000000ca'$$, 'fandom_unavailable');
select pg_temp.check(not exists (select 1 from public.stickers where name = 'Homestuck'), 'no sticker while pending');
-- users can't approve their own
update public.fandoms set status = 'approved' where name = 'Homestuck';
select pg_temp.check((select status = 'pending' from public.fandoms where name = 'Homestuck'), 'status not user-writable');

-- others can't see a pending submission
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check(not exists (select 1 from public.fandoms where name = 'Homestuck'), 'pending hidden from others');
select pg_temp.check((select count(*) = 8 from public.fandoms), 'others see the approved 8');
reset role;
select pg_temp.check((select count(*) = 3 from public.fandoms where status = 'pending'), 'three pending');
-- the anon role can't submit
set role anon;
select pg_temp.expect_error($$select public.submit_fandom('Anything')$$, 'permission denied');
reset role;

-- Oskar approves one in the dashboard → it becomes a sticker; rejects another
update public.fandoms set status = 'approved' where name = 'Homestuck';
update public.fandoms set status = 'rejected' where name = 'Splatoon';
select pg_temp.check((select s.kind = 'fandom' and s.is_active and s.name = 'Homestuck' from public.stickers s join public.fandoms f on f.id = s.fandom_id where f.name = 'Homestuck'), 'approved → sticker');
select pg_temp.check((select reviewed_at is not null from public.fandoms where name = 'Homestuck'), 'reviewed_at stamped');
select pg_temp.check(not exists (select 1 from public.stickers s join public.fandoms f on f.id = s.fandom_id where f.name = 'Splatoon'), 'rejected → no sticker');
-- a rejected name can be submitted again
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.submit_fandom('Splatoon', 'cute');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update public.cards set affiliation = (select id from public.fandoms where name = 'Homestuck') where id = '00000000-0000-0000-0000-0000000000ca';

-- collecting grants one deco + one fandom sticker -------------------------------

reset role;
-- Alice's card: heart (deco, none) + her Homestuck affiliation (fandom)
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) = 0 from public.sticker_inventory where sticker_id = 'heart'
  and owner_id = '00000000-0000-0000-0000-00000000000b' and foil = 'glitter'), 'bob has no glitter heart');
create temp table r as select public.collect_card('alice') as j;
select pg_temp.check((select jsonb_array_length(j -> 'stickers') = 2 from r), 'two grants');
select pg_temp.check((select (j -> 'card_snapshot' ->> 'version')::int = 4 from r), 'snapshot v4');
select pg_temp.check((select bool_and(e ? 'kind') from r, jsonb_array_elements(j -> 'card_snapshot' -> 'stickers') e), 'snapshot stickers carry kind');
select pg_temp.check((select bool_and((e ->> 'id')::uuid in (select id from public.sticker_placements)) from r, jsonb_array_elements(j -> 'card_snapshot' -> 'stickers') e), 'snapshot stickers carry their placement id');
select pg_temp.check((select e ->> 'label' = 'Homestuck' and e ->> 'style_category' = 'general'
  from r, jsonb_array_elements(j -> 'card_snapshot' -> 'stickers') e where e ->> 'kind' = 'fandom'), 'fandom sticker frozen with label + style');
select pg_temp.check((select g ->> 'sticker_id' = 'heart' and g ->> 'foil' = 'none'
  from r, jsonb_array_elements(j -> 'stickers') g where g ->> 'kind' = 'deco'), 'deco grant is the heart, plain');
select pg_temp.check((select count(*) = 2 from public.collection_sticker_grants), 'grants recorded, visible to the collector');
select pg_temp.check((select quantity = 3 from public.sticker_inventory where owner_id = '00000000-0000-0000-0000-00000000000b'
  and sticker_id = 'heart' and foil = 'none'), 'heart copy added (2 starter + 1)');
select pg_temp.check((select bonus_sticker_id = 'heart' from public.collections where collector_id = '00000000-0000-0000-0000-00000000000b'), 'legacy bonus = deco grant');
select pg_temp.expect_error($$select public.collect_card('alice')$$, 'cooldown');
select pg_temp.expect_error($$insert into public.collection_sticker_grants select collection_id, kind, sticker_id, 'mosaic' from public.collection_sticker_grants$$, 'permission denied');
-- the owner keeps theirs
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) = 1 from public.sticker_placements where card_id = '00000000-0000-0000-0000-0000000000ca' and sticker_id = 'heart'), 'owner keeps the heart');
select pg_temp.check((select count(*) = 0 from public.collection_sticker_grants), 'owner cannot see the collector''s grants');

-- a card with nothing on it grants nothing
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select jsonb_array_length(public.collect_card('cara') -> 'stickers') = 0), 'bare card, no grants');

-- the foil roll: over many collects of a glitter-only card, some copies keep
-- glitter and most don't (p = 0.10; 400 trials → P(0 or all) ≈ 0)
reset role;
delete from public.collections;
update public.cards set affiliation = null where id = '00000000-0000-0000-0000-0000000000ca';
delete from public.sticker_placements where card_id = '00000000-0000-0000-0000-0000000000ca';
insert into public.sticker_inventory (owner_id, sticker_id, foil, quantity)
  values ('00000000-0000-0000-0000-00000000000a', 'fire', 'glitter', 1);
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.sticker_placements (card_id, sticker_id, x, y, foil) values ('00000000-0000-0000-0000-0000000000ca', 'fire', 0.5, 0.5, 'glitter');
reset role;
create function pg_temp.collect_many(n int) returns void language plpgsql as $$
begin
  for i in 1..n loop
    delete from public.collections;
    perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
    perform public.collect_card('alice');
  end loop;
end $$;
select pg_temp.collect_many(400);
select pg_temp.check((select quantity between 10 and 90 from public.sticker_inventory
  where owner_id = '00000000-0000-0000-0000-00000000000b' and sticker_id = 'fire' and foil = 'glitter'), 'about 10% keep their foil');
select pg_temp.check((select quantity between 300 and 400 from public.sticker_inventory
  where owner_id = '00000000-0000-0000-0000-00000000000b' and sticker_id = 'fire' and foil = 'none'), 'the rest are plain');
