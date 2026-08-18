-- ============================================================
-- shortic — Supabase schema
-- Run this in the Supabase SQL Editor (as postgres/service role).
-- ============================================================

-- ---------- Tabel: links ----------
create table if not exists public.links (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  target_url  text not null check (target_url ~* '^https?://'),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  click_count integer not null default 0
);

comment on table public.links is 'Short codes -> target URLs. Only accessible via RPC get_link_by_code for anon.';

-- ---------- Tabel: profiles ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       text not null default 'user' check (role in ('user', 'admin')),
  email      text not null unique,
  created_at timestamptz not null default now()
);

-- ---------- Tabel: allowed_emails (allowlist Google OAuth) ----------
create table if not exists public.allowed_emails (
  email    text primary key,
  role     text not null default 'user' check (role in ('user', 'admin')),
  added_at timestamptz not null default now()
);

-- ---------- Trigger: enforce allowlist on signup ----------
-- Menjalankan untuk setiap insert ke auth.users (signup baru via Google OAuth).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed_role text;
begin
  select role into allowed_role
    from public.allowed_emails
   where email = lower(new.email);

  if allowed_role is not null then
    insert into public.profiles (id, role, email)
    values (new.id, allowed_role, lower(new.email))
    on conflict (id) do nothing;
  else
    -- Email tidak ada di allowlist -> hapus user supaya session invalid.
    delete from auth.users where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- RPC: get_link_by_code ----------
-- Satu-satunya jalan anon client membaca tabel links (anti enumerasi).
create or replace function public.get_link_by_code(p_code text)
returns table (
  id uuid,
  code text,
  target_url text,
  click_count integer
)
language sql
security definer
set search_path = public
stable
as $$
  select l.id, l.code, l.target_url, l.click_count
    from public.links l
   where l.code = p_code
   limit 1;
$$;

-- Increment hit counter (dipanggil dari frontend setelah redirect).
create or replace function public.increment_click_count(p_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.links
     set click_count = click_count + 1
   where code = p_code;
$$;

-- ---------- RPC: sync_profile_for_current_user ----------
-- Dipanggil admin-panel setelah login. Membuat/menyinkronkan baris profiles
-- untuk user yang sedang login kalau emailnya ada di allowed_emails.
-- Mengatasi kasus user auth.users yang dibuat sebelum trigger allowlist
-- terpasang (atau sebelum email ditambahkan ke allowlist) sehingga tidak
-- punya baris profiles.
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

-- ---------- Helper: is_admin ----------
-- Dipakai oleh RLS policies. SECURITY DEFINER supaya query ke profiles
-- melewati RLS dan tidak memicu infinite recursion policy.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;