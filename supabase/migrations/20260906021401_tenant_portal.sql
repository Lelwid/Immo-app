create extension if not exists pgcrypto;

create table if not exists public.tenant_portal_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active',
  invited_at timestamptz,
  activated_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_portal_accounts_status_check check (status in ('active', 'disabled')),
  constraint tenant_portal_accounts_unique unique (user_id, tenant_id)
);

create index if not exists tenant_portal_accounts_user_id_idx on public.tenant_portal_accounts(user_id);
create index if not exists tenant_portal_accounts_tenant_id_idx on public.tenant_portal_accounts(tenant_id);
create index if not exists tenant_portal_accounts_owner_user_id_idx on public.tenant_portal_accounts(owner_user_id);

drop trigger if exists tenant_portal_accounts_set_updated_at on public.tenant_portal_accounts;
create trigger tenant_portal_accounts_set_updated_at
before update on public.tenant_portal_accounts
for each row
execute function public.set_updated_at();

create table if not exists public.tenant_portal_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  email text not null,
  token text not null unique default encode(extensions.gen_random_bytes(32), 'hex'),
  status text not null default 'pending',
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_portal_invitations_status_check check (status in ('pending', 'accepted', 'revoked', 'expired'))
);

create index if not exists tenant_portal_invitations_tenant_id_idx on public.tenant_portal_invitations(tenant_id);
create index if not exists tenant_portal_invitations_owner_user_id_idx on public.tenant_portal_invitations(owner_user_id);
create index if not exists tenant_portal_invitations_email_idx on public.tenant_portal_invitations(lower(email));
create index if not exists tenant_portal_invitations_token_idx on public.tenant_portal_invitations(token);

drop trigger if exists tenant_portal_invitations_set_updated_at on public.tenant_portal_invitations;
create trigger tenant_portal_invitations_set_updated_at
before update on public.tenant_portal_invitations
for each row
execute function public.set_updated_at();

alter table public.documents
add column if not exists visibility text not null default 'private';

alter table public.documents
drop constraint if exists documents_visibility_check;

alter table public.documents
add constraint documents_visibility_check check (visibility in ('private', 'tenant'));

create table if not exists public.maintenance_request_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  maintenance_request_id uuid not null references public.maintenance_requests(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete set null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes integer,
  created_at timestamptz not null default now(),
  constraint maintenance_request_attachments_size_check check (size_bytes is null or size_bytes >= 0)
);

