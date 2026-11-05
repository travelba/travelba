-- Alerte interne quand Pliant refuse la lecture du porteur ou de l’organisation.
-- Le client n’est pas prévenu. La contrainte reprend les kinds déjà en place.

alter table public.crm_agency_alerts drop constraint if exists crm_agency_alerts_kind_check;
alter table public.crm_agency_alerts
  add constraint crm_agency_alerts_kind_check
  check (kind in (
    'passport_reveal',
    'card_reveal',
    'export',
    'payment',
    'refund',
    'failed_login',
    'role_change',
    'pliant'
  ));
