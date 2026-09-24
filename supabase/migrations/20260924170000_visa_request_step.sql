alter table public.crm_visa_requests
  add column if not exists step text not null default 'preparation';

alter table public.crm_visa_requests
  drop constraint if exists crm_visa_requests_step_check;

alter table public.crm_visa_requests
  add constraint crm_visa_requests_step_check
  check (step in ('preparation', 'remplissage', 'validation', 'paiement', 'piece'));
