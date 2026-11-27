-- Demande de billets de train. Le CRM n’achète pas : il garde le choix et prévient le bot SNCF.
-- Carte de réduction sur la fiche voyageur (titulaire ou accompagnateur). À jouer à la main.

create table if not exists public.crm_sncf_cards (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.crm_customers (id) on delete cascade,
  companion_id uuid references public.crm_travel_companions (id) on delete cascade,
  card_type text not null,
  card_number text not null,
  valid_until date,
  updated_at timestamptz not null default now(),
  constraint crm_sncf_cards_owner_check check (
    (customer_id is not null and companion_id is null)
    or (customer_id is null and companion_id is not null)
  ),
  constraint crm_sncf_cards_type_check check (char_length(btrim(card_type)) between 1 and 80),
  constraint crm_sncf_cards_number_check check (char_length(btrim(card_number)) between 1 and 40)
);

create unique index if not exists crm_sncf_cards_customer_uidx
  on public.crm_sncf_cards (customer_id) where customer_id is not null;
create unique index if not exists crm_sncf_cards_companion_uidx
  on public.crm_sncf_cards (companion_id) where companion_id is not null;

create table if not exists public.crm_train_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  customer_id uuid not null references public.crm_customers (id) on delete restrict,
  status text not null default 'nouvelle',
  depart_ville text not null,
  arrivee_ville text not null,
  aller_date date not null,
  aller_creneau text not null default 'À partir de 8h',
  retour_date date,
  retour_creneau text,
  voyageur_ids uuid[] not null,
  placement text not null default '',
  aller jsonb not null default '[]'::jsonb,
  retour jsonb not null default '[]'::jsonb,
  step text not null default 'aller',
  choix_aller int,
  choix_retour int,
  classe text,
  tarif text,
  ambigu_compte int not null default 0,
  besoin_agence boolean not null default false,
  horaire_leg text,
  reference_sncf text,
  prix_paye numeric(12, 2),
  suite text,
  billets_envoyes date[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_train_requests_status_check check (
    status in ('nouvelle', 'recherche', 'propositions', 'en_attente', 'prix_a_reconfirmer', 'choix', 'commande', 'annulee')
  ),
  constraint crm_train_requests_step_check check (
    step in ('aller', 'retour', 'horaires', 'classe', 'tarif', 'accord', 'fait')
  ),
  constraint crm_train_requests_classe_check check (classe is null or classe in ('2de', '1re')),
  constraint crm_train_requests_tarif_check check (tarif is null or tarif in ('non_remboursable', 'flex')),
  constraint crm_train_requests_suite_check check (suite is null or suite in ('echange', 'annulation'))
);

create index if not exists crm_train_requests_booking_idx on public.crm_train_requests (booking_id, created_at desc);
create index if not exists crm_train_requests_status_idx on public.crm_train_requests (status, updated_at desc);

alter table public.crm_sncf_cards enable row level security;
alter table public.crm_train_requests enable row level security;

revoke all on public.crm_sncf_cards from anon, authenticated;
revoke all on public.crm_train_requests from anon, authenticated;
grant select, insert, update, delete on public.crm_sncf_cards to authenticated;
grant select, insert, update, delete on public.crm_train_requests to authenticated;
grant all on public.crm_sncf_cards to service_role;
grant all on public.crm_train_requests to service_role;

drop policy if exists crm_sncf_cards_staff on public.crm_sncf_cards;
create policy crm_sncf_cards_staff on public.crm_sncf_cards
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_train_requests_staff on public.crm_train_requests;
create policy crm_train_requests_staff on public.crm_train_requests
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

comment on table public.crm_train_requests is
  'Demande de train. Le bot SNCF cherche et achète. Le CRM garde le choix et n’achète pas avant l’accord.';
