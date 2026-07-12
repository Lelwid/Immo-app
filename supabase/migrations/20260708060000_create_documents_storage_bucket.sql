insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 52428800)
on conflict (id) do update
set public = false,
    file_size_limit = 52428800;

alter table public.documents
add column if not exists storage_path text;

create index if not exists documents_storage_path_idx on public.documents(storage_path);

drop policy if exists "Users can read their own document files" on storage.objects;
create policy "Users can read their own document files"
on storage.objects
for select
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can upload their own document files" on storage.objects;
create policy "Users can upload their own document files"
on storage.objects
for insert
with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update their own document files" on storage.objects;
create policy "Users can update their own document files"
on storage.objects
for update
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete their own document files" on storage.objects;
create policy "Users can delete their own document files"
on storage.objects
for delete
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);
