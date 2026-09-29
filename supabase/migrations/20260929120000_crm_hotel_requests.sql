-- Bureau hôtel : une étape par action et par carte. Staff seulement.
-- Jamais de PAN, d'expiration ou de cryptogramme dans cette table.

create table if not exists public.crm_hotel_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  booking_item_id uuid not null references public.crm_booking_items (id) on delete cascade,
  kind text not null check (kind in (
    'payment_link',
    'upgrade',
    'precheckin',
    'full_credit',
    'transfer',
    'concierge'
  )),
  status text not null default 'waiting' check (status in (
    'waiting',
    'due',
    'draft',
    'sent',
    'follow_up',
    'replied',
    'skipped'
  )),
  recipients text[] not null default '{}',
  subject text not null default '',
  body text not null default '',
  edited boolean not null default false,
  card_choice text check (card_choice is null or card_choice in ('pliant', 'client')),
  attach_passports boolean not null default false,
  due_on date,
  sent_at timestamptz,
  follow_up_count integer not null default 0,
  last_follow_up_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_item_id, kind)
);

create index if not exists crm_hotel_requests_booking_idx
  on public.crm_hotel_requests (booking_id);

create index if not exists crm_hotel_requests_status_idx
  on public.crm_hotel_requests (status);

drop trigger if exists trg_crm_hotel_requests_updated on public.crm_hotel_requests;
create trigger trg_crm_hotel_requests_updated
  before update on public.crm_hotel_requests
  for each row execute function public.crm_set_updated_at();

revoke all on public.crm_hotel_requests from anon, public;
grant select, insert, update, delete on public.crm_hotel_requests to authenticated;

alter table public.crm_hotel_requests enable row level security;

drop policy if exists crm_hotel_requests_staff on public.crm_hotel_requests;
create policy crm_hotel_requests_staff on public.crm_hotel_requests
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());
