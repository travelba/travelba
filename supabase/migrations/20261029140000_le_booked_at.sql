-- Date de réservation Little Emperors (création chez LE, sinon e-mail de confirmation, sinon created_at).
-- Additive : une colonne nullable, un index, la vue partenaire recopiée avec cette colonne.
-- Rien n’est supprimé. À appliquer à la main (SQL Editor ou `apply_migration`).
-- L’écran et les outils lisent la date sans cette colonne : charge utile, e-mail, puis created_at.

alter table public.crm_le_bookings
  add column if not exists booked_at timestamptz;

comment on column public.crm_le_bookings.booked_at is
  'Date à laquelle la réservation Little Emperors a été faite. Pas la date d’arrivée.';

create index if not exists crm_le_bookings_booked_at_idx
  on public.crm_le_bookings (booked_at desc nulls last);

update public.crm_le_bookings
set booked_at = coalesce(
  nullif(raw->>'created_at', ''),
  nullif(raw->>'createdAt', ''),
  nullif(raw->>'booked_at', ''),
  nullif(raw->>'booking_date', '')
)::timestamptz
where booked_at is null
  and coalesce(raw->>'created_at', raw->>'createdAt', raw->>'booked_at', raw->>'booking_date', '')
    ~ '^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$';

update public.crm_le_bookings as booking
set booked_at = mail.received_at
from (
  select stay.id, min(email.received_at) as received_at
  from public.crm_le_bookings as stay
  join public.crm_email_ingest as email
    on email.label ilike '%emperor%'
   and email.received_at is not null
   and stay.confirmation_number is not null
   and length(stay.confirmation_number) >= 5
   and (
     strpos(lower(coalesce(email.subject, '')), lower(stay.confirmation_number)) > 0
     or strpos(lower(coalesce(email.extract::text, '')), lower(stay.confirmation_number)) > 0
   )
  where stay.booked_at is null
  group by stay.id
) as mail
where booking.id = mail.id
  and booking.booked_at is null;

update public.crm_le_bookings
set booked_at = created_at
where booked_at is null;

create or replace view public.crm_le_bookings_partner
with (security_invoker = false) as
select
  id,
  le_booking_id,
  confirmation_number,
  state,
  hotel_id,
  hotel_name,
  address,
  city,
  country,
  website,
  check_in,
  check_out,
  currency,
  total_cost,
  is_cancellable,
  cancellation_deadline,
  guest_names,
  cancellation_policies,
  room_types,
  status,
  last_event,
  last_error,
  created_at,
  updated_at,
  booked_at
from public.crm_le_bookings
where crm_private.is_partner();

comment on view public.crm_le_bookings_partner is
  'Réservations Little Emperors pour le partenaire : pas de candidat client, pas de pièce brute.';
