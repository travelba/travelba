-- Plusieurs remises commerciales par dossier. Additive.
-- Une ligne : libellé, quantité, prix unitaire ou pourcentage.
-- Ne touche pas aux colonnes remise_type / remise_value : elles restent la lecture
-- tant que cette table n’est pas en place. Le code n’écrit plus ces colonnes.
-- À jouer à la main. Sans elle, l’ajout répond d’appliquer la migration.

create table if not exists public.crm_booking_discounts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  label text not null,
  kind text not null,
  quantity numeric(12, 3) not null default 1,
  unit_price numeric(12, 2),
  percent numeric(6, 2),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_booking_discounts_label_len check (char_length(btrim(label)) between 1 and 120),
  constraint crm_booking_discounts_kind_check check (kind in ('amount', 'percent')),
  constraint crm_booking_discounts_quantity_check check (quantity > 0 and quantity <= 9999),
  constraint crm_booking_discounts_value_check check (
    (kind = 'amount' and unit_price is not null and unit_price > 0 and percent is null)
    or (kind = 'percent' and percent is not null and percent > 0 and percent <= 100 and unit_price is null)
  )
);

create index if not exists crm_booking_discounts_booking_idx
  on public.crm_booking_discounts (booking_id, sort_order, created_at);

comment on table public.crm_booking_discounts is
  'Remises commerciales du dossier. Hors itinéraire. Un montant est quantité × prix unitaire. Un pourcentage est une part de la vente TTC, quantité comprise.';

-- Reprise de la remise unique déjà saisie. Une seconde exécution n’ajoute rien.
insert into public.crm_booking_discounts (booking_id, label, kind, quantity, unit_price, percent, sort_order)
select
  b.id,
  'Remise commerciale',
  b.remise_type,
  1,
  case when b.remise_type = 'amount' then b.remise_value else null end,
  case when b.remise_type = 'percent' then b.remise_value else null end,
  0
from public.crm_bookings b
where b.remise_type in ('amount', 'percent')
  and b.remise_value is not null
  and b.remise_value > 0
  and not exists (
    select 1 from public.crm_booking_discounts d where d.booking_id = b.id
  );

alter table public.crm_booking_discounts enable row level security;

revoke all on public.crm_booking_discounts from anon, authenticated;
grant all on public.crm_booking_discounts to service_role;
