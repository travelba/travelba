-- Espace client. Les lectures sont déjà indexées sur customer_id ou booking_id,
-- puis triées en mémoire (EXPLAIN : Index Scan + Sort, < 1 ms sur les volumes actuels).
-- Ces composites servent le filtre et l’ordre de la liste, du carnet et du grand livre.
-- Non appliqué : à jouer dans le SQL Editor, pas depuis l’application.

create index if not exists crm_bookings_customer_open_start_idx
  on public.crm_bookings (customer_id, start_date desc)
  where archived_at is null;

create index if not exists crm_booking_items_booking_sort_idx
  on public.crm_booking_items (booking_id, sort_order);

create index if not exists crm_booking_documents_visible_idx
  on public.crm_booking_documents (booking_id)
  where visible_to_client;

create index if not exists crm_transactions_customer_posted_occurred_idx
  on public.crm_transactions (customer_id, occurred_on desc)
  where status = 'posted';
