alter table public.crm_visa_requests
  add column if not exists accepted_at timestamptz;

alter table public.crm_visa_requests
  add column if not exists traveler_ids uuid[] not null default '{}';
