-- Stickers, part 1 of 5: the enum values the rest need.
--
-- The sticker foil ladder becomes none → glitter → holo → cosmic → mosaic
-- (the same five foils cards use, so a foil looks identical on both). Two
-- new enums: a sticker's kind (deco art vs generative fandom text) and a
-- fandom's review status (users submit names; Oskar approves them).
--
-- This is its own migration because `alter type … add value` can't be used
-- by later statements in the same transaction, and parts 2–5 use the new
-- values in SQL function bodies that Postgres validates at creation.
--
-- Written against the live schema as of 2026-09-23 (see
-- supabase/dev/live_schema_20260923.sql), which has drifted from this
-- folder's history. Test: `pnpm db:test:stickers`.

alter type public.sticker_foil add value if not exists 'cosmic';
alter type public.sticker_foil add value if not exists 'mosaic';

do $$ begin
  create type public.sticker_kind as enum ('deco', 'fandom');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.fandom_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null;
end $$;