create index if not exists maintenance_request_attachments_user_id_idx on public.maintenance_request_attachments(user_id);
create index if not exists maintenance_request_attachments_request_id_idx on public.maintenance_request_attachments(maintenance_request_id);
create index if not exists maintenance_request_attachments_tenant_id_idx on public.maintenance_request_attachments(tenant_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('maintenance-attachments', 'maintenance-attachments', false, 20971520)
on conflict (id) do update
set public = false,
    file_size_limit = 20971520;

create or replace function public.validate_tenant_portal_account()
returns trigger
language plpgsql
as $$
declare
  tenant_owner_id uuid;
begin
  select user_id into tenant_owner_id
  from public.tenants
  where id = new.tenant_id;

  if tenant_owner_id is null then
    raise exception 'Locataire introuvable pour le portail.';
  end if;

  if new.owner_user_id <> tenant_owner_id then
    raise exception 'Le compte portail ne correspond pas au propriétaire du locataire.';
  end if;

  if new.status = 'disabled' and new.disabled_at is null then
    new.disabled_at = now();
  end if;

  if new.status = 'active' then
    new.disabled_at = null;
  end if;

  return new;
end;
$$;

drop trigger if exists tenant_portal_accounts_validate on public.tenant_portal_accounts;
create trigger tenant_portal_accounts_validate
before insert or update on public.tenant_portal_accounts
for each row
execute function public.validate_tenant_portal_account();

create or replace function public.validate_tenant_portal_invitation()
returns trigger
language plpgsql
as $$
declare
  tenant_owner_id uuid;
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

  return new;
end;
$$;

drop trigger if exists tenant_portal_invitations_validate on public.tenant_portal_invitations;
create trigger tenant_portal_invitations_validate
before insert or update on public.tenant_portal_invitations
for each row
execute function public.validate_tenant_portal_invitation();

create or replace function public.tenant_portal_has_access(check_tenant_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_portal_accounts
    where tenant_portal_accounts.tenant_id = check_tenant_id
      and tenant_portal_accounts.user_id = (select auth.uid())
      and tenant_portal_accounts.status = 'active'
  );
$$;

create or replace function public.accept_tenant_portal_invitation(invitation_token text)
returns public.tenant_portal_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  current_email text;
  invitation public.tenant_portal_invitations;
  accepted_account public.tenant_portal_accounts;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise.';
  end if;

  current_email = lower(coalesce(auth.jwt() ->> 'email', ''));

  select *
    into invitation
    from public.tenant_portal_invitations
    where token = invitation_token
      and status = 'pending'
      and expires_at > now()
    for update;

  if invitation.id is null then
    raise exception 'Invitation introuvable ou expirée.';
  end if;

  if current_email = '' or lower(invitation.email) <> current_email then
    raise exception 'Cette invitation ne correspond pas au compte connecté.';
  end if;

  insert into public.tenant_portal_accounts (
    user_id,
    tenant_id,
    owner_user_id,
    status,
    invited_at,
    activated_at
  )
  values (
    auth.uid(),
    invitation.tenant_id,
    invitation.owner_user_id,
    'active',
    invitation.created_at,
    now()
  )
  on conflict (user_id, tenant_id)
  do update set
    owner_user_id = excluded.owner_user_id,
    status = 'active',
    disabled_at = null,
    activated_at = coalesce(public.tenant_portal_accounts.activated_at, now())
  returning * into accepted_account;

  update public.tenant_portal_invitations
  set status = 'accepted',
      accepted_by = auth.uid(),
      accepted_at = now()
  where id = invitation.id;

  return accepted_account;
end;
$$;

revoke all on function public.accept_tenant_portal_invitation(text) from public;
grant execute on function public.accept_tenant_portal_invitation(text) to authenticated;

create or replace function public.validate_maintenance_request_integrity()
returns trigger
language plpgsql
as $$
declare
  checked_property_owner uuid;
  checked_unit_property_id uuid;
  checked_tenant_owner_id uuid;
  tenant_has_active_lease boolean;
  owner_write boolean;
  tenant_portal_write boolean;
begin
  select user_id
    into checked_property_owner
    from public.properties
    where id = new.property_id;

  if checked_property_owner is null then
    raise exception 'L''immeuble de la demande est introuvable.';
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

    if checked_tenant_owner_id is null or checked_tenant_owner_id <> checked_property_owner then
      raise exception 'Le locataire de la demande ne correspond pas au propriétaire de l''immeuble.';
    end if;
  end if;

  owner_write = new.user_id = (select auth.uid()) and checked_property_owner = (select auth.uid());
  tenant_has_active_lease = exists (
    select 1
    from public.leases
    where leases.tenant_id = new.tenant_id
      and leases.property_id = new.property_id
      and leases.unit_id = new.unit_id
      and leases.status = 'active'
  );
  tenant_portal_write = new.tenant_id is not null
    and new.user_id = checked_property_owner
    and tenant_has_active_lease
    and public.tenant_portal_has_access(new.tenant_id);

  if not owner_write and not tenant_portal_write then
    raise exception 'La demande d''entretien ne correspond pas à l''utilisateur courant.';
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

alter table public.tenant_portal_accounts enable row level security;
alter table public.tenant_portal_invitations enable row level security;
alter table public.maintenance_request_attachments enable row level security;

drop policy if exists "Owners can manage tenant portal accounts" on public.tenant_portal_accounts;
create policy "Owners can manage tenant portal accounts"
on public.tenant_portal_accounts
for all
to authenticated
using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()));

drop policy if exists "Tenant portal users can select their account links" on public.tenant_portal_accounts;
create policy "Tenant portal users can select their account links"
on public.tenant_portal_accounts
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Owners can manage tenant portal invitations" on public.tenant_portal_invitations;
create policy "Owners can manage tenant portal invitations"
on public.tenant_portal_invitations
for all
to authenticated
using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()));

