-- Journal d’un téléchargement : quelle pièce, dans quelle table.
-- Le nom stocké est le libellé sûr (un passeport : « Passeport de <prénom> »).
-- Pas de numéro, pas de MRZ. Les anciennes lignes ne sont pas réécrites ici :
-- le hash du chemin se recalcule dans l’application, et seulement s’il est unique.

alter table public.crm_customer_activity
  add column if not exists document_id uuid,
  add column if not exists document_table text,
  add column if not exists document_kind text,
  add column if not exists document_name text;

alter table public.crm_customer_activity
  drop constraint if exists crm_customer_activity_document_table_check;

alter table public.crm_customer_activity
  add constraint crm_customer_activity_document_table_check
  check (
    document_table is null
    or document_table in ('crm_booking_documents', 'crm_travel_documents')
  );

comment on column public.crm_customer_activity.document_id is
  'Identifiant complet de la pièce téléchargée.';

comment on column public.crm_customer_activity.document_table is
  'crm_booking_documents ou crm_travel_documents.';

comment on column public.crm_customer_activity.document_kind is
  'Type : passport, visa, invoice, flight, …';

comment on column public.crm_customer_activity.document_name is
  'Libellé sûr. Jamais un numéro de pièce ni une MRZ.';
