-- Droit de dépense personnel sur le wallet société. Null = pas de plafond.
-- Le virement reste un seul crédit (crm_customer_balances). Pas un second wallet.
-- Hors des grants authenticated : seule l’agence l’écrit (service role).

alter table public.crm_customers
  add column if not exists spending_allowance numeric(12, 2);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'crm_customers_spending_allowance_check'
  ) then
    alter table public.crm_customers
      add constraint crm_customers_spending_allowance_check
      check (spending_allowance is null or spending_allowance >= 0);
  end if;
end $$;

comment on column public.crm_customers.spending_allowance is
  'Droit de dépense en euros sur le wallet société. Null = pas de plafond personnel. Le solde reste celui du payeur.';

-- Le titulaire ne s’accorde pas un plafond. Même garde que on_hold / is_vip.
create or replace function crm_private.protect_customer_agency_flags()
returns trigger
language plpgsql
security definer
set search_path = public, crm_private
as $$
begin
  if auth.role() = 'service_role' or crm_private.is_staff() then
    return new;
  end if;
  new.on_hold := old.on_hold;
  new.is_vip := old.is_vip;
  new.spending_allowance := old.spending_allowance;
  return new;
end;
$$;
