-- Pièces déposées depuis un mail : empreinte pour ne pas les copier deux fois,
-- et lien vers le mail pour l’historique et l’annulation du dépôt.
-- N’ajoute aucune carte.

alter table public.crm_booking_documents
  add column if not exists content_sha256 text,
  add column if not exists email_ingest_id uuid references public.crm_email_ingest (id) on delete set null;

create unique index if not exists crm_booking_documents_booking_sha_uidx
  on public.crm_booking_documents (booking_id, content_sha256)
  where content_sha256 is not null;

create index if not exists crm_booking_documents_email_idx
  on public.crm_booking_documents (email_ingest_id)
  where email_ingest_id is not null;
