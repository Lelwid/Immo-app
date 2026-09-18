do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leases_date_range_check'
      and conrelid = 'public.leases'::regclass
  ) then
    alter table public.leases
      add constraint leases_date_range_check
      check (end_date >= start_date) not valid;
  end if;
end
$$;

alter table public.leases
  validate constraint leases_date_range_check;
