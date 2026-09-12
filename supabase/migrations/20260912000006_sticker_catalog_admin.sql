-- The sticker catalog was "public read, service role write" — fine while it
-- only ever got new rows from a migration. Adding real image-based stickers
-- means someone needs to add them without a deploy, so a single admin
-- profile can now write the catalog directly through RLS instead.
--
-- To make your own account the admin, run this once against your project:
--   update public.profiles set is_admin = true where username = 'your_username';

alter table public.profiles
  add column is_admin boolean not null default false;

create policy "admins add stickers" on public.stickers
  for insert to authenticated
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin));

create policy "admins edit stickers" on public.stickers
  for update to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin));
