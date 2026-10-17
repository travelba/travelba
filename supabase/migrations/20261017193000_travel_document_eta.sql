-- Autorisation de voyage (ETA) distincte du visa.

alter table public.crm_travel_documents
  drop constraint if exists crm_travel_documents_doc_type_check;

alter table public.crm_travel_documents
  add constraint crm_travel_documents_doc_type_check
  check (doc_type in ('passport', 'id_card', 'visa', 'eta', 'insurance', 'other'));
