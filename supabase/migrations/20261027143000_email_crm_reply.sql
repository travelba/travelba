-- La file garde tous les mails. Cette colonne ne sert qu’à la notification.
-- Faux par défaut : un mail déjà en file ne déclenche pas une alerte nouvelle.

alter table public.crm_email_ingest
  add column if not exists crm_reply boolean not null default false;

comment on column public.crm_email_ingest.crm_reply is
  'Vrai si le mail répond à un envoi du CRM. La file ne s’en sert pas.';
