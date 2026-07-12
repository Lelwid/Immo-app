create extension if not exists pgcrypto;

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  address text not null,
  type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists properties_user_id_idx on public.properties(user_id);
create index if not exists properties_user_name_idx on public.properties(user_id, name);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists properties_set_updated_at on public.properties;
create trigger properties_set_updated_at
before update on public.properties
for each row
execute function public.set_updated_at();

alter table public.properties enable row level security;

drop policy if exists "Users can select their own properties" on public.properties;
create policy "Users can select their own properties"
on public.properties
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own properties" on public.properties;
create policy "Users can insert their own properties"
on public.properties
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own properties" on public.properties;
create policy "Users can update their own properties"
on public.properties
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own properties" on public.properties;
create policy "Users can delete their own properties"
on public.properties
for delete
using (auth.uid() = user_id);
