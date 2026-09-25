create or replace function public.create_owner_portfolio(
  p_property jsonb,
  p_units jsonb,
  p_occupancies jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  existing_property_id uuid;
  existing_unit_count integer;
  new_property_id uuid;
  new_unit_id uuid;
  new_tenant_id uuid;
  new_lease_id uuid;
  unit_item jsonb;
  occupancy_item jsonb;
  unit_ids uuid[] := array[]::uuid[];
  unit_index integer;
  payment_status text;
  amount_paid numeric;
  charge_id text;
  transaction_id text;
  payment_received_date date;
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));

  select properties.id
  into existing_property_id
  from public.properties
  where properties.user_id = current_user_id
  order by properties.created_at, properties.id
  limit 1;

  if existing_property_id is not null then
    select count(*)::integer
    into existing_unit_count
    from public.units
    where units.property_id = existing_property_id;

    return jsonb_build_object(
      'property_id', existing_property_id,
      'unit_count', existing_unit_count,
      'already_initialized', true
    );
  end if;

  if nullif(trim(p_property->>'name'), '') is null or nullif(trim(p_property->>'address'), '') is null then
    raise exception 'invalid_property';
  end if;

  if jsonb_typeof(p_units) <> 'array' or jsonb_array_length(p_units) < 1 then
    raise exception 'invalid_units';
  end if;

  insert into public.properties (
    user_id, name, address, address_line1, street_number, street, city, district,
    province, province_code, postal_code, country, country_code, latitude, longitude,
    address_provider, address_provider_id, type
  ) values (
    current_user_id,
    trim(p_property->>'name'),
    trim(p_property->>'address'),
    nullif(trim(p_property->>'address_line1'), ''),
    nullif(trim(p_property->>'street_number'), ''),
    nullif(trim(p_property->>'street'), ''),
    nullif(trim(p_property->>'city'), ''),
    nullif(trim(p_property->>'district'), ''),
    nullif(trim(p_property->>'province'), ''),
    nullif(trim(p_property->>'province_code'), ''),
    nullif(trim(p_property->>'postal_code'), ''),
    nullif(trim(p_property->>'country'), ''),
    nullif(trim(p_property->>'country_code'), ''),
    nullif(p_property->>'latitude', '')::double precision,
    nullif(p_property->>'longitude', '')::double precision,
    nullif(trim(p_property->>'address_provider'), ''),
    nullif(trim(p_property->>'address_provider_id'), ''),
    p_property->>'type'
  )
  returning id into new_property_id;

  for unit_item in select value from jsonb_array_elements(p_units)
  loop
    insert into public.units (
      property_id, name, floor, floor_index, sort_order, monthly_rent, status, tenant_id, alerts_count
    ) values (
      new_property_id,
      unit_item->>'name',
      nullif(unit_item->>'floor', ''),
      (unit_item->>'floor_index')::integer,
      (unit_item->>'sort_order')::integer,
      0,
      'vacant',
      null,
      0
    )
    returning id into new_unit_id;

    unit_ids := array_append(unit_ids, new_unit_id);
  end loop;

  for occupancy_item in select value from jsonb_array_elements(coalesce(p_occupancies, '[]'::jsonb))
  loop
    unit_index := (occupancy_item->>'unit_index')::integer;
    new_unit_id := unit_ids[unit_index + 1];

    if new_unit_id is null or nullif(trim(occupancy_item->>'full_name'), '') is null then
      raise exception 'invalid_occupancy';
    end if;

    insert into public.tenants (user_id, full_name, email, phone, notes)
    values (
      current_user_id,
      trim(occupancy_item->>'full_name'),
      nullif(trim(occupancy_item->>'email'), ''),
      nullif(trim(occupancy_item->>'phone'), ''),
      nullif(trim(occupancy_item->>'notes'), '')
    )
    returning id into new_tenant_id;

    payment_status := case occupancy_item->>'payment_status'
      when 'paid' then 'payé'
      when 'partial' then 'partiel'
      when 'late' then 'en retard'
      else 'à venir'
    end;

    insert into public.leases (
      property_id, unit_id, tenant_id, start_date, end_date, monthly_rent,
      payment_status, status, notes
    ) values (
      new_property_id,
      new_unit_id,
      new_tenant_id,
      (occupancy_item->>'lease_start_date')::date,
      (occupancy_item->>'lease_end_date')::date,
      (occupancy_item->>'monthly_rent')::numeric,
      payment_status,
      'active',
      nullif(trim(occupancy_item->>'notes'), '')
    )
    returning id into new_lease_id;

    if occupancy_item->>'payment_status' in ('paid', 'partial') then
      amount_paid := case
        when occupancy_item->>'payment_status' = 'paid' then (occupancy_item->>'monthly_rent')::numeric
        else (occupancy_item->>'initial_amount_paid')::numeric
      end;
      payment_received_date := (occupancy_item->>'payment_received_date')::date;
      charge_id := 'rent-charge-' || new_lease_id::text || '-' || left(occupancy_item->>'lease_start_date', 7);
      transaction_id := 'payment-transaction-' || gen_random_uuid()::text;

      insert into public.rent_charges (
        id, user_id, property_id, unit_id, lease_id, tenant_id, period_month, due_date, amount_due
      ) values (
        charge_id,
        current_user_id,
        new_property_id,
        new_unit_id,
        new_lease_id,
        new_tenant_id,
        left(occupancy_item->>'lease_start_date', 7),
        (occupancy_item->>'lease_start_date')::date,
        (occupancy_item->>'monthly_rent')::numeric
      );

      insert into public.payment_transactions (
        id, user_id, property_id, lease_id, tenant_id, received_at, amount_received, method, notes
      ) values (
        transaction_id,
        current_user_id,
        new_property_id,
        new_lease_id,
        new_tenant_id,
        payment_received_date,
        amount_paid,
        'autre',
        'Paiement initial enregistré pendant la configuration.'
      );

      insert into public.payment_allocations (
        id, user_id, transaction_id, rent_charge_id, amount_allocated
      ) values (
        'payment-allocation-' || gen_random_uuid()::text,
        current_user_id,
        transaction_id,
        charge_id,
        amount_paid
      );
    end if;
  end loop;

  return jsonb_build_object(
    'property_id', new_property_id,
    'unit_count', cardinality(unit_ids),
    'already_initialized', false
  );
end;
$$;

revoke all on function public.create_owner_portfolio(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_owner_portfolio(jsonb, jsonb, jsonb) to authenticated;
