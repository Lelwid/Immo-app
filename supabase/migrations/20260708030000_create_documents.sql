create extension if not exists pgcrypto;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  lease_id uuid references public.leases(id) on delete set null,
  title text not null,
  document_type text not null,
  file_name text,
  file_url text,
  mime_type text,
  size_bytes integer,
  related_entity_type text,
  related_entity_id text,
  notes text,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_type_check check (document_type in ('bail', 'facture', 'photo', 'inspection', 'assurance', 'paiement', 'autre')),
  constraint documents_related_entity_type_check check (
    related_entity_type is null
    or related_entity_type in ('immeuble', 'logement', 'bail', 'entretien', 'paiement')
  ),
  constraint documents_size_check check (size_bytes is null or size_bytes >= 0)
);

create index if not exists documents_user_id_idx on public.documents(user_id);
create index if not exists documents_property_id_idx on public.documents(property_id);
create index if not exists documents_unit_id_idx on public.documents(unit_id);
create index if not exists documents_tenant_id_idx on public.documents(tenant_id);
create index if not exists documents_lease_id_idx on public.documents(lease_id);
create index if not exists documents_type_idx on public.documents(document_type);
create index if not exists documents_uploaded_at_idx on public.documents(uploaded_at);

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
before update on public.documents
for each row
execute function public.set_updated_at();

create or replace function public.validate_document_integrity()
returns trigger
language plpgsql
as $$
declare
  checked_property_owner uuid;
  checked_unit_property_id uuid;
  checked_unit_owner_id uuid;
  checked_lease_property_id uuid;
  checked_lease_unit_id uuid;
  checked_lease_tenant_id uuid;
  checked_tenant_owner_id uuid;
begin
  if new.user_id <> auth.uid() then
    raise exception 'Le document ne correspond pas à l''utilisateur courant.';
  end if;

  if new.property_id is not null then
    select user_id
      into checked_property_owner
      from public.properties
      where id = new.property_id;

    if checked_property_owner is null or checked_property_owner <> auth.uid() then
      raise exception 'L''immeuble du document ne correspond pas à l''utilisateur courant.';
    end if;
  end if;

  if new.unit_id is not null then
    select units.property_id, properties.user_id
      into checked_unit_property_id, checked_unit_owner_id
      from public.units
      join public.properties on properties.id = units.property_id
      where units.id = new.unit_id;

    if checked_unit_property_id is null or checked_unit_owner_id <> auth.uid() then
      raise exception 'Le logement du document ne correspond pas à l''utilisateur courant.';
    end if;

    if new.property_id is not null and checked_unit_property_id <> new.property_id then
      raise exception 'Le logement ne correspond pas à l''immeuble du document.';
    end if;
  end if;

  if new.lease_id is not null then
    select property_id, unit_id, tenant_id
      into checked_lease_property_id, checked_lease_unit_id, checked_lease_tenant_id
      from public.leases
      where id = new.lease_id;

    if checked_lease_property_id is null then
      raise exception 'Le bail du document est introuvable.';
    end if;

    if new.property_id is not null and checked_lease_property_id <> new.property_id then
      raise exception 'Le bail ne correspond pas à l''immeuble du document.';
    end if;

    if new.unit_id is not null and checked_lease_unit_id <> new.unit_id then
      raise exception 'Le bail ne correspond pas au logement du document.';
    end if;

    if new.tenant_id is not null and checked_lease_tenant_id <> new.tenant_id then
      raise exception 'Le bail ne correspond pas au locataire du document.';
    end if;
  end if;

  if new.tenant_id is not null then
    select user_id
      into checked_tenant_owner_id
      from public.tenants
      where id = new.tenant_id;

    if checked_tenant_owner_id is null or checked_tenant_owner_id <> auth.uid() then
      raise exception 'Le locataire du document ne correspond pas à l''utilisateur courant.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists documents_validate_integrity on public.documents;
create trigger documents_validate_integrity
before insert or update on public.documents
for each row
execute function public.validate_document_integrity();

alter table public.documents enable row level security;

drop policy if exists "Users can select their own documents" on public.documents;
create policy "Users can select their own documents"
on public.documents
for select
using (user_id = auth.uid());

drop policy if exists "Users can insert their own documents" on public.documents;
create policy "Users can insert their own documents"
on public.documents
for insert
with check (user_id = auth.uid());

drop policy if exists "Users can update their own documents" on public.documents;
create policy "Users can update their own documents"
on public.documents
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete their own documents" on public.documents;
create policy "Users can delete their own documents"
on public.documents
for delete
using (user_id = auth.uid());
