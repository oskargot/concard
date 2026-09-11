-- Exercises the schema end to end. Each check raises on failure, so a clean
-- run prints only the final notice. Run with: psql -v ON_ERROR_STOP=1 -f test_schema.sql
\set ON_ERROR_STOP on
\set QUIET on

begin;

-- two users --------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

-- act as user A
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

do $$ begin
  if not public.is_username_available('Alice_01') then raise exception 'alice should be available'; end if;
  if public.is_username_available('me') then raise exception 'reserved name should be unavailable'; end if;
  if public.is_username_available('ab') then raise exception 'too-short name should be unavailable'; end if;
  if public.is_username_available('has space') then raise exception 'bad chars should be unavailable'; end if;
end $$;

insert into public.profiles (id, username, display_name, links)
values ('00000000-0000-0000-0000-00000000000a', 'Alice_01', 'Alice', '[{"label":"Bluesky","url":"https://bsky.app/alice"}]');

do $$ declare v text; begin
  select username into v from public.profiles where id = '00000000-0000-0000-0000-00000000000a';
  if v <> 'alice_01' then raise exception 'username should be lowercased, got %', v; end if;
end $$;

-- reserved username rejected
do $$ begin
  begin
    update public.profiles set username = 'admin' where id = '00000000-0000-0000-0000-00000000000a';
    raise exception 'reserved username was accepted';
  exception when check_violation then null;
  end;
end $$;

-- starter stickers granted
do $$ declare n int; begin
  select count(*) into n from public.sticker_inventory where owner_id = auth.uid() and quantity = 2;
  if n <> 4 then raise exception 'expected 4 starter sticker types, got %', n; end if;
end $$;

-- first card auto-activates; second does not
insert into public.cards (id, owner_id, template_id, title, subtitle)
values ('10000000-0000-0000-0000-000000000001', auth.uid(), 'classic', 'Alice the Bold', 'Cosplayer');
insert into public.cards (id, owner_id, template_id, title)
values ('10000000-0000-0000-0000-000000000002', auth.uid(), 'holo', 'Alice, Holo Edition');

do $$ declare v uuid; begin
  select active_card_id into v from public.profiles where id = auth.uid();
  if v <> '10000000-0000-0000-0000-000000000001' then raise exception 'first card should be active'; end if;
end $$;

-- cannot display someone else's card (B has none yet; use a random uuid)
do $$ begin
  begin
    update public.profiles set active_card_id = gen_random_uuid() where id = auth.uid();
    raise exception 'foreign active card accepted';
  exception when check_violation or foreign_key_violation then null;
  end;
end $$;

-- place two stickers (owns 2 stars) then fail on the third
insert into public.sticker_placements (card_id, sticker_id, x, y) values
  ('10000000-0000-0000-0000-000000000001', 'star', 0.2, 0.2),
  ('10000000-0000-0000-0000-000000000001', 'star', 0.8, 0.2);
do $$ begin
  begin
    insert into public.sticker_placements (card_id, sticker_id, x, y)
    values ('10000000-0000-0000-0000-000000000001', 'star', 0.5, 0.5);
    raise exception 'placed more stickers than owned';
  exception when check_violation then null;
  end;
end $$;
-- a sticker never owned is rejected too
do $$ begin
  begin
    insert into public.sticker_placements (card_id, sticker_id, x, y)
    values ('10000000-0000-0000-0000-000000000001', 'dragon', 0.5, 0.5);
    raise exception 'placed an unowned sticker';
  exception when check_violation then null;
  end;
end $$;

-- self-collect is refused
do $$ begin
  begin
    perform public.collect_card('alice_01');
    raise exception 'self collect accepted';
  exception when others then
    if sqlerrm <> 'cannot_collect_self' then raise; end if;
  end;
end $$;

-- act as user B -----------------------------------------------------------
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into public.profiles (id, username, display_name)
values ('00000000-0000-0000-0000-00000000000b', 'bob', 'Bob');

-- RLS: B sees A's active card but not A's second card, and none of A's inventory
do $$ declare n int; begin
  select count(*) into n from public.cards where owner_id = '00000000-0000-0000-0000-00000000000a';
  if n <> 1 then raise exception 'B should see exactly 1 of A''s cards, saw %', n; end if;
  select count(*) into n from public.sticker_inventory where owner_id = '00000000-0000-0000-0000-00000000000a';
  if n <> 0 then raise exception 'B can see A''s inventory'; end if;
  select count(*) into n from public.sticker_placements where card_id = '10000000-0000-0000-0000-000000000001';
  if n <> 2 then raise exception 'B should see placements on the displayed card, saw %', n; end if;
