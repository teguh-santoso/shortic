-- ============================================================
-- shortic — seed data (opsional)
-- Isi email admin pertama supaya trigger allowlist punya target.
-- ============================================================

-- Ganti dengan email kamu sebelum menjalankan.
insert into public.allowed_emails (email, role)
values ('admin@contoh.com', 'admin');