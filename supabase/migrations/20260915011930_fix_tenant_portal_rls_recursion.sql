-- Break leases (owner SELECT) -> properties (portal SELECT) -> leases.
-- Also break leases (owner INSERT/UPDATE checks) -> units (portal SELECT) -> leases.
-- Keep the original portal migration and every owner policy unchanged.
create schema if not exists private;
grant usage on schema private to authenticated;

-- Internal boolean lookup: no caller-supplied identity and no returned row data.
-- The migration owner must own leases/accounts or have BYPASSRLS (Supabase postgres).
create or replace function private.tenant_portal_can_read_property(check_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.leases as lease
    join public.tenant_portal_accounts as account
      on account.tenant_id = lease.tenant_id
    where lease.property_id = check_property_id
      and account.user_id = (select auth.uid())
      and account.status = 'active'
  );
$$;

revoke all on function private.tenant_portal_can_read_property(uuid) from public, anon, authenticated;
grant execute on function private.tenant_portal_can_read_property(uuid) to authenticated;

create or replace function private.tenant_portal_can_read_unit(check_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.leases as lease
    join public.tenant_portal_accounts as account
      on account.tenant_id = lease.tenant_id
    where lease.unit_id = check_unit_id
      and account.user_id = (select auth.uid())
      and account.status = 'active'
  );
$$;

revoke all on function private.tenant_portal_can_read_unit(uuid) from public, anon, authenticated;
grant execute on function private.tenant_portal_can_read_unit(uuid) to authenticated;

alter policy "Tenant portal users can select their lease properties"
on public.properties
using (private.tenant_portal_can_read_property(id));

alter policy "Tenant portal users can select their units"
on public.units
using (private.tenant_portal_can_read_unit(id));
