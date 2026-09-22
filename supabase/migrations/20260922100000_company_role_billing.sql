-- Rôle société : admin (voit le grand livre / revenus) vs member (voit seulement
-- les frais de ses voyages). Payeur du dossier = billing_customer_id.

alter table public.crm_customers
  add column if not exists company_role text
    check (company_role is null or company_role in ('admin', 'member'));

alter table public.crm_customers
  add column if not exists billing_parent_id uuid
    references public.crm_customers (id) on delete set null;

create index if not exists crm_customers_billing_parent_idx
  on public.crm_customers (billing_parent_id)
  where billing_parent_id is not null;

comment on column public.crm_customers.company_role is
  'null=particulier ; admin=admin société (ledger complet) ; member=rattaché (frais voyage seulement)';
comment on column public.crm_customers.billing_parent_id is
  'Pour company_role=member : fiche admin / wallet société qui paie.';

alter table public.crm_bookings
  add column if not exists billing_customer_id uuid
    references public.crm_customers (id) on delete restrict;

-- Backfill : dossier facturé au titulaire voyageur (comportement historique).
update public.crm_bookings
set billing_customer_id = customer_id
where billing_customer_id is null;

alter table public.crm_bookings
  alter column billing_customer_id set not null;

create index if not exists crm_bookings_billing_customer_idx
  on public.crm_bookings (billing_customer_id);

comment on column public.crm_bookings.billing_customer_id is
  'Client wallet facturé (souvent admin société). customer_id reste le voyageur titulaire.';

-- RLS : client voit son wallet ; member voit aussi les débits posted de ses dossiers
-- (même si customer_id du ledger = société payeuse).
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
          join public.crm_customers me on me.id = crm_private.customer_id()
          where b.id = crm_transactions.booking_id
            and b.customer_id = me.id
            and me.company_role = 'member'
        )
      )
    )
  );
