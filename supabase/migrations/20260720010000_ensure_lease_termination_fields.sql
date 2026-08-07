alter table public.leases
add column if not exists actual_end_date date,
add column if not exists termination_reason text,
add column if not exists termination_notes text;

comment on column public.leases.end_date is 'Scheduled lease end date.';
comment on column public.leases.actual_end_date is 'Explicit actual termination date when a lease is ended before or at move-out.';