drop policy if exists "Invitees can view their pending tenant portal invitations" on public.tenant_portal_invitations;
create policy "Invitees can view their pending tenant portal invitations"
on public.tenant_portal_invitations
for select
to authenticated
using (
  status = 'pending'
  and expires_at > now()
  and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists "Tenant portal users can select their tenant profile" on public.tenants;
create policy "Tenant portal users can select their tenant profile"
on public.tenants
for select
to authenticated
using (public.tenant_portal_has_access(id));

drop policy if exists "Tenant portal users can select their leases" on public.leases;
create policy "Tenant portal users can select their leases"
on public.leases
for select
to authenticated
using (public.tenant_portal_has_access(tenant_id));

drop policy if exists "Tenant portal users can select their units" on public.units;
create policy "Tenant portal users can select their units"
on public.units
for select
to authenticated
using (
  exists (
    select 1
    from public.leases
    where leases.unit_id = units.id
      and public.tenant_portal_has_access(leases.tenant_id)
  )
);

drop policy if exists "Tenant portal users can select their lease properties" on public.properties;
create policy "Tenant portal users can select their lease properties"
on public.properties
for select
to authenticated
using (
  exists (
    select 1
    from public.leases
    where leases.property_id = properties.id
      and public.tenant_portal_has_access(leases.tenant_id)
  )
);

drop policy if exists "Tenant portal users can select their rent charges" on public.rent_charges;
create policy "Tenant portal users can select their rent charges"
on public.rent_charges
for select
to authenticated
using (
  public.tenant_portal_has_access(tenant_id)
  or exists (
    select 1
    from public.leases
    where leases.id = rent_charges.lease_id
      and public.tenant_portal_has_access(leases.tenant_id)
  )
);

drop policy if exists "Tenant portal users can select their payment transactions" on public.payment_transactions;
create policy "Tenant portal users can select their payment transactions"
on public.payment_transactions
for select
to authenticated
using (
  public.tenant_portal_has_access(tenant_id)
  or exists (
    select 1
    from public.leases
    where leases.id = payment_transactions.lease_id
      and public.tenant_portal_has_access(leases.tenant_id)
  )
);

drop policy if exists "Tenant portal users can select their payment allocations" on public.payment_allocations;
create policy "Tenant portal users can select their payment allocations"
on public.payment_allocations
for select
to authenticated
using (
  exists (
    select 1
    from public.rent_charges
    where rent_charges.id = payment_allocations.rent_charge_id
      and (
        public.tenant_portal_has_access(rent_charges.tenant_id)
        or exists (
          select 1
          from public.leases
          where leases.id = rent_charges.lease_id
            and public.tenant_portal_has_access(leases.tenant_id)
        )
      )
  )
);

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
    or exists (
      select 1
      from public.leases
      where leases.unit_id = documents.unit_id
        and public.tenant_portal_has_access(leases.tenant_id)
    )
  )
);

drop policy if exists "Tenant portal users can select their maintenance requests" on public.maintenance_requests;
create policy "Tenant portal users can select their maintenance requests"
on public.maintenance_requests
for select
to authenticated
using (public.tenant_portal_has_access(tenant_id));

drop policy if exists "Tenant portal users can create maintenance requests" on public.maintenance_requests;
create policy "Tenant portal users can create maintenance requests"
on public.maintenance_requests
for insert
to authenticated
with check (
  status = 'open'
  and tenant_id is not null
  and user_id in (
    select owner_user_id
    from public.tenant_portal_accounts
    where tenant_portal_accounts.user_id = (select auth.uid())
      and tenant_portal_accounts.tenant_id = maintenance_requests.tenant_id
      and tenant_portal_accounts.status = 'active'
  )
);

drop policy if exists "Owners can select maintenance attachments" on public.maintenance_request_attachments;
create policy "Owners can select maintenance attachments"
on public.maintenance_request_attachments
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Tenant portal users can select their maintenance attachments" on public.maintenance_request_attachments;
create policy "Tenant portal users can select their maintenance attachments"
on public.maintenance_request_attachments
for select
to authenticated
using (public.tenant_portal_has_access(tenant_id));

drop policy if exists "Tenant portal users can create maintenance attachments" on public.maintenance_request_attachments;
create policy "Tenant portal users can create maintenance attachments"
on public.maintenance_request_attachments
for insert
to authenticated
with check (
  tenant_id is not null
  and public.tenant_portal_has_access(tenant_id)
  and exists (
    select 1
    from public.maintenance_requests
    where maintenance_requests.id = maintenance_request_attachments.maintenance_request_id
      and maintenance_requests.tenant_id = maintenance_request_attachments.tenant_id
      and maintenance_requests.user_id = maintenance_request_attachments.user_id
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
        or exists (
          select 1
          from public.leases
          where leases.unit_id = documents.unit_id
            and public.tenant_portal_has_access(leases.tenant_id)
        )
      )
  )
);

drop policy if exists "Owners can manage maintenance attachment files" on storage.objects;
create policy "Owners can manage maintenance attachment files"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'maintenance-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'maintenance-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Tenant portal users can upload maintenance attachment files" on storage.objects;
create policy "Tenant portal users can upload maintenance attachment files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'maintenance-attachments'
  and exists (
    select 1
    from public.tenant_portal_accounts
    where tenant_portal_accounts.user_id = (select auth.uid())
      and tenant_portal_accounts.status = 'active'
      and tenant_portal_accounts.owner_user_id::text = (storage.foldername(name))[1]
      and tenant_portal_accounts.tenant_id::text = (storage.foldername(name))[2]
  )
);

drop policy if exists "Tenant portal users can read their maintenance attachment files" on storage.objects;
create policy "Tenant portal users can read their maintenance attachment files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'maintenance-attachments'
  and exists (
    select 1
    from public.maintenance_request_attachments
    where maintenance_request_attachments.storage_path = storage.objects.name
      and public.tenant_portal_has_access(maintenance_request_attachments.tenant_id)
  )
);
