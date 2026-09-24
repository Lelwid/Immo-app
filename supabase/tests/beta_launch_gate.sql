-- Transactional validation for property archival, AI quotas, and beta feedback.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';

create temp table launch_fixture (
  owner_id uuid not null default gen_random_uuid(),
  other_id uuid not null default gen_random_uuid(),
  empty_property_id uuid not null default gen_random_uuid(),
  historical_property_id uuid not null default gen_random_uuid(),
  unit_id uuid not null default gen_random_uuid(),
  tenant_id uuid not null default gen_random_uuid(),
  lease_id uuid not null default gen_random_uuid()
);
insert into launch_fixture default values;
create temp table launch_results(test text primary key, result text not null);
grant select on launch_fixture to authenticated;
grant insert, select on launch_results to authenticated;

insert into auth.users(id, aud, role)
select owner_id, 'authenticated', 'authenticated' from launch_fixture
union all
select other_id, 'authenticated', 'authenticated' from launch_fixture;

select set_config('request.jwt.claim.sub', owner_id::text, true) from launch_fixture;
select set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true) from launch_fixture;
set local role authenticated;

do $$
declare f launch_fixture;
declare quota record;
declare deletion_blocked boolean := false;
begin
  select * into f from launch_fixture;

  insert into public.properties(id, user_id, name, address, type)
  values
    (f.empty_property_id, f.owner_id, 'Immeuble vide', 'Adresse fictive', 'duplex'),
    (f.historical_property_id, f.owner_id, 'Immeuble historique', 'Adresse fictive', 'duplex');

  insert into public.units(id, property_id, name)
  values(f.unit_id, f.historical_property_id, 'Logement 1');
  insert into public.tenants(id, user_id, full_name)
  values(f.tenant_id, f.owner_id, 'Locataire fictif');
  insert into public.leases(id, property_id, unit_id, tenant_id, start_date, end_date, monthly_rent)
  values(f.lease_id, f.historical_property_id, f.unit_id, f.tenant_id, '2026-01-01', '2026-12-31', 1000);

  if public.get_property_deletion_mode(f.empty_property_id) <> 'delete' then
    raise exception 'Empty property should be deletable';
  end if;
  delete from public.properties where id = f.empty_property_id;
  if exists(select 1 from public.properties where id = f.empty_property_id) then
    raise exception 'Empty property was not deleted';
  end if;
  insert into launch_results values ('Hard delete without history', 'ok');

  if public.get_property_deletion_mode(f.historical_property_id) <> 'archive' then
    raise exception 'Historical property should be archived';
  end if;
  begin
    delete from public.properties where id = f.historical_property_id;
  exception when check_violation then
    deletion_blocked := true;
  end;
  if not deletion_blocked then
    raise exception 'Historical property destructive deletion was accepted';
  end if;
  insert into launch_results values ('Historical hard delete blocked', 'ok');

  update public.properties set archived_at = now() where id = f.historical_property_id;
  if not exists(select 1 from public.leases where id = f.lease_id) then
    raise exception 'Archival removed lease history';
  end if;
  insert into launch_results values ('Archive preserves history', 'ok');

  update public.properties set archived_at = null where id = f.historical_property_id;
  if exists(select 1 from public.properties where id = f.historical_property_id and archived_at is not null) then
    raise exception 'Property restore failed';
  end if;
  insert into launch_results values ('Restore', 'ok');

  for i in 1..30 loop
    select * into quota from public.consume_ai_quota('copilot');
    if not quota.allowed then raise exception 'Quota denied early at %', i; end if;
  end loop;
  select * into quota from public.consume_ai_quota('copilot');
  if quota.allowed or quota.remaining <> 0 or quota.retry_after_seconds < 1 then
    raise exception 'Quota did not deny request 31';
  end if;
  insert into launch_results values ('Durable AI quota', 'ok');

  insert into public.beta_feedback(user_id, category, message)
  values(f.owner_id, 'problem', 'Message fictif suffisamment long.');
  if (select count(*) from public.beta_feedback where user_id = f.owner_id) <> 1 then
    raise exception 'Feedback insert/read failed';
  end if;
  insert into launch_results values ('Feedback own-row RLS', 'ok');
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', other_id::text, true) from launch_fixture;
select set_config('request.jwt.claims', json_build_object('sub', other_id, 'role', 'authenticated')::text, true) from launch_fixture;
set local role authenticated;

do $$
declare f launch_fixture;
begin
  select * into f from launch_fixture;
  if exists(select 1 from public.properties where id = f.historical_property_id) then
    raise exception 'Other user can read owner property';
  end if;
  if exists(select 1 from public.beta_feedback where user_id = f.owner_id) then
    raise exception 'Other user can read owner feedback';
  end if;
  insert into launch_results values ('Cross-owner isolation', 'ok');
end;
$$;

select test, result from launch_results order by test;
rollback;
