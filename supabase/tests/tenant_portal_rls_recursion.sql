-- Run as postgres against a database with the migrations applied.
-- Every fixture and write is rolled back; no real user data is returned.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';

create temp table rls_fixture (
  scope text primary key,
  owner_id uuid not null,
  portal_id uuid not null default gen_random_uuid(),
  property_id uuid not null default gen_random_uuid(),
  unit_id uuid not null default gen_random_uuid(),
  tenant_id uuid not null default gen_random_uuid(),
  lease_id uuid not null default gen_random_uuid(),
  charge_id text not null default gen_random_uuid()::text,
  transaction_id text not null default gen_random_uuid()::text,
  allocation_id text not null default gen_random_uuid()::text,
  payment_id uuid not null default gen_random_uuid(),
  shared_doc_id uuid not null default gen_random_uuid(),
  private_doc_id uuid not null default gen_random_uuid(),
  lease_doc_id uuid not null default gen_random_uuid(),
  unit_doc_id uuid not null default gen_random_uuid(),
  maintenance_id uuid not null default gen_random_uuid()
);
create temp table rls_results (test text, result text);
create temp table invitation_actor (
  user_id uuid not null default gen_random_uuid(),
  email text not null default 'single-use@example.test'
);
create temp table invitation_tokens (label text primary key, token text not null);
insert into invitation_actor default values;
grant select on rls_fixture to authenticated, anon;
grant insert, select on rls_results to authenticated, anon;
grant select on invitation_actor to authenticated;
grant insert, select on invitation_tokens to authenticated;

create function pg_temp.assert_count(label text, query text, expected bigint)
returns void language plpgsql security invoker as $$
declare actual bigint;
begin
  execute query into actual;
  if actual is distinct from expected then
    raise exception '%: expected %, got %', label, expected, actual;
  end if;
  insert into rls_results values (label, 'ok');
end;
$$;

create function pg_temp.assert_denied(label text, query text)
returns void language plpgsql security invoker as $$
declare affected bigint;
begin
  begin
    execute query;
    get diagnostics affected = row_count;
  exception when insufficient_privilege or check_violation or raise_exception then
    -- Do not catch 42P17: recursion must always fail the test suite.
    insert into rls_results values (label, 'ok');
    return;
  end;
  if affected <> 0 then
    raise exception '%: unauthorized write affected % rows', label, affected;
  end if;
  insert into rls_results values (label, 'ok');
end;
$$;

create function pg_temp.assert_affected(label text, query text, expected bigint)
returns void language plpgsql security invoker as $$
declare affected bigint;
begin
  execute query;
  get diagnostics affected = row_count;
  if affected is distinct from expected then
    raise exception '%: expected % affected rows, got %', label, expected, affected;
  end if;
  insert into rls_results values (label, 'ok');
end;
$$;

insert into rls_fixture(scope, owner_id) values ('A', gen_random_uuid()), ('C', gen_random_uuid());
-- B is a different tenant of Owner A, in the SAME property as A.
insert into rls_fixture(scope, owner_id, property_id)
select 'B', owner_id, property_id from rls_fixture where scope = 'A';

insert into auth.users(id, aud, role)
select owner_id, 'authenticated', 'authenticated' from rls_fixture group by owner_id
union all
select portal_id, 'authenticated', 'authenticated' from rls_fixture
union all
select user_id, 'authenticated', 'authenticated' from invitation_actor;

