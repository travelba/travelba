-- Mode test restaurants. Isolé des vrais clients. Additive. À jouer à la main.

alter table public.crm_customers
  add column if not exists is_test boolean not null default false;

alter table public.crm_bookings
  add column if not exists is_test boolean not null default false;

alter table public.crm_restaurant_tables
  add column if not exists is_test boolean not null default false;

alter table public.crm_restaurant_evenings
  add column if not exists is_test boolean not null default false;

alter table public.crm_restaurant_messages
  add column if not exists is_test boolean not null default false;

comment on column public.crm_customers.is_test is
  'Client fictif du mode test. Le cron et les envois réels l’ignorent.';

comment on column public.crm_bookings.is_test is
  'Séjour fictif TEST Benjamin. Aucun message au client réel.';

create index if not exists crm_bookings_is_test_idx
  on public.crm_bookings (is_test)
  where is_test;
