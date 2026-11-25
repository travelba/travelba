-- Le relecteur Ratehawk lit le contenu statique avec sa session.
-- Il reste hors is_staff() : pas de clients, pas de dossiers, pas de grand livre.

drop policy if exists crm_ratehawk_hotels_cert_read on public.crm_ratehawk_hotels;
create policy crm_ratehawk_hotels_cert_read on public.crm_ratehawk_hotels
  for select to authenticated
  using (crm_private.agency_role() = 'ratehawk_cert');

drop policy if exists crm_ratehawk_regions_cert_read on public.crm_ratehawk_regions;
create policy crm_ratehawk_regions_cert_read on public.crm_ratehawk_regions
  for select to authenticated
  using (crm_private.agency_role() = 'ratehawk_cert');

drop policy if exists crm_ratehawk_bookings_cert_read on public.crm_ratehawk_bookings;
create policy crm_ratehawk_bookings_cert_read on public.crm_ratehawk_bookings
  for select to authenticated
  using (crm_private.agency_role() = 'ratehawk_cert');
