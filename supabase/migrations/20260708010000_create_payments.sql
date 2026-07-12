create extension if not exists pgcrypto;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  lease_id uuid references public.leases(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  amount numeric not null default 0,
  amount_paid numeric not null default 0,
  due_date date not null,
  paid_date date,
  status text not null default 'à venir',
  payment_type text not null default 'loyer',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_status_check check (status in ('payé', 'partiel', 'en retard', 'à venir')),
  constraint payments_type_check check (payment_type in ('loyer', 'frais', 'dépôt', 'autre')),
  constraint payments_amount_check check (amount >= 0 and amount_paid >= 0)
);

create index if not exists payments_user_id_idx on public.payments(user_id);
create index if not exists payments_property_id_idx on public.payments(property_id);
create index if not exists payments_unit_id_idx on public.payments(unit_id);
create index if not exists payments_lease_id_idx on public.payments(lease_id);
create index if not exists payments_tenant_id_idx on public.payments(tenant_id);
create index if not exists payments_due_date_idx on public.payments(due_date);

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
before update on public.payments
for each row
execute function public.set_updated_at();

create or replace function public.validate_payment_integrity()
returns trigger
language plpgsql
as $$
declare
  payment_property_owner uuid;
  unit_property_id uuid;
  lease_property_id uuid;
  lease_unit_id uuid;
  lease_tenant_id uuid;
  tenant_owner_id uuid;
begin
  select user_id
    into payment_property_owner
    from public.properties
    where id = new.property_id;

  if payment_property_owner is null or payment_property_owner <> auth.uid() then
    raise exception 'Le paiement ne correspond pas à un immeuble de l''utilisateur courant.';
  end if;

  if new.user_id <> auth.uid() then
    raise exception 'Le paiement ne correspond pas à l''utilisateur courant.';
  end if;

  if new.unit_id is not null then
    select property_id
      into unit_property_id
      from public.units
      where id = new.unit_id;

    if unit_property_id is null or unit_property_id <> new.property_id then
      raise exception 'Le logement ne correspond pas à l''immeuble du paiement.';
    end if;
  end if;

  if new.lease_id is not null then
    select property_id, unit_id, tenant_id
      into lease_property_id, lease_unit_id, lease_tenant_id
      from public.leases
      where id = new.lease_id;

    if lease_property_id is null or lease_property_id <> new.property_id then
      raise exception 'Le bail ne correspond pas à l''immeuble du paiement.';
    end if;

    if new.unit_id is not null and lease_unit_id <> new.unit_id then
      raise exception 'Le bail ne correspond pas au logement du paiement.';
    end if;

    if new.tenant_id is not null and lease_tenant_id <> new.tenant_id then
      raise exception 'Le locataire ne correspond pas au bail du paiement.';
    end if;
  end if;

  if new.tenant_id is not null then
    select user_id
      into tenant_owner_id
      from public.tenants
      where id = new.tenant_id;

    if tenant_owner_id is null or tenant_owner_id <> auth.uid() then
      raise exception 'Le locataire ne correspond pas à l''utilisateur courant.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists payments_validate_integrity on public.payments;
create trigger payments_validate_integrity
before insert or update on public.payments
for each row
execute function public.validate_payment_integrity();

alter table public.payments enable row level security;

drop policy if exists "Users can select payments for their own properties" on public.payments;
create policy "Users can select payments for their own properties"
on public.payments
for select
using (
  exists (
    select 1
    from public.properties
    where properties.id = payments.property_id
      and properties.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert payments for their own properties" on public.payments;
create policy "Users can insert payments for their own properties"
on public.payments
for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.properties
    where properties.id = payments.property_id
      and properties.user_id = auth.uid()
  )
);

drop policy if exists "Users can update payments for their own properties" on public.payments;
create policy "Users can update payments for their own properties"
on public.payments
for update
using (
  exists (
    select 1
    from public.properties
    where properties.id = payments.property_id
      and properties.user_id = auth.uid()
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.properties
    where properties.id = payments.property_id
      and properties.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete payments for their own properties" on public.payments;
create policy "Users can delete payments for their own properties"
on public.payments
for delete
using (
  exists (
    select 1
    from public.properties
    where properties.id = payments.property_id
      and properties.user_id = auth.uid()
  )
);
