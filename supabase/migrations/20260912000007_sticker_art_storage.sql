-- sticker-art: public-read images for the sticker catalog, admin-write.
-- Unlike card-art, these are catalog assets rather than per-user uploads, so
-- write access is gated on the profile's is_admin flag (see
-- 20260912000006_sticker_catalog_admin.sql) rather than a folder owner check.
-- Restricted to png/webp: both carry real alpha transparency, which the
-- on-card die-cut effect (a drop-shadow traced around the alpha silhouette)
-- depends on to look right.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sticker-art', 'sticker-art', true,
  2 * 1024 * 1024,
  array['image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "sticker art is public"
  on storage.objects for select
  using (bucket_id = 'sticker-art');

create policy "admins upload sticker art"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sticker-art'
    and exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );

create policy "admins replace sticker art"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'sticker-art'
    and exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );
