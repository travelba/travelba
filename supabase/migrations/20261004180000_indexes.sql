-- Index manquants sur les clés étrangères et les colonnes filtrées par le code
-- (audit 03-backend §1.6 e). Postgres n'indexe pas les FK automatiquement :
-- RLS `customer_id = …`, jointures `booking_id`, crons `(kind, start_at)`, files
-- `status` et rapprochements téléphone passaient en seq scan.
--
-- Sans `concurrently` : volontaire. La CLI Supabase joue les migrations dans une
-- transaction, qui interdit `create index concurrently`. Tables petites, verrou bref.
-- Déjà indexés, donc absents ici : crm_bookings(billing_customer_id),
-- crm_travel_documents(booking_id), crm_hotel_requests(booking_id).

-- Dossiers et contenu
create index if not exists crm_bookings_customer_idx
  on public.crm_bookings (customer_id);

create index if not exists crm_booking_items_booking_idx
  on public.crm_booking_items (booking_id);

create index if not exists crm_booking_items_kind_start_idx
  on public.crm_booking_items (kind, start_at);

create index if not exists crm_booking_travelers_booking_idx
  on public.crm_booking_travelers (booking_id);

create index if not exists crm_booking_documents_booking_idx
  on public.crm_booking_documents (booking_id);

create index if not exists crm_booking_documents_storage_path_idx
  on public.crm_booking_documents (storage_path);

-- Grand livre (vue crm_customer_balances, syncBooking*, RLS client)
create index if not exists crm_transactions_customer_idx
  on public.crm_transactions (customer_id);

create index if not exists crm_transactions_booking_idx
  on public.crm_transactions (booking_id);

create index if not exists crm_transactions_status_idx
  on public.crm_transactions (status);

-- Fiche client : accompagnateurs, pièces, cartes
create index if not exists crm_travel_companions_customer_idx
  on public.crm_travel_companions (customer_id);

create index if not exists crm_travel_documents_customer_idx
  on public.crm_travel_documents (customer_id);

create index if not exists crm_travel_documents_companion_idx
  on public.crm_travel_documents (companion_id);

create index if not exists crm_payment_methods_customer_idx
  on public.crm_payment_methods (customer_id);

-- Webhook WhatsApp : rapprochement par numéro
create index if not exists crm_customers_phone_idx
  on public.crm_customers (phone);

create index if not exists crm_customers_phone_secondary_idx
  on public.crm_customers (phone_secondary);

-- Files de traitement
create index if not exists crm_revolut_transactions_status_direction_idx
  on public.crm_revolut_transactions (status, direction);

create index if not exists crm_whatsapp_messages_status_idx
  on public.crm_whatsapp_messages (status);

create index if not exists crm_email_ingest_created_booking_idx
  on public.crm_email_ingest (created_booking_id);

create index if not exists crm_hotel_arrivals_booking_idx
  on public.crm_hotel_arrivals (booking_id);
