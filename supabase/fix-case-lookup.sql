-- ============================================================
-- shortic — fix lookup case-sensitive (jalankan SEKALI di SQL Editor
-- sebagai postgres/service role). Link lama dengan kode campuran
-- (mis. 'lSACbW') tidak ter-redirect karena public-site men-lowercase hash.
-- ============================================================

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

grant execute on function public.get_link_by_code(text) to anon, authenticated;
grant execute on function public.increment_click_count(text) to anon, authenticated;
