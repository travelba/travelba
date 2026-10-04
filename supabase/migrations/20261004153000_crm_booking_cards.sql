-- Cartes Pliant libres d'un dossier. Plusieurs par réservation. Staff seulement.
-- Jamais de PAN, d'expiration ou de cryptogramme.

create table if not exists public.crm_booking_cards (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  pliant_card_id text not null,
  label text not null,
  first_name text not null,
  last_name text not null,
  limit_cents integer not null check (limit_cents > 0),
  currency text not null default 'EUR',
  valid_from date not null,
  valid_to date not null,
  created_at timestamptz not null default now(),
  unique (pliant_card_id)
);

create index if not exists crm_booking_cards_booking_idx
  on public.crm_booking_cards (booking_id, created_at);

revoke all on public.crm_booking_cards from anon, public;
grant select, insert, update, delete on public.crm_booking_cards to authenticated;

alter table public.crm_booking_cards enable row level security;

drop policy if exists crm_booking_cards_staff on public.crm_booking_cards;
create policy crm_booking_cards_staff on public.crm_booking_cards
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());
