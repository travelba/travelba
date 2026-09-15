-- Prevent authenticated customers from consuming reservation sequence values
-- by calling the public RPC directly. The API already requires staff, but the
-- database function is the final authorization boundary.
create or replace function public.crm_next_booking_reference()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  y int := extract(year from now())::int;
  n int;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not crm_private.is_staff()
  then
    raise exception 'Accès réservé au personnel'
      using errcode = '42501';
  end if;

  insert into public.crm_booking_seq (year, last)
  values (y, 1)
  on conflict (year) do update set last = public.crm_booking_seq.last + 1
  returning last into n;

  return 'TB-' || y::text || '-' || lpad(n::text, 4, '0');
end;
$$;

revoke all on function public.crm_next_booking_reference() from public, anon;
grant execute on function public.crm_next_booking_reference() to authenticated, service_role;
