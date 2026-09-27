-- Lien public /v/CODE : page du voyage publié, sans compte.
-- Téléphone d’accompagnateur pour l’envoi WhatsApp Business, au clic seulement.

alter table public.crm_bookings
  add column if not exists share_code text;

create unique index if not exists crm_bookings_share_code_idx
  on public.crm_bookings (share_code)
  where share_code is not null;

comment on column public.crm_bookings.share_code is
  'Code court du lien public /v/CODE. La page ne s’ouvre que si le séjour est publié.';

alter table public.crm_travel_companions
  add column if not exists phone text;

comment on column public.crm_travel_companions.phone is
  'Téléphone E.164, pour un envoi WhatsApp décidé par le voyageur principal.';
