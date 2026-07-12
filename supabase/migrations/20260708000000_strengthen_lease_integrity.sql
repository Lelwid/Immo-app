create or replace function public.validate_lease_integrity()
returns trigger
language plpgsql
as $$
declare
  unit_property_id uuid;
  tenant_owner_id uuid;
  tenant_archived_at timestamptz;
begin
  select property_id
    into unit_property_id
    from public.units
    where id = new.unit_id;

  if unit_property_id is null or unit_property_id <> new.property_id then
    raise exception 'Le logement ne correspond pas à l''immeuble du bail.';
  end if;

  select user_id, archived_at
    into tenant_owner_id, tenant_archived_at
    from public.tenants
    where id = new.tenant_id;

  if tenant_owner_id is null or tenant_owner_id <> auth.uid() then
    raise exception 'Le locataire ne correspond pas à l''utilisateur courant.';
  end if;

  if new.status = 'active' and tenant_archived_at is not null then
    raise exception 'Un locataire archivé ne peut pas recevoir un bail actif.';
  end if;

  return new;
end;
$$;

drop trigger if exists leases_validate_integrity on public.leases;
create trigger leases_validate_integrity
before insert or update on public.leases
for each row
execute function public.validate_lease_integrity();

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
  and exists (
    select 1
    from public.units
    where units.id = leases.unit_id
      and units.property_id = leases.property_id
  )
  and exists (
    select 1
    from public.tenants
    where tenants.id = leases.tenant_id
      and tenants.user_id = auth.uid()
      and (leases.status <> 'active' or tenants.archived_at is null)
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
  and exists (
    select 1
    from public.units
    where units.id = leases.unit_id
      and units.property_id = leases.property_id
  )
  and exists (
    select 1
    from public.tenants
    where tenants.id = leases.tenant_id
      and tenants.user_id = auth.uid()
      and (leases.status <> 'active' or tenants.archived_at is null)
  )
);