do $$
declare f rls_fixture;
begin
  for f in select * from rls_fixture order by scope loop
    perform set_config('request.jwt.claim.sub', f.owner_id::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', f.owner_id, 'role', 'authenticated')::text, true);
    insert into public.properties(id, user_id, name, address, type)
    values(f.property_id, f.owner_id, 'RLS test', 'RLS test', 'duplex') on conflict (id) do nothing;
    insert into public.units(id, property_id, name) values(f.unit_id, f.property_id, 'RLS test ' || f.scope);
    insert into public.tenants(id, user_id, full_name) values(f.tenant_id, f.owner_id, 'RLS test ' || f.scope);
    insert into public.leases(id, property_id, unit_id, tenant_id, start_date, end_date, monthly_rent)
    values(f.lease_id, f.property_id, f.unit_id, f.tenant_id, '2026-01-01', '2026-12-31', 1000);
    insert into public.tenant_portal_accounts(user_id, tenant_id, owner_user_id)
    values(f.portal_id, f.tenant_id, f.owner_id);
    -- Null tenant_id explicitly tests authorization through lease_id.
    insert into public.rent_charges(id, user_id, property_id, unit_id, lease_id, tenant_id, period_month, due_date, amount_due)
    values(f.charge_id, f.owner_id, f.property_id, f.unit_id, f.lease_id, null, '2026-09', '2026-09-01', 1000);
    insert into public.payment_transactions(id, user_id, property_id, lease_id, tenant_id, received_at, amount_received)
    values(f.transaction_id, f.owner_id, f.property_id, f.lease_id, null, '2026-09-01', 1000);
    insert into public.payment_allocations(id, user_id, transaction_id, rent_charge_id, amount_allocated)
    values(f.allocation_id, f.owner_id, f.transaction_id, f.charge_id, 1000);
    insert into public.payments(id, user_id, property_id, unit_id, lease_id, tenant_id, due_date, amount)
    values(f.payment_id, f.owner_id, f.property_id, f.unit_id, f.lease_id, f.tenant_id, '2026-09-01', 1000);
    insert into public.documents(id, user_id, tenant_id, title, document_type, visibility)
    values(f.shared_doc_id, f.owner_id, f.tenant_id, 'RLS shared', 'autre', 'tenant'),
          (f.private_doc_id, f.owner_id, f.tenant_id, 'RLS private', 'autre', 'private');
    insert into public.documents(id, user_id, lease_id, title, document_type, visibility)
    values(f.lease_doc_id, f.owner_id, f.lease_id, 'RLS lease', 'autre', 'tenant');
    insert into public.documents(id, user_id, unit_id, title, document_type, visibility)
    values(f.unit_doc_id, f.owner_id, f.unit_id, 'RLS unit', 'autre', 'tenant');
    insert into public.maintenance_requests(id, user_id, property_id, unit_id, tenant_id, title, priority, status)
    values(f.maintenance_id, f.owner_id, f.property_id, f.unit_id, f.tenant_id, 'RLS test', 'low', 'open');
  end loop;
end;
$$;

-- Actual reads run as authenticated, with RLS on (never as postgres).
do $$
declare
  actor record;
  target rls_fixture;
  domain record;
  allowed boolean;
  expected integer;
  predicate text;
begin
  for actor in
    select 'Owner ' || scope as label, owner_id as uid, true as is_owner, scope from rls_fixture where scope in ('A', 'C')
    union all
    select 'Tenant ' || scope, portal_id, false, scope from rls_fixture
  loop
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub', actor.uid::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', actor.uid, 'role', 'authenticated')::text, true);
    perform pg_temp.assert_count(actor.label || ': RLS role', 'select count(*) from pg_roles where rolname=current_user and not rolbypassrls and not rolsuper', 1);
    for target in select * from rls_fixture order by scope loop
      allowed := case when actor.is_owner then target.owner_id = actor.uid else target.scope = actor.scope end;
      for domain in select * from (values
        ('properties', 'property_id'), ('units', 'unit_id'), ('tenants', 'tenant_id'),
        ('leases', 'lease_id'), ('rent_charges', 'charge_id'),
        ('payment_transactions', 'transaction_id'), ('payment_allocations', 'allocation_id'),
        ('payments', 'payment_id'), ('maintenance_requests', 'maintenance_id')
      ) as domains(table_name, id_column) loop
        expected := case when allowed then 1 else 0 end;
        -- Both A and B are legitimately associated with the same property.
        if domain.table_name = 'properties' and not actor.is_owner then
          expected := case when target.property_id = (select property_id from rls_fixture where scope=actor.scope) then 1 else 0 end;
        end if;
        -- The legacy payments table is owner-only; portal payments use the ledger.
        if domain.table_name = 'payments' and not actor.is_owner then expected := 0; end if;
        predicate := format('id::text = %L', to_jsonb(target)->>domain.id_column);
        perform pg_temp.assert_count(actor.label || ' -> ' || target.scope || ': ' || domain.table_name,
          format('select count(*) from public.%I where %s', domain.table_name, predicate), expected);
      end loop;
      perform pg_temp.assert_count(actor.label || ' -> ' || target.scope || ': portal accounts',
        format('select count(*) from public.tenant_portal_accounts where tenant_id=%L', target.tenant_id), case when allowed then 1 else 0 end);
      perform pg_temp.assert_count(actor.label || ' -> ' || target.scope || ': shared documents (tenant/lease/unit)',
        format('select count(*) from public.documents where id in (%L,%L,%L)', target.shared_doc_id, target.lease_doc_id, target.unit_doc_id), case when allowed then 3 else 0 end);
      perform pg_temp.assert_count(actor.label || ' -> ' || target.scope || ': private documents',
        format('select count(*) from public.documents where id=%L', target.private_doc_id), case when actor.is_owner and allowed then 1 else 0 end);
    end loop;
    if actor.is_owner then
      select * into target from rls_fixture where scope=actor.scope;
      perform pg_temp.assert_count(actor.label || ': update own lease',
        format('with changed as (update public.leases set notes=''RLS test'' where id=%L returning id) select count(*) from changed', target.lease_id), 1);
      perform pg_temp.assert_count(actor.label || ': update own legacy payment',
        format('with changed as (update public.payments set notes=''RLS test'' where id=%L returning id) select count(*) from changed', target.payment_id), 1);
      perform pg_temp.assert_count(actor.label || ': insert own historical lease',
        format('with created as (insert into public.leases(property_id,unit_id,tenant_id,start_date,end_date,monthly_rent,status) values(%L,%L,%L,''2025-01-01'',''2025-12-31'',1000,''ended'') returning id) select count(*) from created', target.property_id, target.unit_id, target.tenant_id), 1);
      select * into target from rls_fixture where scope=case when actor.scope='A' then 'C' else 'A' end;
      perform pg_temp.assert_denied(actor.label || ': cannot update other owner lease',
        format('update public.leases set notes=''forbidden'' where id=%L', target.lease_id));
      perform pg_temp.assert_denied(actor.label || ': cannot delete other owner property',
        format('delete from public.properties where id=%L', target.property_id));
    else
      select * into target from rls_fixture where scope=actor.scope;
      perform pg_temp.assert_denied(actor.label || ': cannot update lease',
        format('update public.leases set monthly_rent=1 where id=%L', target.lease_id));
      perform pg_temp.assert_denied(actor.label || ': cannot delete property',
        format('delete from public.properties where id=%L', target.property_id));
      perform pg_temp.assert_denied(actor.label || ': cannot alter portal account',
        format('update public.tenant_portal_accounts set status=''disabled'' where tenant_id=%L', target.tenant_id));
      perform pg_temp.assert_count(actor.label || ': create own maintenance request',
        format('with created as (insert into public.maintenance_requests(user_id,property_id,unit_id,tenant_id,title,priority,status) values(%L,%L,%L,%L,''RLS portal write'',''low'',''open'') returning id) select count(*) from created', target.owner_id, target.property_id, target.unit_id, target.tenant_id), 1);
    end if;
    execute 'reset role';
  end loop;
