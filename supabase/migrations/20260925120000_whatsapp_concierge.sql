-- File d’attente des messages Concierge. Le service role écrit, le staff lit.

alter table public.crm_whatsapp_messages
  add column if not exists booking_id uuid references public.crm_bookings (id) on delete cascade,
  add column if not exists dedupe_key text,
  add column if not exists payload jsonb;

create unique index if not exists crm_whatsapp_messages_dedupe_key_idx
  on public.crm_whatsapp_messages (dedupe_key)
  where dedupe_key is not null;

create index if not exists crm_whatsapp_messages_booking_idx
  on public.crm_whatsapp_messages (booking_id, created_at desc);
