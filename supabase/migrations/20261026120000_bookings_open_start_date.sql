-- Dossiers ouverts, triés par date de départ.
-- crm_bookings_archived_at_idx ne couvre que archived_at IS NOT NULL :
-- le filtre inverse (la semaine, la liste) ne peut pas s'en servir.

create index if not exists crm_bookings_open_start_date_idx
  on public.crm_bookings (start_date)
  where archived_at is null;
