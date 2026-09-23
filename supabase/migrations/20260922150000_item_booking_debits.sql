-- Les cartes (hôtel, vol…) ont chacune un débit kind=booking.
-- L’ancien unique(booking_id) n’autorisait qu’une ligne active par dossier :
-- le vol évinçait l’hôtel (void), recocher n’y changeait rien.
drop index if exists public.crm_transactions_one_active_booking_debit;

create unique index if not exists crm_transactions_one_active_stay_debit
  on public.crm_transactions (booking_id)
  where booking_id is not null
    and kind = 'booking'
    and direction = 'debit'
    and status <> 'void'
    and external_id is null;
