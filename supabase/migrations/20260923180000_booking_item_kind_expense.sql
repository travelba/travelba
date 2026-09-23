-- Dépense libre : au grand livre, hors itinéraire.

alter table public.crm_booking_items
  drop constraint if exists crm_booking_items_kind_check;

alter table public.crm_booking_items
  add constraint crm_booking_items_kind_check
  check (
    kind in (
      'flight',
      'hotel',
      'transfer',
      'activity',
      'rail',
      'car',
      'cruise',
      'insurance',
      'fee',
      'chauffeur',
      'greeter',
      'visa',
      'expense'
    )
  );
