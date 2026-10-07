-- Deux comptes société : crédit d’avance (virement) et Pro (carte / Apple Pay).
-- null conserve l’encours unique. Les deux soldes ne se compensent pas.

alter table public.crm_billing_companies
  add column if not exists funding text;

alter table public.crm_billing_companies
  drop constraint if exists crm_billing_companies_funding_check;

alter table public.crm_billing_companies
  add constraint crm_billing_companies_funding_check
  check (funding is null or funding in ('advance', 'pro'));

comment on column public.crm_billing_companies.funding is
  'advance = crédit alimenté par virement. pro = réglé par carte ou Apple Pay. null = encours unique.';

-- RB&A (Benillouche) : la société déjà au livre est le crédit. Pro part à zéro.
update public.crm_billing_companies b
set funding = 'advance'
from public.crm_customers c
where b.customer_id = c.id
  and c.last_name = 'Benillouche'
  and c.company_role = 'admin'
  and b.company_name = 'RB&A'
  and b.funding is null;

insert into public.crm_billing_companies (customer_id, company_name, sort_order, funding)
select c.id, 'Pro', 1, 'pro'
from public.crm_customers c
where c.last_name = 'Benillouche'
  and c.company_role = 'admin'
  and exists (
    select 1
    from public.crm_billing_companies b
    where b.customer_id = c.id
      and b.company_name = 'RB&A'
  )
  and not exists (
    select 1
    from public.crm_billing_companies b
    where b.customer_id = c.id
      and b.funding = 'pro'
  );
