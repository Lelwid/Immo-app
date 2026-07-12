create extension if not exists pgcrypto;

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null,
  target_id text not null,
  property_id uuid references public.properties(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  lease_id uuid references public.leases(id) on delete set null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notes_target_type_check check (target_type in ('immeuble', 'logement', 'locataire', 'entretien'))
);

create index if not exists notes_user_id_idx on public.notes(user_id);
create index if not exists notes_property_id_idx on public.notes(property_id);
create index if not exists notes_unit_id_idx on public.notes(unit_id);
create index if not exists notes_tenant_id_idx on public.notes(tenant_id);
create index if not exists notes_lease_id_idx on public.notes(lease_id);
create index if not exists notes_target_idx on public.notes(target_type, target_id);

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
before update on public.notes
for each row
execute function public.set_updated_at();

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  lease_id uuid references public.leases(id) on delete set null,
  activity_type text not null,
  title text not null,
  description text,
  activity_date date not null default current_date,
  created_at timestamptz not null default now(),
  constraint activities_type_check check (activity_type in ('paiement', 'bail', 'entretien', 'document', 'locataire', 'immeuble', 'note', 'tache'))
);

create index if not exists activities_user_id_idx on public.activities(user_id);
create index if not exists activities_property_id_idx on public.activities(property_id);
create index if not exists activities_unit_id_idx on public.activities(unit_id);
create index if not exists activities_tenant_id_idx on public.activities(tenant_id);
create index if not exists activities_lease_id_idx on public.activities(lease_id);
create index if not exists activities_date_idx on public.activities(activity_date, created_at);

create or replace function public.validate_note_or_activity_integrity()
returns trigger
language plpgsql
as $$
declare
  checked_property_id uuid;
  checked_unit_property_id uuid;
  checked_lease_property_id uuid;
  checked_lease_unit_id uuid;
  checked_lease_tenant_id uuid;
  checked_tenant_owner_id uuid;
begin
  if new.user_id <> auth.uid() then
    raise exception 'La donnée ne correspond pas à l''utilisateur courant.';
  end if;

  if new.property_id is not null then
    select user_id
      into checked_property_id
      from public.properties
      where id = new.property_id;

    if checked_property_id is null or checked_property_id <> auth.uid() then
      raise exception 'L''immeuble ne correspond pas à l''utilisateur courant.';
    end if;
  end if;

  if new.unit_id is not null then
    select property_id
      into checked_unit_property_id
      from public.units
      where id = new.unit_id;

    if checked_unit_property_id is null then
      raise exception 'Le logement est introuvable.';
    end if;

    if new.property_id is not null and checked_unit_property_id <> new.property_id then
      raise exception 'Le logement ne correspond pas à l''immeuble.';
    end if;
  end if;

  if new.lease_id is not null then
    select property_id, unit_id, tenant_id
      into checked_lease_property_id, checked_lease_unit_id, checked_lease_tenant_id
      from public.leases
      where id = new.lease_id;

    if checked_lease_property_id is null then
      raise exception 'Le bail est introuvable.';
    end if;

    if new.property_id is not null and checked_lease_property_id <> new.property_id then
      raise exception 'Le bail ne correspond pas à l''immeuble.';
    end if;

    if new.unit_id is not null and checked_lease_unit_id <> new.unit_id then
      raise exception 'Le bail ne correspond pas au logement.';
    end if;

    if new.tenant_id is not null and checked_lease_tenant_id <> new.tenant_id then
      raise exception 'Le bail ne correspond pas au locataire.';
    end if;
  end if;

  if new.tenant_id is not null then
    select user_id
      into checked_tenant_owner_id
      from public.tenants
      where id = new.tenant_id;

    if checked_tenant_owner_id is null or checked_tenant_owner_id <> auth.uid() then
      raise exception 'Le locataire ne correspond pas à l''utilisateur courant.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists notes_validate_integrity on public.notes;
create trigger notes_validate_integrity
before insert or update on public.notes
for each row
execute function public.validate_note_or_activity_integrity();

drop trigger if exists activities_validate_integrity on public.activities;
create trigger activities_validate_integrity
before insert or update on public.activities
for each row
execute function public.validate_note_or_activity_integrity();

alter table public.notes enable row level security;
alter table public.activities enable row level security;

drop policy if exists "Users can select their own notes" on public.notes;
create policy "Users can select their own notes"
on public.notes
for select
using (user_id = auth.uid());

drop policy if exists "Users can insert their own notes" on public.notes;
create policy "Users can insert their own notes"
on public.notes
for insert
with check (user_id = auth.uid());

drop policy if exists "Users can update their own notes" on public.notes;
create policy "Users can update their own notes"
on public.notes
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete their own notes" on public.notes;
create policy "Users can delete their own notes"
on public.notes
for delete
using (user_id = auth.uid());

drop policy if exists "Users can select their own activities" on public.activities;
create policy "Users can select their own activities"
on public.activities
for select
using (user_id = auth.uid());

drop policy if exists "Users can insert their own activities" on public.activities;
create policy "Users can insert their own activities"
on public.activities
for insert
with check (user_id = auth.uid());

drop policy if exists "Users can update their own activities" on public.activities;
create policy "Users can update their own activities"
on public.activities
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete their own activities" on public.activities;
create policy "Users can delete their own activities"
on public.activities
for delete
using (user_id = auth.uid());
