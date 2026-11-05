-- Cartes Pliant émises par « l’agence paie » : elles vivaient sur le séjour
-- et manquaient au dossier (valid_from / valid_to absents à l’insert).
-- Idempotent : une carte déjà liée n’est pas recréée.

insert into public.crm_booking_cards (
  booking_id,
  pliant_card_id,
  label,
  first_name,
  last_name,
  limit_cents,
  currency,
  valid_from,
  valid_to,
  status,
  transaction_limit_cents
)
select
  s.booking_id,
  btrim(s.state->>'pliantCardId'),
  left(coalesce(nullif(btrim(s.state->>'hotelName'), ''), 'Hôtel'), 40),
  '',
  '',
  case
    when coalesce(s.state->>'sellCents', '') ~ '^[0-9]+$' then greatest((s.state->>'sellCents')::integer, 1)
    else 1
  end,
  'EUR',
  coalesce(bk.start_date, (s.created_at at time zone 'Europe/Paris')::date),
  coalesce(bk.end_date, bk.start_date, (s.created_at at time zone 'Europe/Paris')::date),
  case
    when s.phase = 'cancelled' or s.state->>'pliant' = 'locked' then 'locked'
    else 'active'
  end,
  case
    when coalesce(s.state->>'sellCents', '') ~ '^[0-9]+$' then greatest((s.state->>'sellCents')::integer, 1)
    else 1
  end
from public.crm_hotel_direct_stays s
join public.crm_bookings bk on bk.id = s.booking_id
where coalesce(btrim(s.state->>'pliantCardId'), '') <> ''
  and not exists (
    select 1
    from public.crm_booking_cards c
    where c.pliant_card_id = btrim(s.state->>'pliantCardId')
  );

update public.crm_pliant_cards p
set booking_id = s.booking_id,
    updated_at = now()
from public.crm_hotel_direct_stays s
where p.pliant_card_id = btrim(s.state->>'pliantCardId')
  and s.booking_id is not null
  and p.booking_id is null;
