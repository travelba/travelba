alter table public.crm_booking_documents
  add column if not exists hide_prices boolean,
  add column if not exists client_storage_path text;

-- Une seconde exécution ne doit pas trancher les PDF encore en attente.
update public.crm_booking_documents
set hide_prices = false
where hide_prices is null
  and created_at < timestamptz '2026-09-30 04:00:00+00';
