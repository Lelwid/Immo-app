-- Shared tenant documents and their private files require a matching active lease.
-- This prevents a former tenant from reading documents uploaded after departure.

create or replace function private.tenant_portal_can_read_document(
  check_tenant_id uuid,
  check_lease_id uuid,
  check_unit_id uuid
)
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
    where account.user_id = (select auth.uid())
      and account.status = 'active'
      and lease.status = 'active'
      and case
        when check_lease_id is not null then lease.id = check_lease_id
        when check_tenant_id is not null then lease.tenant_id = check_tenant_id
        when check_unit_id is not null then lease.unit_id = check_unit_id
        else false
      end
  );
$$;

revoke all on function private.tenant_portal_can_read_document(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function private.tenant_portal_can_read_document(uuid, uuid, uuid) to authenticated;

drop policy if exists "Tenant portal users can select shared documents" on public.documents;
create policy "Tenant portal users can select shared documents"
on public.documents
for select
to authenticated
using (
  visibility = 'tenant'
  and private.tenant_portal_can_read_document(tenant_id, lease_id, unit_id)
);

drop policy if exists "Users can read shared tenant document files" on storage.objects;
create policy "Users can read shared tenant document files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documents'
  and exists (
    select 1
    from public.documents
    where documents.storage_path = storage.objects.name
      and documents.visibility = 'tenant'
      and private.tenant_portal_can_read_document(documents.tenant_id, documents.lease_id, documents.unit_id)
  )
);
