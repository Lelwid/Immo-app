-- Transactional Beta Owner Journey validation. All fixtures are rolled back.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';

create temp table owner_journey_fixture (
  owner_id uuid not null default gen_random_uuid(),
  property_id uuid,
  unit_id uuid,
  tenant_id uuid,
  lease_id uuid
);
insert into owner_journey_fixture default values;

create temp table owner_journey_results (test text primary key, result text not null);
grant select, update on owner_journey_fixture to authenticated;
grant insert, select on owner_journey_results to authenticated;

insert into auth.users(id, aud, role)
select owner_id, 'authenticated', 'authenticated' from owner_journey_fixture;

select set_config('request.jwt.claim.sub', owner_id::text, true) from owner_journey_fixture;
select set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true) from owner_journey_fixture;
set local role authenticated;

do $$
declare
  result jsonb;
begin
  select public.create_owner_portfolio(
    jsonb_build_object(
      'name', 'Duplex Cartier',
      'address', '1000, chemin Sainte-Foy, Québec, QC G1S 2L6, Canada',
      'address_line1', '1000, chemin Sainte-Foy',
      'street_number', '1000',
      'street', 'chemin Sainte-Foy',
      'city', 'Québec',
      'district', 'Montcalm',
      'province', 'Québec',
      'province_code', 'QC',
      'postal_code', 'G1S 2L6',
      'country', 'Canada',
      'country_code', 'ca',
      'address_provider', 'manual',
      'type', 'duplex'
    ),
    jsonb_build_array(
      jsonb_build_object('name', 'Logement 1', 'floor', 'Rez-de-chaussée', 'floor_index', 1, 'sort_order', 1),
      jsonb_build_object('name', 'Logement 2', 'floor', '2e étage', 'floor_index', 2, 'sort_order', 2)
    ),
    jsonb_build_array(
      jsonb_build_object(
        'unit_index', 0,
        'full_name', 'Jean Richard',
        'email', 'jean.richard@example.com',
        'phone', '418-555-0101',
        'monthly_rent', 1236,
        'lease_start_date', '2026-09-01',
        'lease_end_date', '2027-08-31',
        'payment_status', 'dueSoon',
        'initial_amount_paid', 0,
        'payment_received_date', '',
        'notes', 'Donnée fictive du test transactionnel.'
      )
    )
  ) into result;

  if (result->>'unit_count')::integer <> 2 then
    raise exception 'Expected two units, got %', result->>'unit_count';
  end if;

  if coalesce((result->>'already_initialized')::boolean, true) then
    raise exception 'First onboarding call was incorrectly marked as a replay';
  end if;

  insert into owner_journey_results values ('Atomic portfolio creation', 'ok');
end;
$$;

update owner_journey_fixture f
set property_id = p.id
from public.properties p
where p.user_id = f.owner_id;

update owner_journey_fixture f
set unit_id = u.id
from public.units u
where u.property_id = f.property_id and u.name = 'Logement 1';

update owner_journey_fixture f
set tenant_id = t.id
from public.tenants t
where t.user_id = f.owner_id and t.full_name = 'Jean Richard';

update owner_journey_fixture f
set lease_id = l.id
from public.leases l
where l.property_id = f.property_id and l.unit_id = f.unit_id and l.tenant_id = f.tenant_id;

do $$
declare
  f owner_journey_fixture;
  replay_result jsonb;
begin
  select * into f from owner_journey_fixture;

  if (select count(*) from public.properties where user_id = f.owner_id) <> 1 then
    raise exception 'Property count mismatch';
  end if;
  if (select count(*) from public.units where property_id = f.property_id) <> 2 then
    raise exception 'Unit count mismatch';
  end if;
  if (select count(*) from public.tenants where user_id = f.owner_id) <> 1 then
    raise exception 'Tenant count mismatch';
  end if;
  if (select count(*) from public.leases where property_id = f.property_id) <> 1 then
    raise exception 'Lease count mismatch';
  end if;
  if not exists (
    select 1 from public.leases
    where id = f.lease_id and start_date = '2026-09-01' and end_date = '2027-08-31'
      and monthly_rent = 1236 and status = 'active'
  ) then
    raise exception 'Lease values or relations mismatch';
  end if;

  insert into owner_journey_results values ('Property and exact two units', 'ok');
  insert into owner_journey_results values ('Tenant and lease relations', 'ok');

  select public.create_owner_portfolio(
    '{"name":"Duplicate","address":"Duplicate","type":"duplex"}'::jsonb,
    '[{"name":"Logement 1","floor":"1","floor_index":1,"sort_order":1}]'::jsonb,
    '[]'::jsonb
  ) into replay_result;

  if not coalesce((replay_result->>'already_initialized')::boolean, false)
     or replay_result->>'property_id' <> f.property_id::text then
    raise exception 'Onboarding replay did not return the existing portfolio';
  end if;

  if (select count(*) from public.properties where user_id = f.owner_id) <> 1
     or (select count(*) from public.units where property_id = f.property_id) <> 2
     or (select count(*) from public.tenants where user_id = f.owner_id) <> 1
     or (select count(*) from public.leases where property_id = f.property_id) <> 1 then
    raise exception 'Onboarding replay created duplicate rows';
  end if;

  insert into owner_journey_results values ('Onboarding replay is idempotent', 'ok');
