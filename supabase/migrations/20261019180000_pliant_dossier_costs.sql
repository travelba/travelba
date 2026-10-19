-- Carte Pliant créée depuis un dossier : la dépense s’y rattache dès l’autorisation.
-- Au règlement, le montant en euros peut changer (state pending → posted).
-- Un retrait agent pose link_released : la synchro ne recolle pas la dépense.
-- Le pipeline de déploiement n’applique pas cette migration : à jouer à la main sur Supabase.
-- Ne débite pas le client. N’envoie rien.

alter table public.crm_trip_costs
  add column if not exists state text not null default 'posted';

alter table public.crm_trip_costs
  drop constraint if exists crm_trip_costs_state_check;

alter table public.crm_trip_costs
  add constraint crm_trip_costs_state_check check (state in ('pending', 'posted'));

alter table public.crm_pliant_transactions
  add column if not exists link_released boolean not null default false;

-- Registre : une carte émise depuis un seul dossier retrouve ce dossier.
update public.crm_pliant_cards as card
set
  booking_id = link.booking_id,
  customer_id = coalesce(card.customer_id, booking.customer_id),
  updated_at = now()
from (
  select pliant_card_id, min(booking_id::text)::uuid as booking_id
  from public.crm_booking_cards
  where pliant_card_id is not null
    and booking_id is not null
    and status is distinct from 'terminated'
  group by pliant_card_id
  having count(distinct booking_id) = 1
) as link
join public.crm_bookings as booking on booking.id = link.booking_id
where card.pliant_card_id = link.pliant_card_id
  and card.booking_id is null;

-- Dépenses EUR déjà autorisées sur une carte qui ne pointe qu’un dossier.
insert into public.crm_trip_costs (
  booking_id,
  booking_item_id,
  source,
  source_id,
  amount_eur,
  original_amount,
  original_currency,
  supplier,
  occurred_on,
  instrument,
  instrument_detail,
  state
)
select
  link.booking_id,
  null,
  'pliant',
  spend.id::text,
  round(
    (
      case
        when upper(spend.type) in ('REFUND', 'CHARGEBACK') then -1
        else 1
      end
    ) * abs(spend.billing_cents) / 100.0,
    2
  ),
  case
    when spend.transaction_cents is null then null
    else round(abs(spend.transaction_cents) / 100.0, 2)
  end,
  spend.transaction_currency,
  nullif(trim(spend.merchant), ''),
  (spend.booked_at at time zone 'Europe/Paris')::date,
  'pliant_card',
  nullif(trim(spend.card_last4), ''),
  case when upper(spend.status) = 'PENDING' then 'pending' else 'posted' end
from public.crm_pliant_transactions as spend
join (
  select pliant_card_id, min(booking_id::text)::uuid as booking_id
  from (
    select pliant_card_id, booking_id
    from public.crm_booking_cards
    where pliant_card_id is not null
      and booking_id is not null
      and status is distinct from 'terminated'
    union
    select pliant_card_id, booking_id
    from public.crm_pliant_cards
    where pliant_card_id is not null
      and booking_id is not null
    union
    select pliant_card_id, booking_id
    from public.crm_hotel_arrivals
    where pliant_card_id is not null
      and booking_id is not null
  ) as faces
  group by pliant_card_id
  having count(distinct booking_id) = 1
) as link on link.pliant_card_id = spend.card_id
where upper(spend.status) in ('PENDING', 'BOOKED', 'CONFIRMED')
  and upper(spend.type) in ('PURCHASE', 'CASH_WITHDRAWAL', 'REFUND', 'CHARGEBACK')
  and upper(coalesce(spend.billing_currency, 'EUR')) = 'EUR'
  and spend.billing_cents is not null
  and abs(spend.billing_cents) > 0
  and coalesce(spend.match_status, 'unmatched') = 'unmatched'
  and coalesce(spend.link_released, false) = false
on conflict (source, source_id) do nothing;

update public.crm_pliant_transactions as spend
set match_status = 'matched'
where coalesce(spend.match_status, 'unmatched') = 'unmatched'
  and exists (
    select 1
    from public.crm_trip_costs as cost
    where cost.source = 'pliant'
      and cost.source_id = spend.id::text
  );
