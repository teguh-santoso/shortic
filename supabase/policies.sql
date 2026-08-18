-- ============================================================
-- shortic — RLS policies
--
-- Run AFTER schema.sql (as postgres/service role).
-- Idempotent: safe to re-run (drop policy if exists).
-- ============================================================

alter table public.links enable row level security;
alter table public.profiles enable row level security;
alter table public.allowed_emails enable row level security;

-- Anon gets NO direct SELECT on links. Its only access is through the
-- SECURITY DEFINER functions get_link_by_code / increment_click_count
-- (defined in schema.sql), which run with the owner's privileges and
-- are constrained internally.

-- The helper is_admin() (defined in schema.sql) is used for role checks.
-- It is SECURITY DEFINER so it does not trigger infinite RLS recursion.

-- ---------- links ----------
drop policy if exists "links_select_owner_or_admin" on public.links;
create policy "links_select_owner_or_admin"
  on public.links for select
  to authenticated
  using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "links_insert_owner_or_admin" on public.links;
create policy "links_insert_owner_or_admin"
  on public.links for insert
  to authenticated
  with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "links_update_owner_or_admin" on public.links;
create policy "links_update_owner_or_admin"
  on public.links for update
  to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "links_delete_owner_or_admin" on public.links;
create policy "links_delete_owner_or_admin"
  on public.links for delete
  to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- ---------- profiles ----------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_admin_only" on public.profiles;
create policy "profiles_update_admin_only"
  on public.profiles for update
  to authenticated
  using (public.is_admin());

drop policy if exists "profiles_delete_admin_only" on public.profiles;
create policy "profiles_delete_admin_only"
  on public.profiles for delete
  to authenticated
  using (public.is_admin());

-- ---------- allowed_emails ----------
drop policy if exists "allowed_emails_admin_insert" on public.allowed_emails;
create policy "allowed_emails_admin_insert"
  on public.allowed_emails for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "allowed_emails_admin_select" on public.allowed_emails;
create policy "allowed_emails_admin_select"
  on public.allowed_emails for select
  to authenticated
  using (public.is_admin());

drop policy if exists "allowed_emails_admin_update" on public.allowed_emails;
create policy "allowed_emails_admin_update"
  on public.allowed_emails for update
  to authenticated
  using (public.is_admin());

drop policy if exists "allowed_emails_admin_delete" on public.allowed_emails;
create policy "allowed_emails_admin_delete"
  on public.allowed_emails for delete
  to authenticated
  using (public.is_admin());

-- ---------- revoke anon table access (defense in depth) ----------
-- The anon role must not access links/allowed_emails directly; anon
-- access to links is only via the SECURITY DEFINER functions above.
-- Note: the authenticated role is intentionally NOT revoked, because RLS
-- already restricts it (the admin dashboard needs CRUD via authenticated).
revoke all on table public.links from anon;
revoke all on table public.allowed_emails from anon;
