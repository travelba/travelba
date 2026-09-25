-- Fil WhatsApp du Concierge : séjour reconnu sur le message, demande transmise à l’agence.
-- Le bot n’écrit pas les séjours, le grand livre ni les formalités.

alter table public.crm_whatsapp_messages
  add column if not exists booking_id uuid references public.crm_bookings (id) on delete set null;

create index if not exists crm_whatsapp_messages_booking_idx
  on public.crm_whatsapp_messages (booking_id, created_at desc);

create table if not exists public.crm_whatsapp_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers (id) on delete cascade,
  booking_id uuid references public.crm_bookings (id) on delete set null,
  message_id uuid references public.crm_whatsapp_messages (id) on delete set null,
  kind text not null check (kind in ('change', 'cancel', 'payment', 'formality', 'chauffeur')),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists crm_whatsapp_requests_customer_idx
  on public.crm_whatsapp_requests (customer_id, created_at desc);

grant select, insert, update, delete on public.crm_whatsapp_requests to authenticated;
grant all on public.crm_whatsapp_requests to service_role;

alter table public.crm_whatsapp_requests enable row level security;

drop policy if exists crm_whatsapp_requests_staff on public.crm_whatsapp_requests;
create policy crm_whatsapp_requests_staff on public.crm_whatsapp_requests
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());