end;
$$;

-- A former tenant keeps access to records explicitly linked to their tenant or lease,
-- but loses access inherited only from the old unit/property.
select set_config('request.jwt.claim.sub', (select owner_id::text from rls_fixture where scope='A'), true);
select set_config('request.jwt.claims', json_build_object('sub',(select owner_id from rls_fixture where scope='A'),'role','authenticated')::text, true);
update public.documents
set storage_path = (select owner_id::text || '/security-test-former-unit.pdf' from rls_fixture where scope='A')
where id = (select unit_doc_id from rls_fixture where scope='A');
insert into storage.objects(bucket_id, name, owner_id, metadata)
select 'documents', owner_id::text || '/security-test-former-unit.pdf', owner_id::text,
       '{"mimetype":"application/pdf","size":128}'::jsonb
from rls_fixture where scope='A';
update public.leases set status='ended', actual_end_date='2026-08-31'
where id=(select lease_id from rls_fixture where scope='A');

set local role authenticated;
select set_config('request.jwt.claim.sub', (select portal_id::text from rls_fixture where scope='A'), true);
select set_config('request.jwt.claims', json_build_object('sub',(select portal_id from rls_fixture where scope='A'),'role','authenticated')::text, true);
select pg_temp.assert_count('Former tenant: no property inherited from ended lease',
  format('select count(*) from public.properties where id=%L', (select property_id from rls_fixture where scope='A')), 0);
