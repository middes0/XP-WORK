-- XP WORK: bucket público para fotos de anúncios.
-- Execute uma única vez no SQL Editor do Supabase.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-images', 'listing-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Public can view listing photos" on storage.objects;
create policy "Public can view listing photos"
on storage.objects for select
to public
using (bucket_id = 'listing-images');

drop policy if exists "Owners upload listing photos" on storage.objects;
create policy "Owners upload listing photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'listing-images'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and exists (
    select 1 from public.listings l
    where l.id::text = split_part(name, '/', 2)
      and l.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners delete listing photos" on storage.objects;
create policy "Owners delete listing photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'listing-images'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and exists (
    select 1 from public.listings l
    where l.id::text = split_part(name, '/', 2)
      and l.owner_id = (select auth.uid())
  )
);
