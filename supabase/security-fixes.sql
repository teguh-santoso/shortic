-- ============================================================
-- shortic — migration keamanan (jalankan SEKALI di Supabase SQL Editor
-- sebagai postgres/service role) untuk DB yang sudah live.
-- Sesuai dengan temuan audit keamanan.
-- ============================================================

-- ---------- M1: block target_url selain http/https (anti javascript: XSS) ----------
-- Bersihkan baris yang sudah terlanjur melanggar (harusnya tidak ada).
delete from public.links where target_url !~* '^https?://';

alter table public.links drop constraint if exists links_target_url_http;
alter table public.links
  add constraint links_target_url_http
  check (target_url ~* '^https?://');

-- ---------- M2: jangan timpa role saat login (biarkan promosi/demosi bertahan) ----------
create or replace function public.sync_profile_for_current_user()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text;
  v_role   text;
  v_profile public.profiles;
begin
  select lower(email) into v_email
    from auth.users
   where id = auth.uid();

  if v_email is null then
    return null;
  end if;

  select role into v_role
    from public.allowed_emails
   where email = v_email;

  -- Email tidak ada di allowlist -> bukan user yang sah.
  if v_role is null then
    return null;
  end if;

  insert into public.profiles (id, role, email)
  values (auth.uid(), v_role, v_email)
  on conflict (id) do nothing
  returning * into v_profile;

  return v_profile;
end;
$$;

grant execute on function public.sync_profile_for_current_user() to authenticated;

-- ---------- M2: policy DELETE profiles (dipakai untuk revoke penuh) ----------
drop policy if exists "profiles_delete_admin_only" on public.profiles;
create policy "profiles_delete_admin_only"
  on public.profiles for delete
  to authenticated
  using (public.is_admin());

-- ---------- M2: policy UPDATE allowed_emails (sinkron role) ----------
drop policy if exists "allowed_emails_admin_update" on public.allowed_emails;
create policy "allowed_emails_admin_update"
  on public.allowed_emails for update
  to authenticated
  using (public.is_admin());

-- ---------- Catatan M3 (rate limiting increment_click_count) ----------
-- increment_click_count diekspos ke anon; siapa pun bisa meng-inflate click count.
-- Tanpa backend, mitigasi: hapus grant anon & panggil dari Edge Function/Worker
-- dengan rate limit, atau terima risiko statistik yang bisa dimanipulasi.
--   revoke execute on function public.increment_click_count(text) from anon;
-- (kalau dicabut, hapus juga pemanggilannya di public-site/app.js)