select pg_temp.assert_count('Former tenant: no unit inherited from ended lease',
  format('select count(*) from public.units where id=%L', (select unit_id from rls_fixture where scope='A')), 0);
select pg_temp.assert_count('Former tenant: explicit tenant and lease documents remain visible',
  format('select count(*) from public.documents where id in (%L,%L)',
    (select shared_doc_id from rls_fixture where scope='A'), (select lease_doc_id from rls_fixture where scope='A')), 2);
select pg_temp.assert_count('Former tenant: unit-only document is hidden',
  format('select count(*) from public.documents where id=%L', (select unit_doc_id from rls_fixture where scope='A')), 0);
select pg_temp.assert_count('Former tenant: unit-only storage object is hidden',
  format('select count(*) from storage.objects where name=%L', (select owner_id::text || '/security-test-former-unit.pdf' from rls_fixture where scope='A')), 0);
reset role;

-- Invitation identity and secret are controlled by database triggers.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select owner_id::text from rls_fixture where scope='A'), true);
select set_config('request.jwt.claims', json_build_object('sub',(select owner_id from rls_fixture where scope='A'),'role','authenticated','email','owner-a@example.test')::text, true);
insert into public.tenant_portal_invitations(tenant_id, owner_user_id, invited_by, email, token, status, expires_at)
select tenant_id, owner_id, owner_id, 'security-gate@example.test', 'caller-selected-token', 'accepted', now() + interval '2 years'
from rls_fixture where scope='A';
select pg_temp.assert_count('Invitation: database replaces token, status and expiry',
  $$select count(*) from public.tenant_portal_invitations
    where email='security-gate@example.test'
      and token <> 'caller-selected-token'
      and length(token)=64
      and status='pending'
      and expires_at between now() + interval '13 days 23 hours' and now() + interval '14 days 1 hour'$$, 1);
update public.tenant_portal_invitations
set tenant_id=(select tenant_id from rls_fixture where scope='B'),
    email='changed@example.test', token='changed-token'
where email='security-gate@example.test';
select pg_temp.assert_count('Invitation: tenant, email and token are immutable',
  format($q$select count(*) from public.tenant_portal_invitations
    where email='security-gate@example.test' and tenant_id=%L and token <> 'changed-token'$q$,
    (select tenant_id from rls_fixture where scope='A')), 1);
insert into public.tenant_portal_invitations(tenant_id, owner_user_id, invited_by, email)
select tenant_id, owner_id, owner_id, test_email
from rls_fixture
cross join (values ('single-use@example.test'),('expired@example.test'),('revoked@example.test')) as invitations(test_email)
where scope='A';
insert into invitation_tokens(label, token)
select split_part(email, '@', 1), token
from public.tenant_portal_invitations
where email in ('single-use@example.test','expired@example.test','revoked@example.test');
update public.tenant_portal_invitations set status='revoked'
where email='revoked@example.test';
reset role;
set local session_replication_role = replica;
update public.tenant_portal_invitations set expires_at=now() - interval '1 minute'
where email='expired@example.test';
set local session_replication_role = origin;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select user_id::text from invitation_actor), true);
select set_config('request.jwt.claims', json_build_object('sub',(select user_id from invitation_actor),'role','authenticated','email','wrong@example.test')::text, true);
select pg_temp.assert_denied('Invitation RPC: wrong email refused',
  format('select public.accept_tenant_portal_invitation(%L)',
    (select token from invitation_tokens where label='single-use')));
select set_config('request.jwt.claims', json_build_object('sub',(select user_id from invitation_actor),'role','authenticated','email','single-use@example.test')::text, true);
select pg_temp.assert_count('Invitation RPC: matching unused token accepted',
  format('select count(*) from public.accept_tenant_portal_invitation(%L)',
    (select token from invitation_tokens where label='single-use')), 1);
select pg_temp.assert_denied('Invitation RPC: token cannot be reused',
  format('select public.accept_tenant_portal_invitation(%L)',
    (select token from invitation_tokens where label='single-use')));
select set_config('request.jwt.claims', json_build_object('sub',(select user_id from invitation_actor),'role','authenticated','email','expired@example.test')::text, true);
select pg_temp.assert_denied('Invitation RPC: expired token refused',
  format('select public.accept_tenant_portal_invitation(%L)',
    (select token from invitation_tokens where label='expired')));
