alter table public.payment_transactions
  add column if not exists cancelled_at timestamptz;

create index if not exists payment_transactions_cancelled_at_idx
  on public.payment_transactions (cancelled_at);
