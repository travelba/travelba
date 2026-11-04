-- Catégorie des crédits Revolut et lignes d’un versement Stripe.
-- Statut et catégorie seulement. Aucun client, dossier, facture ou paiement.

alter table public.crm_revolut_transactions
  add column if not exists category text,
  add column if not exists parent_id uuid references public.crm_revolut_transactions (id) on delete cascade,
  add column if not exists stripe_line jsonb;

comment on column public.crm_revolut_transactions.category is
  'client, interet, interne, remboursement, frais, stripe (versement entier), stripe_paiement (une ligne du versement).';

comment on column public.crm_revolut_transactions.stripe_line is
  'Détail Stripe mis en cache : paiement (brut, frais, net, client) ou cache du versement. Pas de PAN.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'crm_revolut_transactions_category_check'
  ) then
    alter table public.crm_revolut_transactions
      add constraint crm_revolut_transactions_category_check
      check (
        category is null
        or category in ('client', 'interet', 'interne', 'remboursement', 'frais', 'stripe', 'stripe_paiement')
      );
  end if;
end $$;

create index if not exists crm_revolut_transactions_parent_idx
  on public.crm_revolut_transactions (parent_id)
  where parent_id is not null;

-- Intérêts encore à encaisser : hors file. Le crédit déjà posé reste.
update public.crm_revolut_transactions
set category = 'interet',
    status = 'ignored'
where direction = 'credit'
  and status = 'unmatched'
  and matched_transaction_id is null
  and parent_id is null
  and (
    lower(coalesce(raw->>'type', '')) = 'interest'
    or coalesce(raw->'legs'->0->>'description', '') ~* '^interest earned'
  );

-- Remboursements de carte ou de plan, pas un virement client.
update public.crm_revolut_transactions
set category = 'remboursement',
    status = 'ignored'
where direction = 'credit'
  and status = 'unmatched'
  and matched_transaction_id is null
  and parent_id is null
  and lower(coalesce(raw->>'type', '')) in ('refund', 'card_refund', 'card_credit', 'card_chargeback', 'topup_return');

-- Virement entre comptes de l’agence. Les intérêts sont déjà classés.
update public.crm_revolut_transactions
set category = 'interne',
    status = 'ignored'
where direction = 'credit'
  and status = 'unmatched'
  and matched_transaction_id is null
  and parent_id is null
  and category is null
  and (
    coalesce(raw->'legs'->0->>'description', '') ~* '(^|[[:space:]])(from|to)[[:space:]]+(treso|trésorerie|eur)'
    or coalesce(counterparty_name, '') ~* '^(from|to)[[:space:]]+(treso|trésorerie|eur)'
    or coalesce(reference, '') ~* 'virement interne'
  );

-- Le versement Stripe reste ouvert : le découpage crée les lignes. On ne le crédite pas ici.
update public.crm_revolut_transactions
set category = 'stripe'
where direction = 'credit'
  and status = 'unmatched'
  and matched_transaction_id is null
  and parent_id is null
  and category is null
  and (
    counterparty_name ~* '^stripe$'
    or coalesce(raw->'legs'->0->>'description', '') ~* 'payment from stripe'
    or coalesce(reference, '') ~* '^stripe$'
  );
