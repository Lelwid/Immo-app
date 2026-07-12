create extension if not exists pgcrypto;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  lease_id uuid references public.leases(id) on delete set null,
  title text not null,
  description text,
  priority text not null,
  due_date date,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_priority_check check (priority in ('faible', 'moyenne', 'élevée'))
);

create index if not exists tasks_user_id_idx on public.tasks(user_id);
create index if not exists tasks_property_id_idx on public.tasks(property_id);
create index if not exists tasks_unit_id_idx on public.tasks(unit_id);
create index if not exists tasks_tenant_id_idx on public.tasks(tenant_id);
create index if not exists tasks_lease_id_idx on public.tasks(lease_id);
create index if not exists tasks_due_date_idx on public.tasks(due_date);
create index if not exists tasks_completed_idx on public.tasks(completed);

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row
execute function public.set_updated_at();

create or replace function public.validate_task_integrity()
returns trigger
language plpgsql
as $$
declare
  checked_property_owner uuid;
  checked_unit_property_id uuid;
  checked_unit_owner_id uuid;
  checked_tenant_owner_id uuid;
  checked_lease_property_id uuid;
  checked_lease_unit_id uuid;
  checked_lease_tenant_id uuid;
begin
  if new.user_id <> auth.uid() then
    raise exception 'La tâche ne correspond pas à l''utilisateur courant.';
  end if;

  if new.property_id is not null then
    select user_id
      into checked_property_owner
      from public.properties
      where id = new.property_id;

    if checked_property_owner is null or checked_property_owner <> auth.uid() then
      raise exception 'L''immeuble de la tâche ne correspond pas à l''utilisateur courant.';
    end if;
  end if;

  if new.unit_id is not null then
    select units.property_id, properties.user_id
      into checked_unit_property_id, checked_unit_owner_id
      from public.units
      join public.properties on properties.id = units.property_id
      where units.id = new.unit_id;

    if checked_unit_property_id is null or checked_unit_owner_id <> auth.uid() then
      raise exception 'Le logement de la tâche ne correspond pas à l''utilisateur courant.';
    end if;

    if new.property_id is not null and checked_unit_property_id <> new.property_id then
      raise exception 'Le logement ne correspond pas à l''immeuble de la tâche.';
    end if;
  end if;

  if new.tenant_id is not null then
    select user_id
      into checked_tenant_owner_id
      from public.tenants
      where id = new.tenant_id;

    if checked_tenant_owner_id is null or checked_tenant_owner_id <> auth.uid() then
      raise exception 'Le locataire de la tâche ne correspond pas à l''utilisateur courant.';
    end if;
  end if;

  if new.lease_id is not null then
    select property_id, unit_id, tenant_id
      into checked_lease_property_id, checked_lease_unit_id, checked_lease_tenant_id
      from public.leases
      where id = new.lease_id;

    if checked_lease_property_id is null then
      raise exception 'Le bail de la tâche est introuvable.';
    end if;

    if new.property_id is not null and checked_lease_property_id <> new.property_id then
      raise exception 'Le bail ne correspond pas à l''immeuble de la tâche.';
    end if;

    if new.unit_id is not null and checked_lease_unit_id <> new.unit_id then
      raise exception 'Le bail ne correspond pas au logement de la tâche.';
    end if;

    if new.tenant_id is not null and checked_lease_tenant_id <> new.tenant_id then
      raise exception 'Le bail ne correspond pas au locataire de la tâche.';
    end if;
  end if;

  if new.completed and new.completed_at is null then
    new.completed_at = now();
  end if;

  if not new.completed then
    new.completed_at = null;
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_validate_integrity on public.tasks;
create trigger tasks_validate_integrity
before insert or update on public.tasks
for each row
execute function public.validate_task_integrity();

alter table public.tasks enable row level security;

drop policy if exists "Users can select their own tasks" on public.tasks;
create policy "Users can select their own tasks"
on public.tasks
for select
using (user_id = auth.uid());

drop policy if exists "Users can insert their own tasks" on public.tasks;
create policy "Users can insert their own tasks"
on public.tasks
for insert
with check (user_id = auth.uid());

drop policy if exists "Users can update their own tasks" on public.tasks;
create policy "Users can update their own tasks"
on public.tasks
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete their own tasks" on public.tasks;
create policy "Users can delete their own tasks"
on public.tasks
for delete
using (user_id = auth.uid());