end $$;

-- RLS: B cannot edit A's card or profile
do $$ declare n int; begin
  update public.cards set title = 'hacked' where id = '10000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'B updated A''s card'; end if;
  update public.profiles set display_name = 'hacked' where id = '00000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'B updated A''s profile'; end if;
end $$;

-- RLS: B cannot insert a collection directly
do $$ begin
  begin
    insert into public.collections (collector_id, owner_id, card_snapshot)
    values (auth.uid(), '00000000-0000-0000-0000-00000000000a', '{}');
    raise exception 'direct collection insert accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

-- B collects A: gets a snapshot and a bonus star
do $$ declare r jsonb; n int; begin
  r := public.collect_card('Alice_01');
  if r->>'bonus_sticker_id' <> 'star' then raise exception 'expected bonus star, got %', r->>'bonus_sticker_id'; end if;
  if (r->'card_snapshot'->>'title') <> 'Alice the Bold' then raise exception 'snapshot title wrong'; end if;
  if jsonb_array_length(r->'card_snapshot'->'stickers') <> 2 then raise exception 'snapshot should carry 2 stickers'; end if;
  if (r->'card_snapshot'->'owner'->>'username') <> 'alice_01' then raise exception 'snapshot owner wrong'; end if;
  select quantity into n from public.sticker_inventory where owner_id = auth.uid() and sticker_id = 'star';
  if n <> 3 then raise exception 'B should now own 3 stars, has %', n; end if;
  select count(*) into n from public.collections where collector_id = auth.uid();
  if n <> 1 then raise exception 'B should have 1 collection'; end if;
end $$;

-- cooldown: collecting again within 72h is refused with the retry time in detail
do $$ declare d text; begin
  begin
    perform public.collect_card('alice_01');
    raise exception 'cooldown not enforced';
  exception when others then
    if sqlerrm <> 'cooldown' then raise; end if;
    get stacked diagnostics d = pg_exception_detail;
    if d::timestamptz <= now() then raise exception 'cooldown detail should be in the future'; end if;
  end;
end $$;

-- A switching cards does not bypass the cooldown (one collect per person per window)
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update public.profiles set active_card_id = '10000000-0000-0000-0000-000000000002' where id = auth.uid();
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  begin
    perform public.collect_card('alice_01');
    raise exception 'card swap bypassed cooldown';
  exception when others then
    if sqlerrm <> 'cooldown' then raise; end if;
  end;
end $$;

-- after the window passes, collecting works again (backdate the earlier collection)
reset role;
update public.collections set collected_at = now() - interval '73 hours';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ declare r jsonb; begin
  r := public.collect_card('alice_01');
  if (r->'card_snapshot'->>'title') <> 'Alice, Holo Edition' then raise exception 'second collect should snapshot the new card'; end if;
  if r->>'bonus_sticker_id' is not null then raise exception 'card without stickers should give no bonus'; end if;
end $$;

-- collecting someone with no card on display
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000c', 'c@example.com');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
insert into public.profiles (id, username, display_name) values (auth.uid(), 'carol', 'Carol');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  begin
    perform public.collect_card('carol');
    raise exception 'collected a profile with no card';
  exception when others then
    if sqlerrm <> 'no_active_card' then raise; end if;
  end;
end $$;

-- anonymous: can read profiles, templates, stickers and displayed cards; cannot collect
reset role;
set local role anon;
set local request.jwt.claim.sub = '';
do $$ declare n int; begin
  select count(*) into n from public.profiles; if n <> 3 then raise exception 'anon should see 3 profiles'; end if;
  select count(*) into n from public.card_templates; if n < 1 then raise exception 'anon should see templates'; end if;
  select count(*) into n from public.cards; if n <> 1 then raise exception 'anon should see only displayed cards, saw %', n; end if;
  select count(*) into n from public.collections; if n <> 0 then raise exception 'anon should see no collections'; end if;
  begin
    perform public.collect_card('alice_01');
    raise exception 'anon collected a card';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
\echo 'schema tests passed'
