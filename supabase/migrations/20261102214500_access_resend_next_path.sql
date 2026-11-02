-- Le même jeton d’accès peut ouvrir l’accueil ou la rubrique Hôtels.
-- Les jetons déjà créés ouvrent l’accueil. Additive.

alter table public.crm_access_resend_tokens
  add column if not exists next_path text not null default '/mon-compte';

comment on column public.crm_access_resend_tokens.next_path is
  'Page ouverte après la session. /mon-compte ou /mon-compte/hotels.';
