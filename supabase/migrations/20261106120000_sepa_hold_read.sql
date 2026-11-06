-- Le client lit sa réservation de prélèvement (crédit pending) et un refus (void).
-- Le solde comptable reste les lignes posted. Pas un second livre.
-- Le service role écrit. Cette policy ne fait que laisser lire.

drop policy if exists crm_tx_self_sepa_hold on public.crm_transactions;
create policy crm_tx_self_sepa_hold on public.crm_transactions
  for select to authenticated
  using (
    customer_id = crm_private.customer_id()
    and source = 'stripe'
    and direction = 'credit'
    and (
      status = 'pending'
      or (status = 'void' and label like '[sepa:%')
    )
  );
