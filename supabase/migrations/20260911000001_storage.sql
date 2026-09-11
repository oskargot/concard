-- concard: storage buckets
--
-- card-art: public-read images for card art and avatars.
-- Objects live under <user id>/<filename> so the owner is derivable from the path.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'card-art', 'card-art', true,
  5 * 1024 * 1024,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

create policy "card art is public"
  on storage.objects for select
  using (bucket_id = 'card-art');

create policy "users upload their own card art"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'card-art' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users replace their own card art"
  on storage.objects for update to authenticated
  using (bucket_id = 'card-art' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users delete their own card art"
  on storage.objects for delete to authenticated
  using (bucket_id = 'card-art' and (storage.foldername(name))[1] = auth.uid()::text);
