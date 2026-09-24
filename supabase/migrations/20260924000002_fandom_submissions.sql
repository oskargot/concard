-- Stickers, part 3 of 5: user-submitted fandoms, reviewed by hand.
--
-- Anyone signed in can submit a fandom name. It's `pending`, visible only to
-- the person who submitted it, and unusable anywhere until Oskar flips its
-- `status` to `approved` in the dashboard. Approval creates the matching
-- fandom sticker (`stickers` row `fandom-<id>`, kind fandom).
--
-- Why columns on `fandoms` and not a separate submissions table: a fandom is
-- the same thing before and after review — `cards.affiliation` already
-- points at `fandoms.id`, the picker already reads `fandoms`, and review is
-- literally "flip a column on the row". A second table would need its rows
-- copied across on approval and would split one name space in two, making
-- "is this name taken?" a two-table question. The price is that the public
-- read policy now has to filter on status, done below.
--
-- Rules, all enforced here rather than trusted to a client:
-- * Name: 1–24 characters, trimmed, no runs of spaces, no control
--   characters. 24 is where the generative renderer (concard-app
--   `src/stickers/fandom-layout.ts`) stops holding its type size: at a card
--   sticker's width the worst-case font size is flat up to 20 characters,
--   ~85% of that at 24, and roughly halves by 36. Long real names still fit
--   ("JoJo's Bizarre Adventure", "Neon Genesis Evangelion").
-- * Names are unique case-insensitively among pending + approved fandoms.
-- * At most 3 pending submissions per person (trigger, so it holds however
--   the row arrives), and submissions only go through submit_fandom().
-- * A card can only take an approved fandom as its affiliation.
-- * `style_category` picks the renderer's look. It's required; the submitter's
--   client proposes one (the same heuristic the app uses today) and Oskar can
--   change it during review. The eight existing fandoms are backfilled with
--   exactly what the app computes for them now, so nothing on a card changes.

alter table public.fandoms
  add column if not exists status public.fandom_status not null default 'approved',
  add column if not exists submitted_by uuid references public.profiles (id) on delete set null,
  add column if not exists style_category text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists reviewed_at timestamptz;

-- existing rows are approved; new rows start pending
alter table public.fandoms alter column status set default 'pending';

-- what concard-app's styleCategoryForFandom() returns for these today
update public.fandoms set style_category = case id
    when 'anime' then 'general'
    when 'scifi' then 'retro-sci-fi'
    when 'tcg' then 'cute'
    when 'gaming' then 'cute'
    when 'cosplay' then 'cute'
    when 'comics' then 'horror'
    when 'tabletop' then 'general'
    when 'fantasy' then 'fantasy'
    else 'general'
  end
 where style_category is null;

alter table public.fandoms alter column style_category set not null;

alter table public.fandoms
  add constraint fandoms_style_category check (
    style_category in ('retro-sci-fi', 'cute', 'fantasy', 'action', 'horror', 'tech', 'general')
  ),
  add constraint fandoms_name_shape check (
    char_length(name) between 1 and 24
    and name = btrim(name)
    and name !~ '\s\s'
    and name !~ '[[:cntrl:]]'
  );

create unique index if not exists fandoms_name_key on public.fandoms (lower(name))
  where status <> 'rejected';
create index if not exists fandoms_pending_by_idx on public.fandoms (submitted_by)
  where status = 'pending';

create or replace function public.fandom_pending_cap()
returns int
language sql
immutable
set search_path to ''
as $$ select 3 $$;

-- status bookkeeping + the pending cap ------------------------------------

create or replace function public.fandoms_before_write()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.reviewed_at := now();
  end if;
  if new.status = 'pending' and new.submitted_by is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'pending' or old.submitted_by is distinct from new.submitted_by)
  then
    if (select count(*) from public.fandoms f
         where f.submitted_by = new.submitted_by and f.status = 'pending' and f.id <> new.id)
       >= public.fandom_pending_cap() then
      raise exception 'too_many_pending' using errcode = '23514',
        hint = 'You already have 3 fandoms waiting for review.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists fandoms_before_write on public.fandoms;
create trigger fandoms_before_write before insert or update on public.fandoms
  for each row execute function public.fandoms_before_write();

-- approval → sticker --------------------------------------------------------

create or replace function public.fandoms_sync_sticker()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'approved' then
    insert into public.stickers (id, name, kind, fandom_id, source, sort_order, is_active)
    values ('fandom-' || new.id, new.name, 'fandom', new.id, 'drop', new.sort_order, new.is_active)
    on conflict (id) do update
      set name = excluded.name, sort_order = excluded.sort_order, is_active = excluded.is_active;
  else
    -- rejected (or back to pending) after approval: retire it, never delete
    update public.stickers set is_active = false where fandom_id = new.id and is_active;
  end if;
  return null;
