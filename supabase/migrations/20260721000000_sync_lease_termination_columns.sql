alter table public.leases
add column if not exists actual_end_date date,
add column if not exists termination_reason text,
add column if not exists termination_notes text;

comment on column public.leases.end_date is 'Scheduled lease end date.';
comment on column public.leases.actual_end_date is 'Actual termination or move-out date when a lease is explicitly ended.';
comment on column public.leases.termination_reason is 'Optional reason recorded when a lease is explicitly ended.';
comment on column public.leases.termination_notes is 'Optional notes recorded when a lease is explicitly ended.';
