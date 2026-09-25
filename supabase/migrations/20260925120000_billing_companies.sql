-- Plusieurs sociétés de facturation par client.
-- L’encours (vue crm_customer_balances) n’est pas modifié : crédits − débits posted,
-- sans regroupement par société. billing_company_id est une attribution, pas un wallet.

create table if not exists public.crm_billing_companies (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers (id) on delete cascade,
  company_name text,
  siret text,
  vat_number text,
  billing_email text,
  billing_address_line text,
  billing_postal_code text,
  billing_city text,
  billing_country text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.crm_billing_companies is
  'Sociétés de facturation d’un client. L’encours reste global sur crm_customer_balances.';

create index if not exists crm_billing_companies_customer_idx
  on public.crm_billing_companies (customer_id, sort_order);

create unique index if not exists crm_billing_companies_siret_uidx
  on public.crm_billing_companies (customer_id, siret)
  where siret is not null;

-- Reprend la société déjà saisie sur la fiche. N’invente aucun champ.
insert into public.crm_billing_companies (
  customer_id,
  company_name,
  siret,
  vat_number,
  billing_email,
  billing_address_line,
  billing_postal_code,
  billing_city,
  billing_country,
  sort_order
)
select
  c.id,
  c.company_name,
  c.siret,
  c.vat_number,
  c.billing_email,
  c.billing_address_line,
  c.billing_postal_code,
  c.billing_city,
  c.billing_country,
  0
from public.crm_customers c
where coalesce(
  nullif(btrim(c.company_name), ''),
  nullif(btrim(c.siret), ''),
  nullif(btrim(c.vat_number), ''),
  nullif(btrim(c.billing_email), ''),
  nullif(btrim(c.billing_address_line), '')
) is not null
and not exists (
  select 1 from public.crm_billing_companies b where b.customer_id = c.id
);

alter table public.crm_bookings
  add column if not exists billing_company_id uuid
    references public.crm_billing_companies (id) on delete set null;

alter table public.crm_booking_items
  add column if not exists billing_company_id uuid
    references public.crm_billing_companies (id) on delete set null;

alter table public.crm_transactions
  add column if not exists billing_company_id uuid
    references public.crm_billing_companies (id) on delete set null;

comment on column public.crm_bookings.billing_company_id is
  'Société de facturation du séjour. N’entre pas dans le calcul de l’encours.';
comment on column public.crm_booking_items.billing_company_id is
  'Société de facturation d’une dépense. À défaut, celle du séjour.';
comment on column public.crm_transactions.billing_company_id is
  'Société affichée sur la ligne. Ignorée par crm_customer_balances.';

create index if not exists crm_bookings_billing_company_idx
  on public.crm_bookings (billing_company_id)
  where billing_company_id is not null;

create index if not exists crm_booking_items_billing_company_idx
  on public.crm_booking_items (billing_company_id)
  where billing_company_id is not null;

create index if not exists crm_transactions_billing_company_idx
  on public.crm_transactions (billing_company_id)
  where billing_company_id is not null;

drop trigger if exists trg_crm_billing_companies_updated on public.crm_billing_companies;
create trigger trg_crm_billing_companies_updated
  before update on public.crm_billing_companies
  for each row execute function public.crm_set_updated_at();

revoke all on public.crm_billing_companies from anon, authenticated;
grant select, insert, update, delete on public.crm_billing_companies to authenticated;
grant all on public.crm_billing_companies to service_role;

alter table public.crm_billing_companies enable row level security;

drop policy if exists crm_billing_companies_staff on public.crm_billing_companies;
create policy crm_billing_companies_staff on public.crm_billing_companies
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_billing_companies_self on public.crm_billing_companies;
create policy crm_billing_companies_self on public.crm_billing_companies
  for all to authenticated
  using (customer_id = crm_private.customer_id())
  with check (customer_id = crm_private.customer_id());
