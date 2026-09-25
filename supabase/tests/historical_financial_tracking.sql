begin;

select set_config(
  'request.jwt.claim.sub',
  (select user_id::text from public.properties order by created_at limit 1),
  true
);
set local role authenticated;

do $$
declare
  owner_id uuid := auth.uid();
  property_id uuid := gen_random_uuid();
  tenant_id uuid := gen_random_uuid();
  active_unit_id uuid := gen_random_uuid();
  historical_unit_id uuid := gen_random_uuid();
  imported_unit_id uuid := gen_random_uuid();
  active_lease_id uuid := gen_random_uuid();
  historical_lease_id uuid := gen_random_uuid();
  imported_lease_id uuid := gen_random_uuid();
  rejected_before_tracking boolean := false;
  rejected_historical_charge boolean := false;
  rejected_duplicate boolean := false;
begin
  if owner_id is null then
    raise exception 'No staging owner is available for the transactional RLS test.';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.leases'::regclass)
    or not (select relrowsecurity from pg_class where oid = 'public.rent_charges'::regclass)
  then
    raise exception 'RLS must remain enabled on leases and rent_charges.';
  end if;

  insert into public.properties(id, user_id, name, address, type)
  values (property_id, owner_id, 'Test suivi financier', 'Adresse fictive', 'triplex');

  insert into public.units(id, property_id, name, floor_index, sort_order)
  values
    (active_unit_id, property_id, 'Test actif', 1, 1),
    (historical_unit_id, property_id, 'Test historique', 2, 2),
    (imported_unit_id, property_id, 'Test importé', 3, 3);

  insert into public.tenants(id, user_id, full_name)
  values (tenant_id, owner_id, 'Locataire Fictif Historique');

  insert into public.leases(
    id, property_id, unit_id, tenant_id, start_date, end_date,
    financial_tracking_start_date, monthly_rent, status
  ) values (
    active_lease_id, property_id, active_unit_id, tenant_id,
    '2025-07-01', '2027-06-30', '2026-09-01', 1200, 'active'
  );

  insert into public.rent_charges(
    id, user_id, property_id, unit_id, lease_id, tenant_id, period_month, due_date, amount_due
  ) values (
    'test-tracking-current', owner_id, property_id, active_unit_id, active_lease_id, tenant_id,
    '2026-09', '2026-09-01', 1200
  );

  begin
    insert into public.rent_charges(
      id, user_id, property_id, unit_id, lease_id, tenant_id, period_month, due_date, amount_due
    ) values (
      'test-tracking-too-early', owner_id, property_id, active_unit_id, active_lease_id, tenant_id,
      '2026-08', '2026-08-01', 1200
    );
  exception when others then
    rejected_before_tracking := true;
  end;

  insert into public.leases(
    id, property_id, unit_id, tenant_id, start_date, end_date,
    financial_tracking_start_date, monthly_rent, status
  ) values (
    historical_lease_id, property_id, historical_unit_id, tenant_id,
    '2025-07-01', '2026-06-30', null, 1200, 'ended'
  );

  begin
    insert into public.rent_charges(
      id, user_id, property_id, unit_id, lease_id, tenant_id, period_month, due_date, amount_due
    ) values (
      'test-historical-disabled', owner_id, property_id, historical_unit_id, historical_lease_id, tenant_id,
      '2025-07', '2025-07-01', 1200
    );
  exception when others then
    rejected_historical_charge := true;
  end;

  insert into public.leases(
    id, property_id, unit_id, tenant_id, start_date, end_date,
    financial_tracking_start_date, monthly_rent, status
  ) values (
    imported_lease_id, property_id, imported_unit_id, tenant_id,
    '2025-07-01', '2026-06-30', '2025-07-01', 1200, 'ended'
  );

  insert into public.rent_charges(
    id, user_id, property_id, unit_id, lease_id, tenant_id, period_month, due_date, amount_due
  ) values (
    'test-historical-import', owner_id, property_id, imported_unit_id, imported_lease_id, tenant_id,
    '2025-07', '2025-07-01', 1200
  );

  begin
    insert into public.rent_charges(
      id, user_id, property_id, unit_id, lease_id, tenant_id, period_month, due_date, amount_due
    ) values (
      'test-historical-import-duplicate', owner_id, property_id, imported_unit_id, imported_lease_id, tenant_id,
      '2025-07', '2025-07-01', 1200
    );
  exception when unique_violation then
    rejected_duplicate := true;
  end;

  if not rejected_before_tracking then
    raise exception 'A charge before financial tracking was accepted.';
  end if;

  if not rejected_historical_charge then
    raise exception 'A charge on a historical-only lease was accepted.';
  end if;

  if not rejected_duplicate then
    raise exception 'A duplicate lease period was accepted.';
  end if;

  if (select count(*) from public.rent_charges where lease_id in (active_lease_id, historical_lease_id, imported_lease_id)) <> 2 then
    raise exception 'Unexpected test charge count.';
  end if;
end;
$$;

select 'historical_financial_tracking_rls_pass' as result;

rollback;
