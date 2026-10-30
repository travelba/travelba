-- Destinataires et copies d’un tour du fil hôtel.
-- La réponse et la relance les reprennent. Pas de numéro de carte.

alter table public.crm_hotel_thread_messages
  add column if not exists to_emails text[] not null default '{}',
  add column if not exists cc_emails text[] not null default '{}';

comment on column public.crm_hotel_thread_messages.to_emails is
  'Destinataires du message. La relance et la réponse gardent les adresses d’hôtel.';

comment on column public.crm_hotel_thread_messages.cc_emails is
  'Copies du message. Une adresse d’hôtel nouvelle rejoint la fiche hôtel.';
