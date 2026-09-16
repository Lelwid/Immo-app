-- Beta security gate: least privilege, active-lease tenant scoping, immutable invitations,
-- and bounded private storage uploads.

-- Public API roles only receive the DML verbs used by the application.
revoke all on table
  public.activities,
  public.document_ai_extractions,
  public.documents,
  public.leases,
  public.maintenance_request_attachments,
  public.maintenance_requests,
  public.notes,
  public.payment_allocations,
  public.payment_transactions,
  public.payments,
  public.properties,
  public.rent_charges,
  public.tasks,
  public.tenant_portal_invitations,
  public.tenants,
  public.units
from anon, authenticated;

grant select, insert, update, delete on table
  public.activities,
  public.document_ai_extractions,
  public.documents,
  public.leases,
  public.maintenance_requests,
  public.notes,
  public.payment_allocations,
  public.payment_transactions,
  public.payments,
  public.properties,
  public.rent_charges,
  public.tasks,
  public.tenant_portal_accounts,
  public.tenant_portal_invitations,
  public.tenants,
  public.units
to authenticated;

grant select, insert on table public.maintenance_request_attachments to authenticated;
grant select, update, delete on table public.tenant_portal_accounts to authenticated;

drop policy if exists "Owners can manage tenant portal accounts" on public.tenant_portal_accounts;
drop policy if exists "Owners can select tenant portal accounts" on public.tenant_portal_accounts;
create policy "Owners can select tenant portal accounts"
on public.tenant_portal_accounts for select to authenticated
using (owner_user_id = (select auth.uid()));

drop policy if exists "Owners can update tenant portal accounts" on public.tenant_portal_accounts;
create policy "Owners can update tenant portal accounts"
on public.tenant_portal_accounts for update to authenticated
using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()));

drop policy if exists "Owners can delete tenant portal accounts" on public.tenant_portal_accounts;
create policy "Owners can delete tenant portal accounts"
on public.tenant_portal_accounts for delete to authenticated
using (owner_user_id = (select auth.uid()));

create or replace function public.validate_tenant_portal_account()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  tenant_owner_id uuid;
begin
  if tg_op = 'UPDATE' then
    new.user_id = old.user_id;
    new.tenant_id = old.tenant_id;
    new.owner_user_id = old.owner_user_id;
    new.invited_at = old.invited_at;
    new.activated_at = old.activated_at;
    new.created_at = old.created_at;
  end if;

  select user_id into tenant_owner_id
  from public.tenants
  where id = new.tenant_id;

  if tenant_owner_id is null or new.owner_user_id <> tenant_owner_id then
    raise exception 'Le compte portail ne correspond pas au propriétaire du locataire.';
  end if;

  if new.status = 'disabled' and new.disabled_at is null then
    new.disabled_at = now();
  elsif new.status = 'active' then
    new.disabled_at = null;
    new.activated_at = coalesce(new.activated_at, now());
  end if;

  return new;
end;
$$;

-- Property and unit access through the tenant portal is valid only for an active lease.
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
      and lease.status = 'active'
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
      and lease.status = 'active'
      and account.user_id = (select auth.uid())
      and account.status = 'active'
  );
$$;

revoke all on function private.tenant_portal_can_read_unit(uuid) from public, anon, authenticated;
grant execute on function private.tenant_portal_can_read_unit(uuid) to authenticated;

drop policy if exists "Tenant portal users can select shared documents" on public.documents;
create policy "Tenant portal users can select shared documents"
on public.documents
for select
to authenticated
using (
  visibility = 'tenant'
  and (
    public.tenant_portal_has_access(tenant_id)
    or exists (
      select 1
      from public.leases
      where leases.id = documents.lease_id
        and public.tenant_portal_has_access(leases.tenant_id)
    )
    or private.tenant_portal_can_read_unit(documents.unit_id)
  )
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
      and (
        public.tenant_portal_has_access(documents.tenant_id)
        or exists (
          select 1
          from public.leases
          where leases.id = documents.lease_id
            and public.tenant_portal_has_access(leases.tenant_id)
        )
        or private.tenant_portal_can_read_unit(documents.unit_id)
      )
  )
);

-- A portal upload path must reference an existing request owned by the same tenant.
drop policy if exists "Tenant portal users can upload maintenance attachment files" on storage.objects;
create policy "Tenant portal users can upload maintenance attachment files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'maintenance-attachments'
  and exists (
    select 1
    from public.tenant_portal_accounts as account
    join public.maintenance_requests as request
      on request.tenant_id = account.tenant_id
     and request.user_id = account.owner_user_id
    where account.user_id = (select auth.uid())
      and account.status = 'active'
      and account.owner_user_id::text = (storage.foldername(name))[1]
      and account.tenant_id::text = (storage.foldername(name))[2]
      and request.id::text = (storage.foldername(name))[3]
  )
);

