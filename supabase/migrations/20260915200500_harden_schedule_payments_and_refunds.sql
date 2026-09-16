-- Make Stripe reconciliation idempotent and keep schedules/receipts aligned with refunds.

alter table public.crm_transactions
  add column if not exists related_transaction_id uuid
    references public.crm_transactions(id) on delete set null,
  add column if not exists payment_schedule_id uuid
    references public.crm_payment_schedules(id) on delete set null;

create index if not exists crm_transactions_related_idx
  on public.crm_transactions(related_transaction_id)
  where related_transaction_id is not null;

create index if not exists crm_transactions_schedule_idx
  on public.crm_transactions(payment_schedule_id)
  where payment_schedule_id is not null;

update public.crm_transactions tx
set payment_schedule_id = schedule.id
from public.crm_payment_schedules schedule
where schedule.transaction_id = tx.id
  and tx.payment_schedule_id is null;

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

  insert into public.crm_transactions
    (customer_id, booking_id, direction, kind, amount, currency, occurred_on,
     label, source, external_id, payment_schedule_id, status)
  values
    (schedule.customer_id, schedule.booking_id, 'credit', 'card_payment',
     p_amount, schedule.currency, p_occurred_on, schedule.label, 'stripe',
     p_external_id, schedule.id, 'posted')
  returning id into tx_id;

  new_paid := least(schedule.amount, schedule.paid_amount + p_amount);
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
    (customer_id, booking_id, quote_id, number, kind, status, amount,
     currency, issued_on, paid_on)
  values
    (schedule.customer_id, schedule.booking_id, schedule.quote_id,
     receipt_number, 'receipt', 'paid', p_amount, schedule.currency,
     p_occurred_on, p_occurred_on)
  on conflict (number) do nothing;

  insert into public.crm_audit_events
    (customer_id, entity_type, entity_id, action, metadata)
  values
    (schedule.customer_id, 'transaction', tx_id::text,
     'stripe_payment_reconciled',
     jsonb_build_object(
       'schedule_id', schedule.id,
       'stripe_payment_intent_id', p_external_id,
       'amount', p_amount
     ));

  return schedule;
end;
$$;

revoke all on function crm_private.record_schedule_payment(uuid,text,numeric,date)
  from public, anon, authenticated;
grant execute on function crm_private.record_schedule_payment(uuid,text,numeric,date)
  to service_role;

create or replace function crm_private.record_schedule_refund(
  p_transaction_id uuid,
  p_payment_intent_id text,
  p_external_id text,
  p_amount numeric,
  p_occurred_on date default current_date
)
returns public.crm_transactions
language plpgsql
security definer
set search_path = public, crm_private
as $$
declare
  original public.crm_transactions;
  refund_tx public.crm_transactions;
  schedule public.crm_payment_schedules;
  already_refunded numeric;
  new_paid numeric;
  credit_number text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service réservé' using errcode = '42501';
  end if;
  if nullif(trim(p_external_id), '') is null or p_amount <= 0 then
    raise exception 'Remboursement invalide' using errcode = '22023';
  end if;

  select * into original
  from public.crm_transactions
  where id = p_transaction_id
    and source = 'stripe'
    and direction = 'credit'
    and status = 'posted'
  for update;
  if not found then
    raise exception 'Paiement Stripe introuvable' using errcode = 'P0002';
  end if;
  if original.external_id is distinct from nullif(trim(p_payment_intent_id), '') then
    raise exception 'Le remboursement ne correspond pas au paiement Stripe'
      using errcode = '22023';
  end if;

  select * into refund_tx
  from public.crm_transactions
  where source = 'stripe' and external_id = p_external_id
  limit 1;
  if found then
    return refund_tx;
  end if;

  select coalesce(sum(amount), 0) into already_refunded
  from public.crm_transactions
  where related_transaction_id = original.id
    and direction = 'debit'
    and kind = 'refund'
    and status = 'posted';
  if already_refunded + p_amount > original.amount then
    raise exception 'Le remboursement cumulé dépasse le paiement'
      using errcode = '22023';
  end if;

  insert into public.crm_transactions
    (customer_id, booking_id, direction, kind, amount, currency, occurred_on,
     label, source, external_id, related_transaction_id, status)
  values
    (original.customer_id, original.booking_id, 'debit', 'refund', p_amount,
     original.currency, p_occurred_on, 'Remboursement ' || original.label,
     'stripe', p_external_id, original.id, 'posted')
  returning * into refund_tx;

  select * into schedule
  from public.crm_payment_schedules
  where id = original.payment_schedule_id
  for update;
  if found then
    new_paid := greatest(0, schedule.paid_amount - p_amount);
    update public.crm_payment_schedules set
      paid_amount = new_paid,
      status = case
        when new_paid = 0 then 'refunded'
        when due_on < current_date then 'overdue'
        else 'pending'
      end,
      paid_at = case when new_paid >= amount then paid_at else null end,
      updated_at = now()
    where id = schedule.id;
  end if;

  credit_number := 'AV-' || upper(substr(md5(p_external_id), 1, 12));
  insert into public.crm_invoices
    (customer_id, booking_id, quote_id, number, kind, status, amount,
     currency, issued_on, paid_on)
  values
    (original.customer_id, original.booking_id, schedule.quote_id,
     credit_number, 'credit_note', 'issued', -p_amount, original.currency,
     p_occurred_on, p_occurred_on)
  on conflict (number) do nothing;

  insert into public.crm_audit_events
    (customer_id, entity_type, entity_id, action, metadata)
  values
    (original.customer_id, 'transaction', refund_tx.id::text,
     'stripe_refund_reconciled',
     jsonb_build_object(
       'original_transaction_id', original.id,
       'stripe_refund_id', p_external_id,
       'amount', p_amount
     ));

  return refund_tx;
end;
$$;

revoke all on function crm_private.record_schedule_refund(uuid,text,text,numeric,date)
  from public, anon, authenticated;
grant execute on function crm_private.record_schedule_refund(uuid,text,text,numeric,date)
  to service_role;

create or replace function public.crm_record_schedule_refund(
  p_transaction_id uuid,
  p_payment_intent_id text,
  p_external_id text,
  p_amount numeric,
  p_occurred_on date default current_date
)
returns public.crm_transactions
language sql
security invoker
set search_path = public, crm_private
as $$
  select crm_private.record_schedule_refund(
    p_transaction_id, p_payment_intent_id, p_external_id, p_amount, p_occurred_on
  );
$$;

revoke all on function public.crm_record_schedule_refund(uuid,text,text,numeric,date)
  from public, anon, authenticated;
grant execute on function public.crm_record_schedule_refund(uuid,text,text,numeric,date)
  to service_role;
