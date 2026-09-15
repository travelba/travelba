-- Allocate each Stripe payment under the schedule lock and protect its ledger.

alter table public.crm_transactions
  add column if not exists schedule_applied_amount numeric(12,2)
    not null default 0
    check (schedule_applied_amount >= 0 and schedule_applied_amount <= amount);

create or replace function crm_private.validate_invoice_transaction()
returns trigger
language plpgsql
security definer
set search_path = public, crm_private
as $$
declare
  tx public.crm_transactions;
begin
  if new.kind in ('receipt', 'credit_note') and new.transaction_id is null then
    raise exception 'Un reçu ou avoir doit être lié à une transaction'
      using errcode = '23514';
  end if;
  if new.transaction_id is null then
    return new;
  end if;
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Seul le service financier peut lier une transaction'
      using errcode = '42501';
  end if;
  select * into tx
  from public.crm_transactions
  where id = new.transaction_id and status = 'posted';
  if not found
     or tx.customer_id is distinct from new.customer_id
     or tx.booking_id is distinct from new.booking_id
     or tx.currency is distinct from new.currency
     or (
       new.kind = 'receipt'
       and (
         tx.direction <> 'credit'
         or tx.kind <> 'card_payment'
         or new.amount <> tx.amount
       )
     )
     or (
       new.kind = 'credit_note'
       and (
         tx.direction <> 'debit'
         or tx.kind <> 'refund'
         or new.amount <> -tx.amount
       )
     )
     or new.kind not in ('receipt', 'credit_note') then
    raise exception 'La pièce comptable ne correspond pas à la transaction'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function crm_private.protect_documented_transaction()
returns trigger
language plpgsql
security definer
set search_path = public, crm_private
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and exists (
       select 1 from public.crm_invoices invoice
       where invoice.transaction_id = old.id
     ) then
    raise exception 'Une transaction portant une pièce comptable est immuable'
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_crm_documented_transaction_immutable
  on public.crm_transactions;
create trigger trg_crm_documented_transaction_immutable
before update or delete on public.crm_transactions
for each row execute function crm_private.protect_documented_transaction();

create or replace function crm_private.record_schedule_payment(
  p_schedule_id uuid,
  p_external_id text,
  p_amount numeric,
  p_occurred_on date default current_date
)
returns public.crm_payment_schedules
language plpgsql
security definer
set search_path = public, crm_private
as $$
declare
  schedule public.crm_payment_schedules;
  tx_id uuid;
  existing_tx_id uuid;
  remaining numeric;
  applied_amount numeric;
  new_paid numeric;
  receipt_number text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service réservé' using errcode = '42501';
  end if;
  if nullif(trim(p_external_id), '') is null or p_amount <= 0 then
    raise exception 'Paiement invalide' using errcode = '22023';
  end if;

  select * into schedule
  from public.crm_payment_schedules
  where id = p_schedule_id
  for update;
  if not found then
    raise exception 'Échéance introuvable' using errcode = 'P0002';
  end if;

  select id into existing_tx_id
  from public.crm_transactions
  where source = 'stripe' and external_id = p_external_id
  limit 1;
  if existing_tx_id is not null then
    return schedule;
  end if;

  remaining := greatest(schedule.amount - schedule.paid_amount, 0);
  applied_amount := least(p_amount, remaining);

  insert into public.crm_transactions
    (customer_id, booking_id, direction, kind, amount, currency, occurred_on,
     label, source, external_id, payment_schedule_id,
     schedule_applied_amount, status)
  values
    (schedule.customer_id, schedule.booking_id, 'credit', 'card_payment',
     p_amount, schedule.currency, p_occurred_on, schedule.label, 'stripe',
     p_external_id, schedule.id, applied_amount, 'posted')
  returning id into tx_id;

  new_paid := schedule.paid_amount + applied_amount;
  update public.crm_payment_schedules set
    paid_amount = new_paid,
    status = case when new_paid >= amount then 'paid' else status end,
    paid_at = case when new_paid >= amount then now() else paid_at end,
    stripe_payment_intent_id = p_external_id,
    transaction_id = tx_id,
    updated_at = now()
  where id = p_schedule_id
  returning * into schedule;

  receipt_number := 'REC-' || upper(substr(md5(p_external_id), 1, 12));
  insert into public.crm_invoices
    (customer_id, booking_id, quote_id, transaction_id, number, kind, status,
     amount, currency, issued_on, paid_on)
  values
    (schedule.customer_id, schedule.booking_id, schedule.quote_id, tx_id,
     receipt_number, 'receipt', 'paid', p_amount, schedule.currency,
     p_occurred_on, p_occurred_on)
  on conflict (number) do nothing;

  insert into public.crm_audit_events
    (customer_id, entity_type, entity_id, action, metadata)
  values
    (schedule.customer_id, 'transaction', tx_id::text,
     case
       when applied_amount < p_amount
         then 'stripe_overpayment_pending_refund'
       else 'stripe_payment_reconciled'
     end,
     jsonb_build_object(
       'schedule_id', schedule.id,
       'stripe_payment_intent_id', p_external_id,
       'amount', p_amount,
       'schedule_applied_amount', applied_amount,
       'refund_due', p_amount - applied_amount
     ));

  return schedule;
end;
$$;

revoke all on function crm_private.record_schedule_payment(uuid,text,numeric,date)
  from public, anon, authenticated;
grant execute on function crm_private.record_schedule_payment(uuid,text,numeric,date)
  to service_role;
