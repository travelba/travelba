-- B-04 : plus de numéro de carte ni de cryptogramme par e-mail. L’hôtel reçoit un lien court
-- /k/CODE (empreinte seulement en base) qui affiche la carte Pliant dans le cadre sécurisé de
-- Pliant, ou la carte déposée par le client. Quelques ouvertures, jusqu’à peu après le départ.
-- Chaque ouverture par un hôtel est journalisée dans crm_card_views.
-- Additive : à appliquer avant le déploiement du code.

create table if not exists public.crm_card_links (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  booking_item_id uuid references public.crm_booking_items (id) on delete cascade,
  hotel_request_id uuid references public.crm_hotel_requests (id) on delete set null,
  source text not null check (source in ('pliant', 'client')),
  pliant_card_id text,
  client_card_path text,
  created_by_staff_id uuid references public.crm_staff (id) on delete set null,
  expires_at timestamptz not null,
  max_opens int not null default 3 check (max_opens between 1 and 10),
  open_count int not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (source = 'pliant' and pliant_card_id is not null)
    or (source = 'client' and client_card_path is not null)
  )
);

comment on table public.crm_card_links is
  'Liens carte envoyés aux hôtels (/k/CODE). Empreinte du code seulement, aucun numéro. Service role.';

create index if not exists crm_card_links_request_idx
  on public.crm_card_links (hotel_request_id)
  where hotel_request_id is not null;
create index if not exists crm_card_links_booking_idx
  on public.crm_card_links (booking_id, created_at desc);

alter table public.crm_card_links enable row level security;
revoke all on public.crm_card_links from anon, authenticated, public;
grant all on public.crm_card_links to service_role;

-- Journal des lectures : un agent (staff_id) ou un hôtel par son lien (card_link_id).
alter table public.crm_card_views
  alter column staff_id drop not null;
alter table public.crm_card_views
  add column if not exists viewer text not null default 'staff';
alter table public.crm_card_views
  add column if not exists card_link_id uuid references public.crm_card_links (id) on delete cascade;

alter table public.crm_card_views
  drop constraint if exists crm_card_views_viewer_check;
alter table public.crm_card_views
  add constraint crm_card_views_viewer_check check (
    (viewer = 'staff' and staff_id is not null)
    or (viewer = 'hotel' and card_link_id is not null)
  );

comment on column public.crm_card_views.viewer is
  'staff : un agent depuis le dossier ; hotel : ouverture du lien envoyé à l’hôtel.';
