create extension if not exists pgcrypto;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tenants_user_id_idx on public.tenants(user_id);
create index if not exists tenants_user_full_name_idx on public.tenants(user_id, full_name);

drop trigger if exists tenants_set_updated_at on public.tenants;
create trigger tenants_set_updated_at
before update on public.tenants
for each row
execute function public.set_updated_at();

alter table public.tenants enable row level security;

drop policy if exists "Users can select their own tenants" on public.tenants;
create policy "Users can select their own tenants"
on public.tenants
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own tenants" on public.tenants;
create policy "Users can insert their own tenants"
on public.tenants
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own tenants" on public.tenants;
create policy "Users can update their own tenants"
on public.tenants
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own tenants" on public.tenants;
create policy "Users can delete their own tenants"
on public.tenants
for delete
using (auth.uid() = user_id);

create table if not exists public.leases (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id),
  start_date date not null,
  end_date date not null,
  monthly_rent numeric not null default 0,
  payment_status text not null default 'à venir',
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leases_property_id_idx on public.leases(property_id);
create index if not exists leases_unit_id_idx on public.leases(unit_id);
create index if not exists leases_tenant_id_idx on public.leases(tenant_id);
create unique index if not exists leases_one_active_per_unit_idx
on public.leases(unit_id)
where status = 'active';

drop trigger if exists leases_set_updated_at on public.leases;
create trigger leases_set_updated_at
before update on public.leases
for each row
execute function public.set_updated_at();

alter table public.leases enable row level security;

drop policy if exists "Users can select leases for their own properties" on public.leases;
create policy "Users can select leases for their own properties"
on public.leases
for select
using (
  exists (
    select 1
    from public.properties
    where properties.id = leases.property_id
      and properties.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert leases for their own properties" on public.leases;
create policy "Users can insert leases for their own properties"
on public.leases
for insert
with check (
  exists (
    select 1
    from public.properties
    where properties.id = leases.property_id
      and properties.user_id = auth.uid()
  )
);

drop policy if exists "Users can update leases for their own properties" on public.leases;
create policy "Users can update leases for their own properties"
on public.leases
for update
using (
  exists (
    select 1
    from public.properties
    where properties.id = leases.property_id
      and properties.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.properties
    where properties.id = leases.property_id
      and properties.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete leases for their own properties" on public.leases;
create policy "Users can delete leases for their own properties"
on public.leases
for delete
using (
  exists (
    select 1
    from public.properties
    where properties.id = leases.property_id
      and properties.user_id = auth.uid()
  )
);
