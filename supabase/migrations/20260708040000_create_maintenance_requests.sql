create extension if not exists pgcrypto;

create table if not exists public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  title text not null,
  description text,
  priority text not null,
  status text not null,
  reported_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maintenance_requests_priority_check check (priority in ('low', 'medium', 'high', 'urgent')),
  constraint maintenance_requests_status_check check (status in ('open', 'inProgress', 'resolved'))
);

create index if not exists maintenance_requests_user_id_idx on public.maintenance_requests(user_id);
create index if not exists maintenance_requests_property_id_idx on public.maintenance_requests(property_id);
create index if not exists maintenance_requests_unit_id_idx on public.maintenance_requests(unit_id);
create index if not exists maintenance_requests_tenant_id_idx on public.maintenance_requests(tenant_id);
create index if not exists maintenance_requests_status_idx on public.maintenance_requests(status);
create index if not exists maintenance_requests_priority_idx on public.maintenance_requests(priority);
create index if not exists maintenance_requests_reported_at_idx on public.maintenance_requests(reported_at);

drop trigger if exists maintenance_requests_set_updated_at on public.maintenance_requests;
create trigger maintenance_requests_set_updated_at
before update on public.maintenance_requests
for each row
execute function public.set_updated_at();

create or replace function public.validate_maintenance_request_integrity()
returns trigger
language plpgsql
as $$
declare
  checked_property_owner uuid;
  checked_unit_property_id uuid;
  checked_tenant_owner_id uuid;
begin
  if new.user_id <> auth.uid() then
    raise exception 'La demande d''entretien ne correspond pas à l''utilisateur courant.';
  end if;

  select user_id
    into checked_property_owner
    from public.properties
    where id = new.property_id;

  if checked_property_owner is null or checked_property_owner <> auth.uid() then
    raise exception 'L''immeuble de la demande ne correspond pas à l''utilisateur courant.';
  end if;

  if new.unit_id is not null then
    select property_id
      into checked_unit_property_id
      from public.units
      where id = new.unit_id;

    if checked_unit_property_id is null or checked_unit_property_id <> new.property_id then
      raise exception 'Le logement ne correspond pas à l''immeuble de la demande.';
    end if;
  end if;

  if new.tenant_id is not null then
    select user_id
      into checked_tenant_owner_id
      from public.tenants
      where id = new.tenant_id;

    if checked_tenant_owner_id is null or checked_tenant_owner_id <> auth.uid() then
      raise exception 'Le locataire de la demande ne correspond pas à l''utilisateur courant.';
    end if;
  end if;

  if new.status = 'resolved' and new.completed_at is null then
    new.completed_at = now();
  end if;

  if new.status <> 'resolved' then
    new.completed_at = null;
  end if;

  return new;
end;
$$;

drop trigger if exists maintenance_requests_validate_integrity on public.maintenance_requests;
create trigger maintenance_requests_validate_integrity
before insert or update on public.maintenance_requests
for each row
execute function public.validate_maintenance_request_integrity();

alter table public.maintenance_requests enable row level security;

drop policy if exists "Users can select their own maintenance requests" on public.maintenance_requests;
create policy "Users can select their own maintenance requests"
on public.maintenance_requests
for select
using (user_id = auth.uid());

drop policy if exists "Users can insert their own maintenance requests" on public.maintenance_requests;
create policy "Users can insert their own maintenance requests"
on public.maintenance_requests
for insert
with check (user_id = auth.uid());

drop policy if exists "Users can update their own maintenance requests" on public.maintenance_requests;
create policy "Users can update their own maintenance requests"
on public.maintenance_requests
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete their own maintenance requests" on public.maintenance_requests;
create policy "Users can delete their own maintenance requests"
on public.maintenance_requests
for delete
using (user_id = auth.uid());
