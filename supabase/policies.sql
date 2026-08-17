-- ============================================================
-- shortic — RLS policies
-- Run AFTER schema.sql (as postgres/service role).
-- ============================================================

-- ---------- links ----------
alter table public.links enable row level security;
alter table public.profiles enable row level security;
alter table public.allowed_emails enable row level security;

-- Anon TIDAK dapat SELECT langsung ke links. Satu-satunya akses lewat
-- function SECURITY DEFINER get_link_by_code / increment_click_count.
-- (function dijalankan dengan hak owner, bukan anon, sehingga bisa
--  melewati RLS untuk query yang sudah dibatasi di dalamnya.)

create policy "links_select_owner_or_admin"
  on public.links for select
  to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "links_insert_owner_or_admin"
  on public.links for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "links_update_owner_or_admin"
  on public.links for update
  to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    owner_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "links_delete_owner_or_admin"
  on public.links for delete
  to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ---------- profiles ----------
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "profiles_update_admin_only"
  on public.profiles for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ---------- allowed_emails ----------
create policy "allowed_emails_admin_insert"
  on public.allowed_emails for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "allowed_emails_admin_select"
  on public.allowed_emails for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "allowed_emails_admin_delete"
  on public.allowed_emails for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ---------- revoke anon table access (defense in depth) ----------
-- Role anon TIDAK boleh akses tabel links/allowed_emails langsung.
-- Akses ke links untuk anon hanya lewat fungsi SECURITY DEFINER di atas.
-- Catatan: role authenticated TIDAK dicabut, karena RLS sudah membatasi
-- (admin dashboard butuh akses via authenticated untuk CRUD).
revoke all on table public.links from anon;
revoke all on table public.allowed_emails from anon;
grant execute on function public.get_link_by_code(text) to anon, authenticated;
grant execute on function public.increment_click_count(text) to anon, authenticated;