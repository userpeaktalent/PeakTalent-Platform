drop policy if exists "Company images public read" on storage.objects;
drop policy if exists "Company images insert" on storage.objects;
drop policy if exists "Company images update" on storage.objects;
drop policy if exists "Company images delete" on storage.objects;
drop policy if exists "Company images select" on storage.objects;
drop policy if exists "Company logos upload" on storage.objects;
drop policy if exists "Company logos update" on storage.objects;
drop policy if exists "Company logos delete" on storage.objects;

do $$
begin
  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'company-images'
    limit 1
  ) then
    delete from storage.buckets
    where id = 'company-images';
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-images',
  'company-images',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Company images public read"
on storage.objects
for select
to public
using (
  bucket_id = 'company-images'
);

create policy "Company images insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'company-images'
);

create policy "Company images update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'company-images'
)
with check (
  bucket_id = 'company-images'
);

create policy "Company images delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'company-images'
);
