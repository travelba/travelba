-- Un même wallet (ex. OZB) peut payer les voyages de plusieurs titulaires,
-- quel que soit leur rôle (collaborateur, admin d’une autre société, particulier).
-- Chaque voyageur voit les débits de SES dossiers, jamais le solde du payeur.

drop policy if exists crm_tx_self on public.crm_transactions;
create policy crm_tx_self on public.crm_transactions
  for select to authenticated
  using (
    status = 'posted'
    and (
      customer_id = crm_private.customer_id()
      or (
        direction = 'debit'
        and booking_id is not null
        and exists (
          select 1
          from public.crm_bookings b
          where b.id = crm_transactions.booking_id
            and b.customer_id = crm_private.customer_id()
        )
      )
    )
  );

comment on column public.crm_customers.billing_parent_id is
  'Wallet société par défaut des voyages pro. Indépendant du rôle : un gérant (admin) peut être facturé par un autre compte.';
comment on column public.crm_customers.company_role is
  'null=particulier ; admin=wallet société propre ; member=collaborateur (parent requis).';
