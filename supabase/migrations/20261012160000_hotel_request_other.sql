-- Courrier « Autre demande », après Concierge. Le message libre du bureau.

alter table public.crm_hotel_requests drop constraint if exists crm_hotel_requests_kind_check;

alter table public.crm_hotel_requests
  add constraint crm_hotel_requests_kind_check
  check (kind in (
    'payment_link',
    'upgrade',
    'precheckin',
    'full_credit',
    'transfer',
    'concierge',
    'other'
  ));
