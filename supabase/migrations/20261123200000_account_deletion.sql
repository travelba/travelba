-- Suppression de compte client (Apple 5.1.1(v)).
-- Marque la fiche anonymisée. Les dossiers, factures et règlements restent.
-- Pas de grant authenticated : le service role seul écrit cette date.
-- À jouer à la main sur fsmfozxgujskluxakeoq. Rien n’est détruit.

alter table public.crm_customers
  add column if not exists account_deleted_at timestamptz;

comment on column public.crm_customers.account_deleted_at is
  'Compte effacé par le titulaire. La fiche reste pour les dossiers et la comptabilité, sans données personnelles.';

create index if not exists crm_customers_account_deleted_idx
  on public.crm_customers (account_deleted_at)
  where account_deleted_at is not null;
