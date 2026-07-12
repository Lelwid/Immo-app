create extension if not exists pgcrypto;

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,
  floor text,
  floor_index integer,
  sort_order integer,
  monthly_rent numeric not null default 0,
  status text not null default 'vacant',
  tenant_id uuid,
  alerts_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists units_property_id_idx on public.units(property_id);
create index if not exists units_property_sort_order_idx on public.units(property_id, sort_order);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists units_set_updated_at on public.units;
create trigger units_set_updated_at
before update on public.units
for each row
execute function public.set_updated_at();

alter table public.units enable row level security;

drop policy if exists "Users can select units for their own properties" on public.units;
create policy "Users can select units for their own properties"
on public.units
for select
using (
  exists (
    select 1
    from public.properties
    where properties.id = units.property_id
      and properties.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert units for their own properties" on public.units;
create policy "Users can insert units for their own properties"
on public.units
for insert
with check (
  exists (
    select 1
    from public.properties
    where properties.id = units.property_id
      and properties.user_id = auth.uid()
  )
);

drop policy if exists "Users can update units for their own properties" on public.units;
create policy "Users can update units for their own properties"
on public.units
for update
using (
  exists (
    select 1
    from public.properties
    where properties.id = units.property_id
      and properties.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.properties
    where properties.id = units.property_id
      and properties.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete units for their own properties" on public.units;
create policy "Users can delete units for their own properties"
on public.units
for delete
using (
  exists (
    select 1
    from public.properties
    where properties.id = units.property_id
      and properties.user_id = auth.uid()
  )
);