end;
$$;

do $$
declare
  f owner_journey_fixture;
  charge_id text;
  transaction_id text := 'payment-transaction-owner-journey';
  allocation_id text := 'payment-allocation-owner-journey';
  duplicate_rejected boolean := false;
begin
  select * into f from owner_journey_fixture;
  charge_id := 'rent-charge-' || f.lease_id::text || '-2026-09';

  perform public.record_rent_payment(
    jsonb_build_object(
      'id', transaction_id,
      'property_id', f.property_id,
      'lease_id', f.lease_id,
      'tenant_id', f.tenant_id,
      'received_at', '2026-08-28',
      'amount_received', 1236,
      'method', 'virement',
      'reference', 'BETA-E2E',
      'notes', 'Paiement fictif reçu avant échéance.'
    ),
    jsonb_build_array(jsonb_build_object(
      'id', charge_id,
      'property_id', f.property_id,
      'unit_id', f.unit_id,
      'lease_id', f.lease_id,
      'tenant_id', f.tenant_id,
      'period_month', '2026-09',
      'due_date', '2026-09-01',
      'amount_due', 1236
    )),
    jsonb_build_array(jsonb_build_object(
      'id', allocation_id,
      'transaction_id', transaction_id,
      'rent_charge_id', charge_id,
      'amount_allocated', 1236
    ))
  );

  if not exists (
    select 1
    from public.rent_charges c
    join public.payment_allocations a on a.rent_charge_id = c.id
    join public.payment_transactions t on t.id = a.transaction_id
    where c.id = charge_id
      and c.due_date = '2026-09-01'
      and c.amount_due = 1236
      and t.received_at = '2026-08-28'
      and t.amount_received = 1236
      and a.amount_allocated = 1236
  ) then
    raise exception 'Ledger values mismatch';
  end if;

  insert into owner_journey_results values ('Due date preserved', 'ok');
  insert into owner_journey_results values ('Real payment date preserved', 'ok');
  insert into owner_journey_results values ('Charge fully allocated with zero balance', 'ok');

  begin
    perform public.record_rent_payment(
      jsonb_build_object('id', transaction_id, 'property_id', f.property_id, 'lease_id', f.lease_id, 'tenant_id', f.tenant_id, 'received_at', '2026-08-28', 'amount_received', 1236, 'method', 'virement'),
      jsonb_build_array(jsonb_build_object('id', charge_id, 'property_id', f.property_id, 'unit_id', f.unit_id, 'lease_id', f.lease_id, 'tenant_id', f.tenant_id, 'period_month', '2026-09', 'due_date', '2026-09-01', 'amount_due', 1236)),
      jsonb_build_array(jsonb_build_object('id', allocation_id, 'transaction_id', transaction_id, 'rent_charge_id', charge_id, 'amount_allocated', 1236))
    );
  exception when unique_violation then
    duplicate_rejected := true;
  end;

  if not duplicate_rejected then
    raise exception 'Duplicate payment replay was accepted';
  end if;

  if (select count(*) from public.payment_transactions where id = transaction_id) <> 1
     or (select count(*) from public.payment_allocations where rent_charge_id = charge_id) <> 1 then
    raise exception 'Duplicate replay changed ledger rows';
  end if;

  insert into owner_journey_results values ('Duplicate payment replay rejected', 'ok');
end;
$$;

select test, result from owner_journey_results order by test;
select
  p.name as property,
  (select count(*) from public.units where property_id = p.id) as unit_count,
  t.full_name as tenant,
  l.monthly_rent as rent,
  l.start_date,
  l.end_date,
  c.due_date,
  pt.received_at,
  c.amount_due - a.amount_allocated as balance
from owner_journey_fixture f
join public.properties p on p.id = f.property_id
join public.tenants t on t.id = f.tenant_id
join public.leases l on l.id = f.lease_id
join public.rent_charges c on c.lease_id = l.id and c.period_month = '2026-09'
join public.payment_allocations a on a.rent_charge_id = c.id
join public.payment_transactions pt on pt.id = a.transaction_id;

reset role;
rollback;
