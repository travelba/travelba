-- Reprise des mails en file : horodatage et compteur de la dernière tentative.
-- Le cron ne relit plus toujours les 8 plus récents. À jouer à la main :
-- tant que ces colonnes manquent, le code avance quand même via updated_at.
-- Aucune réécriture des dossiers, des extraits ou des statuts.

alter table public.crm_email_ingest
  add column if not exists rematch_attempted_at timestamptz;

alter table public.crm_email_ingest
  add column if not exists rematch_attempts integer not null default 0;

comment on column public.crm_email_ingest.rematch_attempted_at is
  'Dernière tentative de reprise automatique. Null : jamais tenté.';

comment on column public.crm_email_ingest.rematch_attempts is
  'Nombre de reprises automatiques. N’envoie aucun message.';

create index if not exists crm_email_ingest_rematch_queue_idx
  on public.crm_email_ingest (rematch_attempted_at asc nulls first, received_at asc)
  where status in ('parsed', 'matched')
    and created_booking_id is null
    and extract is not null;
