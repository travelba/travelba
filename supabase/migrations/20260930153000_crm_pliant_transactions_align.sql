-- La table existe déjà (dépenses de dossier). La synchro du compte écrit
-- card_id / billing_cents / raw. On aligne les deux formes, sans PAN.

alter table public.crm_pliant_transactions
  add column if not exists card_id text,
  add column if not exists billing_cents bigint,
  add column if not exists billing_currency text,
  add column if not exists transaction_cents bigint,
  add column if not exists transaction_currency text,
  add column if not exists raw jsonb default '{}'::jsonb,
  add column if not exists pliant_card_id text,
  add column if not exists booking_id uuid,
  add column if not exists customer_id uuid,
  add column if not exists amount_cents bigint,
  add column if not exists currency text;

alter table public.crm_pliant_transactions
  alter column billing_cents type bigint using billing_cents::bigint,
  alter column transaction_cents type bigint using transaction_cents::bigint,
  alter column amount_cents type bigint using amount_cents::bigint;

alter table public.crm_pliant_transactions alter column pliant_card_id drop not null;
alter table public.crm_pliant_transactions alter column amount_cents drop not null;
alter table public.crm_pliant_transactions alter column merchant drop not null;
alter table public.crm_pliant_transactions alter column type drop not null;
alter table public.crm_pliant_transactions alter column status drop not null;
alter table public.crm_pliant_transactions alter column currency drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid and a.attnum = any (c.conkey)
    where n.nspname = 'public'
      and t.relname = 'crm_pliant_transactions'
      and c.contype = 'f'
      and a.attname = 'booking_id'
  ) then
    alter table public.crm_pliant_transactions
      add constraint crm_pliant_transactions_booking_id_fkey
      foreign key (booking_id) references public.crm_bookings (id) on delete set null;
  end if;
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid and a.attnum = any (c.conkey)
    where n.nspname = 'public'
      and t.relname = 'crm_pliant_transactions'
      and c.contype = 'f'
      and a.attname = 'customer_id'
  ) then
    alter table public.crm_pliant_transactions
      add constraint crm_pliant_transactions_customer_id_fkey
      foreign key (customer_id) references public.crm_customers (id) on delete set null;
  end if;
end $$;

create index if not exists crm_pliant_transactions_card_id_idx
  on public.crm_pliant_transactions (card_id);

create or replace function public.crm_pliant_tx_align()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.pliant_card_id := coalesce(new.pliant_card_id, new.card_id);
  new.card_id := coalesce(new.card_id, new.pliant_card_id);
  new.amount_cents := coalesce(new.amount_cents, new.billing_cents, new.transaction_cents);
  new.billing_cents := coalesce(new.billing_cents, new.amount_cents);
  new.currency := coalesce(new.currency, new.billing_currency, new.transaction_currency);
  new.billing_currency := coalesce(new.billing_currency, new.currency);
  if new.raw is null then
    new.raw := '{}'::jsonb;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_pliant_tx_align on public.crm_pliant_transactions;
create trigger crm_pliant_tx_align
  before insert or update on public.crm_pliant_transactions
  for each row execute function public.crm_pliant_tx_align();

notify pgrst, 'reload schema';