select set_config('request.jwt.claims', json_build_object('sub',(select user_id from invitation_actor),'role','authenticated','email','revoked@example.test')::text, true);
select pg_temp.assert_denied('Invitation RPC: revoked token refused',
  format('select public.accept_tenant_portal_invitation(%L)',
    (select token from invitation_tokens where label='revoked')));
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select owner_id::text from rls_fixture where scope='A'), true);
select set_config('request.jwt.claims', json_build_object('sub',(select owner_id from rls_fixture where scope='A'),'role','authenticated','email','owner-a@example.test')::text, true);
select pg_temp.assert_denied('Owner: cannot create portal account without invitation RPC',
  format('insert into public.tenant_portal_accounts(user_id,tenant_id,owner_user_id) values(%L,%L,%L)',
    (select portal_id from rls_fixture where scope='C'),
    (select tenant_id from rls_fixture where scope='A'),
    (select owner_id from rls_fixture where scope='A')));
reset role;

-- Storage upload paths must point at an existing maintenance request for the tenant.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select portal_id::text from rls_fixture where scope='B'), true);
select set_config('request.jwt.claims', json_build_object('sub',(select portal_id from rls_fixture where scope='B'),'role','authenticated')::text, true);
select pg_temp.assert_denied('Tenant storage: fabricated maintenance request path denied',
  format('insert into storage.objects(bucket_id,name,owner_id) values(''maintenance-attachments'',%L,%L)',
    (select owner_id::text || '/' || tenant_id::text || '/' || gen_random_uuid()::text || '/fake.jpg' from rls_fixture where scope='B'),
    (select portal_id::text from rls_fixture where scope='B')));
select pg_temp.assert_count('Tenant storage: existing request path relationship is visible',
  format($q$select count(*) from public.tenant_portal_accounts account
    join public.maintenance_requests request
      on request.tenant_id=account.tenant_id and request.user_id=account.owner_user_id
    where account.user_id=(select auth.uid()) and account.status='active'
      and account.owner_user_id::text=%L and account.tenant_id::text=%L and request.id::text=%L$q$,
    (select owner_id::text from rls_fixture where scope='B'),
    (select tenant_id::text from rls_fixture where scope='B'),
    (select maintenance_id::text from rls_fixture where scope='B')), 1);
select pg_temp.assert_affected('Tenant storage: existing maintenance request path allowed',
  format('insert into storage.objects(bucket_id,name,owner_id) values(''maintenance-attachments'',%L,%L)',
    (select owner_id::text || '/' || tenant_id::text || '/' || maintenance_id::text || '/valid.jpg' from rls_fixture where scope='B'),
    (select portal_id::text from rls_fixture where scope='B')), 1);
reset role;

-- Disabling an account must revoke derived property access immediately.
update public.tenant_portal_accounts set status='disabled'
where user_id=(select portal_id from rls_fixture where scope='A');
set local role authenticated;
select set_config('request.jwt.claim.sub', (select portal_id::text from rls_fixture where scope='A'), true);
select set_config('request.jwt.claims', json_build_object('sub',(select portal_id from rls_fixture where scope='A'),'role','authenticated')::text, true);
select pg_temp.assert_count('Disabled tenant: no properties', 'select count(*) from public.properties where id in (select property_id from rls_fixture)', 0);
select pg_temp.assert_count('Disabled tenant: no units', 'select count(*) from public.units where id in (select unit_id from rls_fixture)', 0);
select pg_temp.assert_count('Disabled tenant: no leases', 'select count(*) from public.leases where id in (select lease_id from rls_fixture)', 0);
select pg_temp.assert_count('Disabled tenant: no transactions', 'select count(*) from public.payment_transactions where id in (select transaction_id from rls_fixture)', 0);
reset role;

