-- Compte client imputé par le rapprochement Pliant (`applyPliantToCustomer`), remis à null à la suppression du client.
-- Colonne écrite par le code mais absente du dépôt jusqu'ici : idempotent, sans effet si la prod l'a déjà.

alter table public.crm_pliant_transactions
  add column if not exists customer_id uuid references public.crm_customers (id) on delete set null;

create index if not exists crm_pliant_transactions_customer_id_idx
  on public.crm_pliant_transactions (customer_id);
