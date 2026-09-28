-- Le cron Gmail (service_role) appelle public.crm_next_booking_reference.
-- Sans security definer, Postgres résout crm_private.next_booking_reference
-- avec le rôle appelant, qui n'a pas USAGE sur crm_private (42501).
-- Le contrôle staff / service_role reste dans la fonction privée.
-- Ne pas accorder USAGE sur crm_private au Data API.

create or replace function public.crm_next_booking_reference()
returns text
language sql
security definer
set search_path = public, crm_private
as $$ select crm_private.next_booking_reference(); $$;

revoke all on function public.crm_next_booking_reference() from public;
grant execute on function public.crm_next_booking_reference() to authenticated;
grant execute on function public.crm_next_booking_reference() to service_role;
