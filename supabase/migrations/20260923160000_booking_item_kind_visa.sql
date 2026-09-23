-- Kinds déjà utilisés par les services à la demande, plus la demande de visa.

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
      'visa'
    )
  );
