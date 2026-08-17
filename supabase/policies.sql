-- ============================================================
-- shortic — RLS policies
-- Run AFTER schema.sql (as postgres/service role).
-- Idempotent: bisa dijalankan ulang (drop policy if exists).
-- ============================================================

alter table public.links enable row level security;
alter table public.profiles enable row level security;
alter table public.allowed_emails enable row level security;

-- Anon TIDAK dapat SELECT langsung ke links. Satu-satunya akses lewat
-- function SECURITY DEFINER get_link_by_code / increment_click_count.
-- (function dijalankan dengan hak owner, bukan anon, sehingga bisa
--  melewati RLS untuk query yang sudah dibatasi di dalamnya.)

-- Helper is_admin() (didefinisikan di schema.sql) dipakai untuk cek role
-- admin. Ia SECURITY DEFINER sehingga tidak memicu infinite recursion RLS.

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

drop policy if exists "allowed_emails_admin_delete" on public.allowed_emails;
create policy "allowed_emails_admin_delete"
  on public.allowed_emails for delete
  to authenticated
  using (public.is_admin());

-- ---------- revoke anon table access (defense in depth) ----------
-- Role anon TIDAK boleh akses tabel links/allowed_emails langsung.
-- Akses ke links untuk anon hanya lewat fungsi SECURITY DEFINER di atas.
-- Catatan: role authenticated TIDAK dicabut, karena RLS sudah membatasi
-- (admin dashboard butuh akses via authenticated untuk CRUD).
revoke all on table public.links from anon;
revoke all on table public.allowed_emails from anon;
grant execute on function public.get_link_by_code(text) to anon, authenticated;
grant execute on function public.increment_click_count(text) to anon, authenticated;