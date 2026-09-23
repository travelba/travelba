-- Dossiers à 0 € alors que des cartes ont un prix vendu :
-- recopier la somme des item.amount > 0 sur booking.total_amount.
-- Pas d’écriture ledger ici : syncBookingLedger au prochain refresh.

update public.crm_bookings b
set total_amount = s.total
from (
  select
    booking_id,
    round(sum(amount)::numeric, 2) as total
  from public.crm_booking_items
  where amount is not null
    and amount > 0
  group by booking_id
) s
where b.id = s.booking_id
  and coalesce(b.total_amount, 0) = 0;