-- An authenticated account without portal links has no tenant access.
set local role authenticated;
select set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
select set_config('request.jwt.claims', json_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated')::text, true);
select pg_temp.assert_count('Unlinked user: no properties', 'select count(*) from public.properties where id in (select property_id from rls_fixture)', 0);
select pg_temp.assert_count('Unlinked user: no units', 'select count(*) from public.units where id in (select unit_id from rls_fixture)', 0);
select pg_temp.assert_count('Unlinked user: no leases', 'select count(*) from public.leases where id in (select lease_id from rls_fixture)', 0);
reset role;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
select pg_temp.assert_denied('Anonymous: properties table denied', 'select count(*) from public.properties');
select pg_temp.assert_denied('Anonymous: units table denied', 'select count(*) from public.units');
select pg_temp.assert_denied('Anonymous: leases table denied', 'select count(*) from public.leases');
reset role;

select pg_temp.assert_count('Helper: anonymous execution denied',
  $$select has_function_privilege('anon','private.tenant_portal_can_read_property(uuid)','execute')::int$$, 0);
select pg_temp.assert_count('Helper: authenticated execution allowed',
  $$select has_function_privilege('authenticated','private.tenant_portal_can_read_property(uuid)','execute')::int$$, 1);
select pg_temp.assert_count('Helper: definer with empty search_path',
  $$select count(*) from pg_proc where oid='private.tenant_portal_can_read_property(uuid)'::regprocedure and prosecdef and proconfig=array['search_path=""']$$, 1);
select pg_temp.assert_count('Unit helper: anonymous execution denied',
  $$select has_function_privilege('anon','private.tenant_portal_can_read_unit(uuid)','execute')::int$$, 0);
select pg_temp.assert_count('Unit helper: authenticated execution allowed',
  $$select has_function_privilege('authenticated','private.tenant_portal_can_read_unit(uuid)','execute')::int$$, 1);
select pg_temp.assert_count('Unit helper: definer with empty search_path',
  $$select count(*) from pg_proc where oid='private.tenant_portal_can_read_unit(uuid)'::regprocedure and prosecdef and proconfig=array['search_path=""']$$, 1);
select pg_temp.assert_count('Privileges: anonymous has no properties SELECT',
  $$select has_table_privilege('anon','public.properties','select')::int$$, 0);
select pg_temp.assert_count('Privileges: authenticated has no TRUNCATE',
  $$select has_table_privilege('authenticated','public.properties','truncate')::int$$, 0);
select pg_temp.assert_count('Privileges: anonymous has no portal account SELECT',
  $$select has_table_privilege('anon','public.tenant_portal_accounts','select')::int$$, 0);
select pg_temp.assert_count('Privileges: authenticated has no portal account INSERT',
  $$select has_table_privilege('authenticated','public.tenant_portal_accounts','insert')::int$$, 0);
select pg_temp.assert_count('Privileges: authenticated has no portal account TRUNCATE',
  $$select has_table_privilege('authenticated','public.tenant_portal_accounts','truncate')::int$$, 0);
select pg_temp.assert_count('Invitation RPC: anonymous execution denied',
  $$select has_function_privilege('anon','public.accept_tenant_portal_invitation(text)','execute')::int$$, 0);
select pg_temp.assert_count('Invitation RPC: authenticated execution allowed',
  $$select has_function_privilege('authenticated','public.accept_tenant_portal_invitation(text)','execute')::int$$, 1);
select pg_temp.assert_count('Invitation RPC: definer with empty search_path',
  $$select count(*) from pg_proc where oid='public.accept_tenant_portal_invitation(text)'::regprocedure and prosecdef and proconfig=array['search_path=""']$$, 1);
select pg_temp.assert_count('Documents bucket: private, MIME-limited and 20 MiB maximum',
  $$select count(*) from storage.buckets where id='documents' and not public and file_size_limit=20971520
    and allowed_mime_types @> array['application/pdf','image/jpeg','image/png','image/webp']::text[]$$, 1);
select pg_temp.assert_count('Maintenance bucket: private, image-only and 10 MiB maximum',
  $$select count(*) from storage.buckets where id='maintenance-attachments' and not public and file_size_limit=10485760
    and allowed_mime_types <@ array['image/jpeg','image/png','image/webp']::text[]$$, 1);
select pg_temp.assert_count('RLS remains enabled',
  $$select count(*) from pg_class where oid in ('public.properties'::regclass,'public.units'::regclass,'public.tenants'::regclass,'public.leases'::regclass,'public.payments'::regclass,'public.rent_charges'::regclass,'public.payment_transactions'::regclass,'public.payment_allocations'::regclass,'public.documents'::regclass,'public.maintenance_requests'::regclass,'public.tenant_portal_accounts'::regclass) and relrowsecurity$$, 11);

select count(*) as passed, json_agg(rls_results order by test) as results from rls_results;
rollback;
