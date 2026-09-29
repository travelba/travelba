-- Code maître personnel et journal des consultations. Jamais de PAN ici.
-- L'empreinte n'est pas sur crm_staff : un select staff ne doit pas la ramener.

create table if not exists public.crm_staff_card_codes (
  staff_id uuid primary key references public.crm_staff (id) on delete cascade,
  card_code_hash text not null,
  updated_at timestamptz not null default now()
);

comment on table public.crm_staff_card_codes is
  'Empreinte du code maître personnel. Service role seulement.';

revoke all on public.crm_staff_card_codes from anon, authenticated, public;

alter table public.crm_staff_card_codes enable row level security;

alter table public.crm_hotel_arrivals
  add column if not exists client_card_path text,
  add column if not exists client_card_name text;

comment on column public.crm_hotel_arrivals.client_card_path is
  'Photo de la carte du client, coffre agence. Pas de numéro en colonne.';

create table if not exists public.crm_card_views (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.crm_staff (id) on delete cascade,
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  booking_item_id uuid references public.crm_booking_items (id) on delete cascade,
  source text not null check (source in ('pliant', 'client')),
  created_at timestamptz not null default now()
);

comment on table public.crm_card_views is
  'Qui a ouvert une carte. Aucun numéro.';

create index if not exists crm_card_views_booking_idx
  on public.crm_card_views (booking_id, created_at desc);

revoke all on public.crm_card_views from anon, authenticated, public;
grant select on public.crm_card_views to authenticated;

alter table public.crm_card_views enable row level security;

drop policy if exists crm_card_views_staff on public.crm_card_views;
create policy crm_card_views_staff on public.crm_card_views
  for select to authenticated
  using (crm_private.is_staff());