end;
$$;

drop trigger if exists fandoms_sync_sticker on public.fandoms;
create trigger fandoms_sync_sticker after insert or update of status, name, sort_order, is_active
  on public.fandoms for each row execute function public.fandoms_sync_sticker();

-- the eight existing fandoms get their stickers now
insert into public.stickers (id, name, kind, fandom_id, source, sort_order, is_active)
select 'fandom-' || f.id, f.name, 'fandom', f.id, 'drop', f.sort_order, f.is_active
  from public.fandoms f
 where f.status = 'approved'
on conflict (id) do nothing;

-- submitting ----------------------------------------------------------------

create or replace function public.submit_fandom(p_name text, p_style_category text default 'general')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_style text := coalesce(p_style_category, 'general');
  v_slug text;
  v_id text;
  v_mark text;
  v_existing public.fandoms%rowtype;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000', hint = 'Sign in to submit a fandom.';
  end if;
  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'no_profile' using errcode = 'P0001', hint = 'Finish setting up your profile first.';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 24 or v_name ~ '[[:cntrl:]]' then
    raise exception 'fandom_name_invalid' using errcode = '22023',
      hint = 'Fandom names are 1 to 24 characters.';
  end if;
  if v_style not in ('retro-sci-fi', 'cute', 'fantasy', 'action', 'horror', 'tech', 'general') then
    v_style := 'general';
  end if;

  -- one submission at a time per person, so the cap can't be raced
  perform pg_advisory_xact_lock(hashtext('submit_fandom:' || v_user::text));

  select * into v_existing from public.fandoms
   where lower(name) = lower(v_name) and status <> 'rejected'
   limit 1;
  if found then
    raise exception 'fandom_exists' using errcode = '23505',
      -- the id only for an approved fandom: a pending one is its submitter's business
      detail = case when v_existing.status = 'approved' then v_existing.id else '' end,
      hint = case when v_existing.status = 'approved'
        then 'That fandom already exists. Pick it from the list.'
        else 'Someone has already submitted that fandom. It is waiting for review.' end;
  end if;

  v_slug := left(trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g')), 32);
  v_id := case when v_slug = '' then 'f' else v_slug end || '-' || substr(md5(gen_random_uuid()::text), 1, 6);
  v_mark := upper(left(regexp_replace(v_name, '[^A-Za-z0-9]', '', 'g'), 3));
  if v_mark = '' then v_mark := '?'; end if;

  insert into public.fandoms (id, name, mark, color_a, color_b, sort_order, is_active,
                              status, submitted_by, style_category)
  values (v_id, v_name, v_mark, '#b9c9ff', '#b9c9ff', 1000, true,
          'pending', v_user, v_style);

  return jsonb_build_object('id', v_id, 'name', v_name, 'status', 'pending', 'style_category', v_style);
end;
$$;

revoke execute on function public.submit_fandom(text, text) from public, anon;
grant execute on function public.submit_fandom(text, text) to authenticated;
revoke execute on function public.fandoms_before_write() from public, anon, authenticated;
revoke execute on function public.fandoms_sync_sticker() from public, anon, authenticated;

-- visibility ----------------------------------------------------------------

drop policy if exists "fandoms are public" on public.fandoms;
drop policy if exists "approved fandoms are public" on public.fandoms;
drop policy if exists "submitters see their own fandoms" on public.fandoms;
create policy "approved fandoms are public" on public.fandoms
  for select to public using (status = 'approved');
create policy "submitters see their own fandoms" on public.fandoms
  for select to authenticated using (submitted_by = auth.uid());

-- only approved fandoms go on cards ---------------------------------------

create or replace function public.cards_check_affiliation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.affiliation is not null
     and (tg_op = 'INSERT' or new.affiliation is distinct from old.affiliation)
     and not exists (select 1 from public.fandoms f
                      where f.id = new.affiliation and f.status = 'approved' and f.is_active)
  then
    raise exception 'fandom_unavailable' using errcode = '23514',
      hint = 'That fandom is not available yet.';
  end if;
  return new;
end;
$$;

drop trigger if exists cards_check_affiliation on public.cards;
create trigger cards_check_affiliation before insert or update of affiliation on public.cards
  for each row execute function public.cards_check_affiliation();

revoke execute on function public.cards_check_affiliation() from public, anon, authenticated;
