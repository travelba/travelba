-- Accès Hôtels par client, réglage du bouton, demandes Platinum, réservation directe.
-- Faux par défaut. Benjamin et le compte de démonstration sont activés.
-- Le bouton, au déploiement, n’apparaît que pour ces accès. service_role seulement
-- pour les tables nouvelles. Pas de PAN.

alter table public.crm_customers
  add column if not exists hotel_booking_enabled boolean not null default false,
  add column if not exists hotel_demo boolean not null default false,
  add column if not exists hotel_direct_live boolean not null default false;

comment on column public.crm_customers.hotel_booking_enabled is
  'Réservation d’hôtels en autonomie. L’agence seule l’active. Défaut faux.';
comment on column public.crm_customers.hotel_demo is
  'Compte de démonstration. Le mode réel reste impossible.';
comment on column public.crm_customers.hotel_direct_live is
  'Envois réels pour ce client. Défaut faux. Ignoré si hotel_demo.';

create or replace function crm_private.protect_customer_agency_flags()
returns trigger
language plpgsql
security definer
set search_path = public, crm_private
as $$
begin
  if auth.role() = 'service_role' or crm_private.is_staff() then
    return new;
  end if;
  new.on_hold := old.on_hold;
  new.is_vip := old.is_vip;
  new.spending_allowance := old.spending_allowance;
  new.hotel_booking_enabled := old.hotel_booking_enabled;
  new.hotel_demo := old.hotel_demo;
  new.hotel_direct_live := old.hotel_direct_live;
  return new;
end;
$$;

create table if not exists public.crm_hotel_access_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers (id) on delete cascade,
  staff_id uuid,
  enabled boolean not null,
  live_mode boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_hotel_access_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'refused')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid
);

create unique index if not exists crm_hotel_access_requests_one_pending
  on public.crm_hotel_access_requests (customer_id)
  where status = 'pending';

create table if not exists public.crm_hotel_button_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.crm_hotel_button_events (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  value text not null,
  staff_id uuid,
  created_at timestamptz not null default now()
);

insert into public.crm_hotel_button_settings (key, value)
values ('hotel_button_visibility', 'authorized')
on conflict (key) do nothing;

create table if not exists public.crm_hotel_direct_stays (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers (id) on delete cascade,
  offer_id uuid,
  booking_id uuid,
  booking_item_id uuid,
  idempotency_key text not null unique,
  phase text not null,
  pay_method text not null check (pay_method in ('card', 'agency')),
  supplier text not null check (supplier in ('direct_email', 'little_emperors')),
  trial boolean not null default true,
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists crm_hotel_direct_stays_open_offer
  on public.crm_hotel_direct_stays (customer_id, offer_id)
  where offer_id is not null and phase in ('transmitted', 'confirming', 'confirmed', 'refunding');

create table if not exists public.crm_hotel_direct_events (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references public.crm_hotel_direct_stays (id) on delete cascade,
  at timestamptz not null default now(),
  actor text not null,
  actor_id uuid,
  action text not null,
  detail text not null default '',
  idempotency_key text
);

create unique index if not exists crm_hotel_direct_events_key
  on public.crm_hotel_direct_events (stay_id, idempotency_key)
  where idempotency_key is not null;

alter table public.crm_hotel_access_events enable row level security;
alter table public.crm_hotel_access_requests enable row level security;
alter table public.crm_hotel_button_settings enable row level security;
alter table public.crm_hotel_button_events enable row level security;
alter table public.crm_hotel_direct_stays enable row level security;
alter table public.crm_hotel_direct_events enable row level security;

revoke all on public.crm_hotel_access_events from anon, authenticated, public;
revoke all on public.crm_hotel_access_requests from anon, authenticated, public;
revoke all on public.crm_hotel_button_settings from anon, authenticated, public;
revoke all on public.crm_hotel_button_events from anon, authenticated, public;
revoke all on public.crm_hotel_direct_stays from anon, authenticated, public;
revoke all on public.crm_hotel_direct_events from anon, authenticated, public;

grant all on public.crm_hotel_access_events to service_role;
grant all on public.crm_hotel_access_requests to service_role;
grant all on public.crm_hotel_button_settings to service_role;
grant all on public.crm_hotel_button_events to service_role;
grant all on public.crm_hotel_direct_stays to service_role;
grant all on public.crm_hotel_direct_events to service_role;

alter table public.crm_customers disable trigger crm_customers_protect_agency_flags;
update public.crm_customers
set hotel_booking_enabled = true
where id = '07b9dde3-de59-4b1a-88b7-03a6e23e98a6';
alter table public.crm_customers enable trigger crm_customers_protect_agency_flags;

insert into public.crm_customers (
  id, email, first_name, last_name, language, hotel_booking_enabled, hotel_demo, hotel_direct_live
) values (
  'd4e0a000-1111-4111-8111-0000000000de',
  'revue-hotels@travelba.fr',
  'Revue',
  'Hôtels',
  'fr',
  true,
  true,
  false
)
on conflict (email) do update
  set hotel_booking_enabled = true,
      hotel_demo = true,
      hotel_direct_live = false;
