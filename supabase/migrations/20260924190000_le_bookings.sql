-- Réservations Little Emperors (API de test). Staff en lecture, écriture service role.
-- Aucun téléphone ni e-mail d’hôtel : l’API ne les fournit pas.

create table if not exists public.crm_le_bookings (
  id uuid primary key default gen_random_uuid(),
  le_booking_id bigint not null unique,
  confirmation_number text,
  state text,
  hotel_id bigint,
  hotel_name text,
  address text,
  city text,
  website text,
  check_in date,
  check_out date,
  currency text,
  total_cost text,
  is_cancellable boolean,
  cancellation_deadline text,
  guest_names text[] not null default '{}',
  cancellation_policies text[] not null default '{}',
  room_types text[] not null default '{}',
  raw jsonb not null default '{}'::jsonb,
  crm_booking_id uuid references public.crm_bookings (id) on delete set null,
  status text not null default 'unmatched'
    check (status in ('unmatched', 'linked', 'ignored')),
  candidates jsonb not null default '[]'::jsonb,
  last_event text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_le_bookings_status_idx
  on public.crm_le_bookings (status, check_in desc);

create index if not exists crm_le_bookings_crm_booking_idx
  on public.crm_le_bookings (crm_booking_id);

create table if not exists public.crm_le_sync (
  provider text primary key,
  last_status int,
  last_error text,
  last_ok_at timestamptz,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_crm_le_bookings_updated on public.crm_le_bookings;
create trigger trg_crm_le_bookings_updated
  before update on public.crm_le_bookings
  for each row execute function public.crm_set_updated_at();

drop trigger if exists trg_crm_le_sync_updated on public.crm_le_sync;
create trigger trg_crm_le_sync_updated
  before update on public.crm_le_sync
  for each row execute function public.crm_set_updated_at();

grant select, insert, update, delete on
  public.crm_le_bookings,
  public.crm_le_sync
to authenticated;

alter table public.crm_le_bookings enable row level security;
alter table public.crm_le_sync enable row level security;

drop policy if exists crm_le_bookings_staff on public.crm_le_bookings;
create policy crm_le_bookings_staff on public.crm_le_bookings
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_le_sync_staff on public.crm_le_sync;
create policy crm_le_sync_staff on public.crm_le_sync
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());
