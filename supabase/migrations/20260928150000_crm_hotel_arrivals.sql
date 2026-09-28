-- Cycle d'arrivée hôtel : un suivi par carte hôtel. Staff seulement.
-- Jamais de PAN, d'expiration ou de cryptogramme dans cette table.

create table if not exists public.crm_hotel_arrivals (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  booking_item_id uuid not null references public.crm_booking_items (id) on delete cascade,
  channel text not null check (channel in ('little_emperors', 'direct', 'expedia')),
  status text not null default 'pending' check (status in (
    'pending',
    'link_requested',
    'link_received',
    'paying',
    'paid',
    'vip_sent',
    'blocked',
    'closed'
  )),
  net_cents integer,
  amount_cents integer,
  currency text not null default 'EUR',
  pliant_card_id text,
  card_limit_cents integer,
  payment_url text,
  requested_at timestamptz,
  relance_count integer not null default 0,
  last_relance_at timestamptz,
  paid_at timestamptz,
  vip_sent_at timestamptz,
  card_closed_at timestamptz,
  blocked_reason text,
  task_open boolean not null default false,
  task_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_item_id)
);

create index if not exists crm_hotel_arrivals_status_idx
  on public.crm_hotel_arrivals (status);

drop trigger if exists trg_crm_hotel_arrivals_updated on public.crm_hotel_arrivals;
create trigger trg_crm_hotel_arrivals_updated
  before update on public.crm_hotel_arrivals
  for each row execute function public.crm_set_updated_at();

revoke all on public.crm_hotel_arrivals from anon, public;
grant select, insert, update, delete on public.crm_hotel_arrivals to authenticated;

alter table public.crm_hotel_arrivals enable row level security;

drop policy if exists crm_hotel_arrivals_staff on public.crm_hotel_arrivals;
create policy crm_hotel_arrivals_staff on public.crm_hotel_arrivals
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());
