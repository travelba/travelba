-- Concierge : devis, urgence, prospect, pause du fil.
-- À appliquer avant de brancher le webhook Twilio. Ne crée aucune fiche.

alter table public.crm_whatsapp_requests
  alter column customer_id drop not null;

alter table public.crm_whatsapp_requests
  add column if not exists phone text,
  add column if not exists status text not null default 'open',
  add column if not exists resolved_at timestamptz;

alter table public.crm_whatsapp_requests
  drop constraint if exists crm_whatsapp_requests_kind_check;

alter table public.crm_whatsapp_requests
  add constraint crm_whatsapp_requests_kind_check
  check (kind in (
    'change', 'cancel', 'payment', 'formality', 'chauffeur',
    'complaint', 'question', 'quote', 'urgent', 'lead'
  ));

alter table public.crm_whatsapp_requests
  drop constraint if exists crm_whatsapp_requests_status_check;

alter table public.crm_whatsapp_requests
  add constraint crm_whatsapp_requests_status_check
  check (status in ('open', 'done'));

alter table public.crm_whatsapp_requests
  drop constraint if exists crm_whatsapp_requests_holder_check;

alter table public.crm_whatsapp_requests
  add constraint crm_whatsapp_requests_holder_check
  check (customer_id is not null or phone is not null);

create index if not exists crm_whatsapp_requests_open_idx
  on public.crm_whatsapp_requests (created_at desc)
  where status = 'open';

create table if not exists public.crm_whatsapp_threads (
  phone text primary key,
  customer_id uuid references public.crm_customers (id) on delete set null,
  paused_at timestamptz,
  paused_until timestamptz,
  paused_by uuid references public.crm_staff (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.crm_whatsapp_threads enable row level security;

drop policy if exists crm_whatsapp_threads_staff on public.crm_whatsapp_threads;
create policy crm_whatsapp_threads_staff on public.crm_whatsapp_threads
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

grant select, insert, update, delete on public.crm_whatsapp_threads to authenticated;
grant all on public.crm_whatsapp_threads to service_role;
