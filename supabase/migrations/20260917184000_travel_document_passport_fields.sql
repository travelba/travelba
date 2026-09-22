alter table public.crm_travel_documents
  add column if not exists place_of_birth text,
  add column if not exists authority text,
  add column if not exists personal_number text;
