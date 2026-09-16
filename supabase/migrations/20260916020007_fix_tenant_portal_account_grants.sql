-- The first beta hardening migration omitted this table from its bulk revoke.
-- Keep account creation exclusively inside the invitation SECURITY DEFINER RPC.
revoke all on table public.tenant_portal_accounts from anon, authenticated;
grant select, update, delete on table public.tenant_portal_accounts to authenticated;
