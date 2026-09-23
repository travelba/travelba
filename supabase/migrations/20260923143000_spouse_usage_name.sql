alter table public.crm_customers
  add column if not exists usage_name text;

alter table public.crm_travel_companions
  add column if not exists usage_name text;

alter table public.crm_travel_documents
  add column if not exists usage_name text;