-- Always generate invitation secrets in the database and freeze invitation identity.
create or replace function public.validate_tenant_portal_invitation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  tenant_owner_id uuid;
  current_email text;
begin
  select user_id into tenant_owner_id
  from public.tenants
  where id = new.tenant_id;

  if tenant_owner_id is null then
    raise exception 'Locataire introuvable pour l''invitation.';
  end if;

  if new.owner_user_id <> tenant_owner_id or new.invited_by <> tenant_owner_id then
    raise exception 'L''invitation ne correspond pas au propriétaire du locataire.';
  end if;

  new.email = lower(trim(new.email));
  if length(new.email) > 320 or position('@' in new.email) < 2 then
    raise exception 'Adresse courriel invalide.';
  end if;

  if tg_op = 'INSERT' then
    new.token = encode(extensions.gen_random_bytes(32), 'hex');
    new.status = 'pending';
    new.expires_at = now() + interval '14 days';
    new.accepted_by = null;
    new.accepted_at = null;
    new.revoked_at = null;
  else
    new.tenant_id = old.tenant_id;
    new.owner_user_id = old.owner_user_id;
    new.invited_by = old.invited_by;
    new.email = old.email;
    new.token = old.token;
    new.expires_at = old.expires_at;
    new.created_at = old.created_at;

    if old.status <> 'pending' then
      new.status = old.status;
      new.accepted_by = old.accepted_by;
      new.accepted_at = old.accepted_at;
      new.revoked_at = old.revoked_at;
      return new;
    end if;

    if new.status = 'accepted' and old.status = 'pending' then
      current_email = lower(coalesce(auth.jwt() ->> 'email', ''));
      if new.accepted_by is distinct from (select auth.uid()) or current_email = '' or current_email <> old.email then
        raise exception 'Cette invitation ne peut pas être acceptée par ce compte.';
      end if;
      new.accepted_at = coalesce(new.accepted_at, now());
      new.revoked_at = null;
    elsif new.status = 'revoked' and old.status = 'pending' then
      new.accepted_by = null;
      new.accepted_at = null;
      new.revoked_at = coalesce(new.revoked_at, now());
    elsif new.status <> old.status then
      raise exception 'Transition d''invitation invalide.';
    else
      new.accepted_by = null;
      new.accepted_at = null;
      new.revoked_at = null;
    end if;
  end if;

  return new;
end;
$$;

alter function public.set_updated_at() set search_path = '';
alter function public.validate_lease_integrity() set search_path = '';
alter function public.validate_payment_integrity() set search_path = '';
alter function public.validate_note_or_activity_integrity() set search_path = '';
alter function public.validate_document_integrity() set search_path = '';
alter function public.validate_maintenance_request_integrity() set search_path = '';
alter function public.validate_task_integrity() set search_path = '';
alter function public.validate_rent_charge_integrity() set search_path = '';
alter function public.validate_payment_transaction_integrity() set search_path = '';
alter function public.validate_payment_allocation_integrity() set search_path = '';
alter function public.validate_document_ai_extraction_integrity() set search_path = '';
alter function public.validate_tenant_portal_account() set search_path = '';
alter function public.tenant_portal_has_access(uuid) set search_path = '';
alter function public.accept_tenant_portal_invitation(text) set search_path = '';

revoke all on function public.accept_tenant_portal_invitation(text) from public, anon;
grant execute on function public.accept_tenant_portal_invitation(text) to authenticated;

-- Storage enforces private buckets, MIME allowlists and upload size ceilings.
update storage.buckets
set public = false,
    file_size_limit = 20971520,
    allowed_mime_types = array[
      'application/msword',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]::text[]
where id = 'documents';

update storage.buckets
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
where id = 'maintenance-attachments';

alter table public.documents
  drop constraint if exists documents_size_security_check;
alter table public.documents
  add constraint documents_size_security_check
  check (size_bytes is null or size_bytes between 0 and 20971520) not valid;

alter table public.maintenance_request_attachments
  drop constraint if exists maintenance_attachments_size_security_check;
alter table public.maintenance_request_attachments
  add constraint maintenance_attachments_size_security_check
  check (size_bytes is null or size_bytes between 0 and 10485760) not valid;
