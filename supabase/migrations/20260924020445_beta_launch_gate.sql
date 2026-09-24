alter table public.properties
  add column if not exists archived_at timestamptz;

create index if not exists properties_user_archived_at_idx
  on public.properties(user_id, archived_at);

create or replace function public.get_property_deletion_mode(check_property_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when not exists (
      select 1
      from public.properties
      where id = check_property_id
        and user_id = auth.uid()
    ) then null
    when exists (select 1 from public.leases where property_id = check_property_id)
      or exists (select 1 from public.rent_charges where property_id = check_property_id)
      or exists (select 1 from public.payment_transactions where property_id = check_property_id)
      or exists (select 1 from public.documents where property_id = check_property_id)
      or exists (select 1 from public.maintenance_requests where property_id = check_property_id)
      or exists (select 1 from public.notes where property_id = check_property_id)
      or exists (select 1 from public.tasks where property_id = check_property_id)
      or exists (
        select 1
        from public.activities
        where property_id = check_property_id
          and not (activity_type = 'immeuble' and title in ('Immeuble créé', 'Immeuble cree'))
      )
      then 'archive'
    else 'delete'
  end;
$$;

revoke all on function public.get_property_deletion_mode(uuid) from public, anon;
grant execute on function public.get_property_deletion_mode(uuid) to authenticated;

create or replace function private.prevent_historical_property_deletion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if public.get_property_deletion_mode(old.id) = 'archive' then
    raise exception using
      errcode = '23514',
      message = 'PROPERTY_HAS_HISTORY';
  end if;

  return old;
end;
$$;

drop trigger if exists properties_prevent_historical_delete on public.properties;
create trigger properties_prevent_historical_delete
before delete on public.properties
for each row
execute function private.prevent_historical_property_deletion();

create table if not exists private.ai_rate_limit_config (
  feature text primary key,
  max_requests integer not null check (max_requests > 0),
  window_seconds integer not null check (window_seconds between 60 and 86400),
  updated_at timestamptz not null default now()
);

insert into private.ai_rate_limit_config(feature, max_requests, window_seconds)
values
  ('copilot', 30, 3600),
  ('document_ai', 10, 3600)
on conflict (feature) do nothing;

create table if not exists private.ai_rate_limit_buckets (
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null references private.ai_rate_limit_config(feature),
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, feature, window_started_at)
);

revoke all on table private.ai_rate_limit_config from public, anon, authenticated;
revoke all on table private.ai_rate_limit_buckets from public, anon, authenticated;

create or replace function public.consume_ai_quota(p_feature text)
returns table(allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_max_requests integer;
  v_window_seconds integer;
  v_window_start timestamptz;
  v_count integer;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select config.max_requests, config.window_seconds
    into v_max_requests, v_window_seconds
    from private.ai_rate_limit_config as config
    where config.feature = p_feature;

  if v_max_requests is null then
    raise exception using errcode = '22023', message = 'UNKNOWN_AI_FEATURE';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / v_window_seconds) * v_window_seconds
  );

  insert into private.ai_rate_limit_buckets as bucket (
    user_id,
    feature,
    window_started_at,
    request_count,
    updated_at
  )
  values (v_user_id, p_feature, v_window_start, 1, v_now)
  on conflict (user_id, feature, window_started_at)
  do update set
    request_count = bucket.request_count + 1,
    updated_at = v_now
  where bucket.request_count < v_max_requests
  returning request_count into v_count;

  if v_count is null then
    select bucket.request_count
      into v_count
      from private.ai_rate_limit_buckets as bucket
      where bucket.user_id = v_user_id
        and bucket.feature = p_feature
        and bucket.window_started_at = v_window_start;

    return query select
      false,
      0,
      greatest(1, ceil(extract(epoch from (v_window_start + make_interval(secs => v_window_seconds) - v_now)))::integer);
    return;
  end if;

  return query select
    true,
    greatest(0, v_max_requests - v_count),
    greatest(1, ceil(extract(epoch from (v_window_start + make_interval(secs => v_window_seconds) - v_now)))::integer);
end;
$$;

revoke all on function public.consume_ai_quota(text) from public, anon;
grant execute on function public.consume_ai_quota(text) to authenticated;

create table if not exists public.beta_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null default 'feedback' check (category in ('feedback', 'problem')),
  message text not null check (char_length(message) between 10 and 4000),
  page_path text check (page_path is null or char_length(page_path) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists beta_feedback_user_created_at_idx
  on public.beta_feedback(user_id, created_at desc);

alter table public.beta_feedback enable row level security;

drop policy if exists "Users can submit their own beta feedback" on public.beta_feedback;
create policy "Users can submit their own beta feedback"
on public.beta_feedback
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can read their own beta feedback" on public.beta_feedback;
create policy "Users can read their own beta feedback"
on public.beta_feedback
for select
to authenticated
using (user_id = auth.uid());

revoke all on table public.beta_feedback from anon;
grant select, insert on table public.beta_feedback to authenticated;
