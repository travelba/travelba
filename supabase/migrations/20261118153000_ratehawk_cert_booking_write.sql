-- Le relecteur écrit ses réservations de bac à sable avec sa session.
-- Une ligne de production reste refusée.

drop policy if exists crm_ratehawk_bookings_cert_write on public.crm_ratehawk_bookings;
create policy crm_ratehawk_bookings_cert_write on public.crm_ratehawk_bookings
  for all to authenticated
  using (crm_private.agency_role() = 'ratehawk_cert')
  with check (crm_private.agency_role() = 'ratehawk_cert' and environment = 'sandbox');
