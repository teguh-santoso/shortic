-- ============================================================
-- shortic — one-time reconcile (optional)
--
-- Creates a profiles row for auth.users that already exist but have
-- no profile yet (e.g. created before the allowlist trigger was
-- installed). Run once in the Supabase SQL Editor.
-- ============================================================

-- 0. Guard: abort if the allowlist is empty (avoids deleting every admin).
do $$
begin
  if (select count(*) from public.allowed_emails) = 0 then
    raise exception 'ABORT: allowed_emails is empty. Add at least one admin before reconciling.';
  end if;
end
$$;

-- 1. Create a profile for users whose email is already in the allowlist.
insert into public.profiles (id, role, email)
select u.id, a.role, lower(u.email)
  from auth.users u
  join public.allowed_emails a on a.email = lower(u.email)
  left join public.profiles p on p.id = u.id
 where p.id is null;

-- 2. Remove users whose email is NOT in the allowlist (clean up legacy accounts).
delete from auth.users u
 where not exists (
   select 1 from public.allowed_emails a where a.email = lower(u.email)
 );
