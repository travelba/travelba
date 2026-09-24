-- Lien de connexion WhatsApp (concierge). Staff lit, le service role écrit.

alter table public.crm_customers
  add column if not exists whatsapp_opt_in_at timestamptz;

create table if not exists public.crm_whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.crm_customers (id) on delete cascade,
  direction text not null default 'outbound'
    check (direction in ('inbound', 'outbound')),
  template_key text,
  body text not null,
  twilio_sid text unique,
  status text not null default 'sent'
    check (status in ('queued', 'sent', 'delivered', 'read', 'failed', 'received')),
  error text,
  created_at timestamptz not null default now()
);

create index if not exists crm_whatsapp_messages_customer_idx
  on public.crm_whatsapp_messages (customer_id, created_at desc);

grant select, insert, update, delete on public.crm_whatsapp_messages to authenticated;

alter table public.crm_whatsapp_messages enable row level security;

drop policy if exists crm_whatsapp_messages_staff on public.crm_whatsapp_messages;
create policy crm_whatsapp_messages_staff on public.crm_whatsapp_messages
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());
