-- ============================================================
-- shortic — reconcile satu kali (opsional)
-- Membuat baris profiles untuk user auth.users yang sudah terlanjur ada
-- tapi belum punya profile (mis. dibuat sebelum trigger allowlist terpasang).
-- Jalankan di Supabase SQL Editor sekali.
-- ============================================================

-- 1. Buat profile untuk user yang emailnya sudah ada di allowlist.
insert into public.profiles (id, role, email)
select u.id, a.role, lower(u.email)
  from auth.users u
  join public.allowed_emails a on a.email = lower(u.email)
  left join public.profiles p on p.id = u.id
 where p.id is null;

-- 2. Hapus user yang emailnya TIDAK ada di allowlist (bersihkan sisa akun lama).
delete from auth.users u
 where not exists (
   select 1 from public.allowed_emails a where a.email = lower(u.email)
 );