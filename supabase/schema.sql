-- ============================================================
-- shortic — Supabase schema (canonical source of truth)
--
-- Idempotent: safe to re-run on a fresh or existing database.
-- Run in the Supabase SQL Editor as postgres/service role.
--
-- This file defines tables, functions, the allowlist trigger and
-- all grants. Every security fix is merged here:
--   * URL scheme check on links.target_url (blocks javascript: XSS)
--   * case-insensitive short-code lookup
--   * role-preserving profile sync (promotion/demotion persists)
--   * allowlist enforcement on signup via trigger
--
-- For an existing database, re-running this file updates functions
-- and grants via CREATE OR REPLACE / GRANT. If the URL check
-- constraint is missing on an already-created `links` table, add it
-- once with:
--   ALTER TABLE public.links
--     ADD CONSTRAINT links_target_url_http
--     CHECK (target_url ~* '^https?://') NOT VALID;
-- ============================================================

-- ---------- Table: links ----------
create table if not exists public.links (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  target_url  text not null check (target_url ~* '^https?://'),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  click_count integer not null default 0
);

comment on table public.links is 'Short codes -> target URLs. Only accessible via RPC get_link_by_code for anon.';

-- ---------- Table: profiles ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       text not null default 'user' check (role in ('user', 'admin')),
  email      text not null unique,
  created_at timestamptz not null default now()
);

-- ---------- Table: allowed_emails (Google OAuth allowlist) ----------
create table if not exists public.allowed_emails (
  email    text primary key,
  role     text not null default 'user' check (role in ('user', 'admin')),
  added_at timestamptz not null default now()
);

-- ---------- Trigger: enforce allowlist on signup ----------
-- Runs for every insert into auth.users (new Google OAuth signup).
-- If the email is not in the allowlist, the user row is deleted so
-- the freshly created session becomes invalid.
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
-- The only way an anon client reads the links table (anti-enumeration).
-- Case-insensitive: public-site lowercases the URL fragment, but legacy
-- codes may be mixed-case.
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
   where lower(l.code) = lower(p_code)
   limit 1;
$$;

grant execute on function public.get_link_by_code(text) to anon, authenticated;

-- ---------- RPC: increment_click_count ----------
-- Called from the public site after a redirect. Note: exposed to anon,
-- so anyone can inflate click counts; without a backend, rate limiting
-- is not enforced (see security audit note M3).
create or replace function public.increment_click_count(p_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.links
     set click_count = click_count + 1
   where lower(code) = lower(p_code);
$$;

grant execute on function public.increment_click_count(text) to anon, authenticated;

-- ---------- RPC: sync_profile_for_current_user ----------
-- Called by the admin panel after login. Creates/syncs the profiles row
-- for the current user when their email is in the allowlist. Also covers
-- users created before the allowlist trigger existed (or before their
-- email was allowlisted) that therefore have no profiles row.
--
-- On conflict the email is refreshed but the role is preserved, so a
-- promotion/demotion made from the dashboard is not overwritten on the
-- next login.
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

  -- Email not in allowlist -> not a valid user.
  if v_role is null then
    return null;
  end if;

  insert into public.profiles (id, role, email)
  values (auth.uid(), v_role, v_email)
  on conflict (id) do update set email = excluded.email
  returning * into v_profile;

  return v_profile;
end;
$$;

grant execute on function public.sync_profile_for_current_user() to authenticated;

-- ---------- Helper: is_admin ----------
-- Used by the RLS policies. SECURITY DEFINER so the query on profiles
-- bypasses RLS and does not trigger infinite policy recursion.
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
