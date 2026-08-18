-- ============================================================
-- shortic — seed data (optional)
--
-- Insert the first admin email so the allowlist trigger has a target.
-- ============================================================

-- Replace with your own email before running.
insert into public.allowed_emails (email, role)
values ('admin@contoh.com', 'admin');
