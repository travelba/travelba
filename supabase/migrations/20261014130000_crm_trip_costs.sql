-- Comptabilité du voyage : une sortie Pliant ou Revolut est un coût rattaché à une ligne vendue.
-- Le client ne voit que la vente. La facture MB3M reçoit la vente et la marge.

create table if not exists public.crm_trip_costs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  booking_item_id uuid references public.crm_booking_items (id) on delete set null,
  source text not null,
  source_id text not null,
  amount_eur numeric(12,2) not null,
  original_amount numeric(12,2),
  original_currency text,
  supplier text,
  occurred_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_trip_costs
  drop constraint if exists crm_trip_costs_source_check;

alter table public.crm_trip_costs
  add constraint crm_trip_costs_source_check check (source in ('pliant', 'revolut'));

create unique index if not exists crm_trip_costs_source_uidx
  on public.crm_trip_costs (source, source_id);

create index if not exists crm_trip_costs_booking_idx
  on public.crm_trip_costs (booking_id);

create index if not exists crm_trip_costs_item_idx
  on public.crm_trip_costs (booking_item_id);

alter table public.crm_trip_costs enable row level security;

revoke all on public.crm_trip_costs from anon, authenticated;
grant all on public.crm_trip_costs to service_role;

-- Sorties Revolut : tout l’historique entre dans la file à rattacher.
-- unmatched = à rattacher, matched = rattaché à un voyage, ignored = hors voyage.
update public.crm_revolut_transactions
set status = 'unmatched'
where direction = 'debit' and status = 'ignored';

-- Avoir MB3M : l’avoir annule une facture imprimée dont la marge a changé.
alter table public.crm_mb3m_pieces
  drop constraint if exists crm_mb3m_pieces_kind_check;

alter table public.crm_mb3m_pieces
  add constraint crm_mb3m_pieces_kind_check check (kind in ('invoice', 'credit_note'));

alter table public.crm_mb3m_pieces
  add column if not exists credited_at timestamptz;

alter table public.crm_mb3m_pieces
  add column if not exists replaces_piece_id uuid references public.crm_mb3m_pieces (id) on delete set null;

-- Historique Pliant : les « Dépense Pliant » déjà au grand livre deviennent des coûts du dossier
-- quand il est connu. Sinon la sortie revient dans la file à rattacher. Le client ne les voit plus.
insert into public.crm_trip_costs (
  booking_id, booking_item_id, source, source_id, amount_eur, original_amount, original_currency, supplier, occurred_on
)
select
  coalesce(t.booking_id, c.booking_id),
  null,
  'pliant',
  p.id::text,
  case when t.direction = 'credit' then -t.amount else t.amount end,
  case when p.transaction_cents is null then null else p.transaction_cents / 100.0 end,
  p.transaction_currency,
  p.merchant,
  t.occurred_on
from public.crm_transactions t
join public.crm_pliant_transactions p on p.pliant_transaction_id = t.external_id
left join public.crm_pliant_cards c on c.pliant_card_id = p.card_id
where t.source = 'pliant'
  and t.status = 'posted'
  and coalesce(t.booking_id, c.booking_id) is not null
on conflict (source, source_id) do nothing;

update public.crm_pliant_transactions p
set match_status = 'unmatched',
    matched_transaction_id = null
where p.match_status = 'matched'
  and not exists (
    select 1 from public.crm_trip_costs tc
    where tc.source = 'pliant' and tc.source_id = p.id::text
  );

update public.crm_transactions
set status = 'void'
where source = 'pliant' and status = 'posted';
