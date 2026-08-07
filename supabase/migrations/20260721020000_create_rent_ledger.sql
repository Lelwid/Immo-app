create extension if not exists pgcrypto;

create table if not exists public.rent_charges (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  lease_id uuid not null references public.leases(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete set null,
  period_month text not null,
  due_date date not null,
  amount_due numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rent_charges_amount_due_check check (amount_due >= 0),
  constraint rent_charges_period_month_check check (period_month ~ '^\d{4}-\d{2}$'),
  constraint rent_charges_lease_period_unique unique (lease_id, period_month)
);

create table if not exists public.payment_transactions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  lease_id uuid references public.leases(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  received_at date not null,
  amount_received numeric not null default 0,
  method text not null default 'virement',
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_transactions_amount_check check (amount_received > 0),
  constraint payment_transactions_method_check check (method in ('virement', 'interac', 'cheque', 'especes', 'carte', 'autre'))
);

create table if not exists public.payment_allocations (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id text not null references public.payment_transactions(id) on delete cascade,
  rent_charge_id text not null references public.rent_charges(id) on delete cascade,
  amount_allocated numeric not null default 0,
  created_at timestamptz not null default now(),
  constraint payment_allocations_amount_check check (amount_allocated > 0),
  constraint payment_allocations_unique unique (transaction_id, rent_charge_id)
);

create index if not exists rent_charges_user_id_idx on public.rent_charges(user_id);
create index if not exists rent_charges_property_id_idx on public.rent_charges(property_id);
create index if not exists rent_charges_unit_id_idx on public.rent_charges(unit_id);
create index if not exists rent_charges_lease_id_idx on public.rent_charges(lease_id);
create index if not exists rent_charges_tenant_id_idx on public.rent_charges(tenant_id);
create index if not exists rent_charges_due_date_idx on public.rent_charges(due_date);
create index if not exists payment_transactions_user_id_idx on public.payment_transactions(user_id);
create index if not exists payment_transactions_property_id_idx on public.payment_transactions(property_id);
create index if not exists payment_transactions_received_at_idx on public.payment_transactions(received_at);
create index if not exists payment_allocations_user_id_idx on public.payment_allocations(user_id);
create index if not exists payment_allocations_transaction_id_idx on public.payment_allocations(transaction_id);
create index if not exists payment_allocations_rent_charge_id_idx on public.payment_allocations(rent_charge_id);

drop trigger if exists rent_charges_set_updated_at on public.rent_charges;
create trigger rent_charges_set_updated_at
before update on public.rent_charges
for each row
execute function public.set_updated_at();

drop trigger if exists payment_transactions_set_updated_at on public.payment_transactions;
create trigger payment_transactions_set_updated_at
before update on public.payment_transactions
for each row
execute function public.set_updated_at();

create or replace function public.validate_rent_charge_integrity()
returns trigger
language plpgsql
as $$
declare
  property_owner uuid;
  unit_property_id uuid;
  lease_property_id uuid;
  lease_unit_id uuid;
  lease_tenant_id uuid;
  tenant_owner_id uuid;
begin
  select user_id into property_owner from public.properties where id = new.property_id;

  if property_owner is null or property_owner <> auth.uid() then
    raise exception 'Le loyer exigible ne correspond pas à un immeuble de l''utilisateur courant.';
  end if;

  if new.user_id <> auth.uid() then
    raise exception 'Le loyer exigible ne correspond pas à l''utilisateur courant.';
  end if;

  select property_id into unit_property_id from public.units where id = new.unit_id;
  if unit_property_id is null or unit_property_id <> new.property_id then
    raise exception 'Le logement ne correspond pas à l''immeuble du loyer exigible.';
  end if;

  select property_id, unit_id, tenant_id
    into lease_property_id, lease_unit_id, lease_tenant_id
    from public.leases
    where id = new.lease_id;

  if lease_property_id is null or lease_property_id <> new.property_id then
    raise exception 'Le bail ne correspond pas à l''immeuble du loyer exigible.';
  end if;

  if lease_unit_id <> new.unit_id then
    raise exception 'Le bail ne correspond pas au logement du loyer exigible.';
  end if;

  if new.tenant_id is not null and lease_tenant_id <> new.tenant_id then
    raise exception 'Le locataire ne correspond pas au bail du loyer exigible.';
  end if;

  if new.tenant_id is not null then
    select user_id into tenant_owner_id from public.tenants where id = new.tenant_id;
    if tenant_owner_id is null or tenant_owner_id <> auth.uid() then
      raise exception 'Le locataire ne correspond pas à l''utilisateur courant.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.validate_payment_transaction_integrity()
returns trigger
language plpgsql
as $$
declare
  property_owner uuid;
  lease_property_id uuid;
  lease_tenant_id uuid;
  tenant_owner_id uuid;
begin
  select user_id into property_owner from public.properties where id = new.property_id;

  if property_owner is null or property_owner <> auth.uid() then
    raise exception 'Le paiement ne correspond pas à un immeuble de l''utilisateur courant.';
  end if;

  if new.user_id <> auth.uid() then
    raise exception 'Le paiement ne correspond pas à l''utilisateur courant.';
  end if;

  if new.lease_id is not null then
    select property_id, tenant_id
      into lease_property_id, lease_tenant_id
      from public.leases
      where id = new.lease_id;

    if lease_property_id is null or lease_property_id <> new.property_id then
      raise exception 'Le bail ne correspond pas à l''immeuble du paiement.';
    end if;

    if new.tenant_id is not null and lease_tenant_id <> new.tenant_id then
      raise exception 'Le locataire ne correspond pas au bail du paiement.';
    end if;
  end if;

  if new.tenant_id is not null then
    select user_id into tenant_owner_id from public.tenants where id = new.tenant_id;
    if tenant_owner_id is null or tenant_owner_id <> auth.uid() then
      raise exception 'Le locataire ne correspond pas à l''utilisateur courant.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.validate_payment_allocation_integrity()
returns trigger
language plpgsql
as $$
declare
  transaction_owner uuid;
  charge_owner uuid;
  transaction_property_id uuid;
  charge_property_id uuid;
begin
  select user_id, property_id
    into transaction_owner, transaction_property_id
    from public.payment_transactions
    where id = new.transaction_id;

  select user_id, property_id
    into charge_owner, charge_property_id
    from public.rent_charges
    where id = new.rent_charge_id;

  if transaction_owner is null or charge_owner is null then
    raise exception 'Le paiement ou le loyer exigible est introuvable.';
  end if;

  if new.user_id <> auth.uid() or transaction_owner <> auth.uid() or charge_owner <> auth.uid() then
    raise exception 'La répartition du paiement ne correspond pas à l''utilisateur courant.';
  end if;

  if transaction_property_id <> charge_property_id then
    raise exception 'Le paiement et le loyer exigible ne correspondent pas au même immeuble.';
  end if;

  return new;
end;
$$;

drop trigger if exists rent_charges_validate_integrity on public.rent_charges;
create trigger rent_charges_validate_integrity
before insert or update on public.rent_charges
for each row
execute function public.validate_rent_charge_integrity();

drop trigger if exists payment_transactions_validate_integrity on public.payment_transactions;
create trigger payment_transactions_validate_integrity
before insert or update on public.payment_transactions
for each row
execute function public.validate_payment_transaction_integrity();

drop trigger if exists payment_allocations_validate_integrity on public.payment_allocations;
create trigger payment_allocations_validate_integrity
before insert or update on public.payment_allocations
for each row
execute function public.validate_payment_allocation_integrity();

alter table public.rent_charges enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.payment_allocations enable row level security;

drop policy if exists "Users can manage their rent charges" on public.rent_charges;
create policy "Users can manage their rent charges"
on public.rent_charges
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can manage their payment transactions" on public.payment_transactions;
create policy "Users can manage their payment transactions"
on public.payment_transactions
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can manage their payment allocations" on public.payment_allocations;
create policy "Users can manage their payment allocations"
on public.payment_allocations
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());
