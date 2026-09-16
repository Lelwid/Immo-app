create extension if not exists pgcrypto;

create table if not exists public.document_ai_extractions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  status text not null default 'pending',
  document_type text,
  raw_text text,
  structured_data jsonb not null default '{}'::jsonb,
  confidence jsonb not null default '{}'::jsonb,
  model text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_ai_extractions_status_check check (status in ('pending', 'processing', 'completed', 'failed'))
);

create index if not exists document_ai_extractions_user_id_idx
on public.document_ai_extractions(user_id);

create index if not exists document_ai_extractions_document_id_idx
on public.document_ai_extractions(document_id);

create index if not exists document_ai_extractions_document_status_created_idx
on public.document_ai_extractions(document_id, status, created_at desc);

drop trigger if exists document_ai_extractions_set_updated_at on public.document_ai_extractions;
create trigger document_ai_extractions_set_updated_at
before update on public.document_ai_extractions
for each row
execute function public.set_updated_at();

create or replace function public.validate_document_ai_extraction_integrity()
returns trigger
language plpgsql
as $$
declare
  checked_document_owner uuid;
begin
  if new.user_id <> auth.uid() then
    raise exception 'L''analyse du document ne correspond pas à l''utilisateur courant.';
  end if;

  select user_id
    into checked_document_owner
    from public.documents
    where id = new.document_id;

  if checked_document_owner is null or checked_document_owner <> auth.uid() then
    raise exception 'Le document analysé ne correspond pas à l''utilisateur courant.';
  end if;

  return new;
end;
$$;

drop trigger if exists document_ai_extractions_validate_integrity on public.document_ai_extractions;
create trigger document_ai_extractions_validate_integrity
before insert or update on public.document_ai_extractions
for each row
execute function public.validate_document_ai_extraction_integrity();

alter table public.document_ai_extractions enable row level security;

drop policy if exists "Users can select their own document AI extractions" on public.document_ai_extractions;
create policy "Users can select their own document AI extractions"
on public.document_ai_extractions
for select
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.documents
    where documents.id = document_ai_extractions.document_id
      and documents.user_id = (select auth.uid())
  )
);

drop policy if exists "Users can insert their own document AI extractions" on public.document_ai_extractions;
create policy "Users can insert their own document AI extractions"
on public.document_ai_extractions
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.documents
    where documents.id = document_ai_extractions.document_id
      and documents.user_id = (select auth.uid())
  )
);

drop policy if exists "Users can update their own document AI extractions" on public.document_ai_extractions;
create policy "Users can update their own document AI extractions"
on public.document_ai_extractions
for update
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.documents
    where documents.id = document_ai_extractions.document_id
      and documents.user_id = (select auth.uid())
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.documents
    where documents.id = document_ai_extractions.document_id
      and documents.user_id = (select auth.uid())
  )
);

drop policy if exists "Users can delete their own document AI extractions" on public.document_ai_extractions;
create policy "Users can delete their own document AI extractions"
on public.document_ai_extractions
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.documents
    where documents.id = document_ai_extractions.document_id
      and documents.user_id = (select auth.uid())
  )
);

grant select, insert, update, delete on public.document_ai_extractions to authenticated;
