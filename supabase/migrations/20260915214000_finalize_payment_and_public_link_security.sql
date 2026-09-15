-- Finalize payment linkage, quote creation guards, and short-link entropy.

create or replace function crm_private.block_staff_decision_on_quote_insert()
returns trigger
language plpgsql
security definer
set search_path = public, crm_private
as $$
begin
  if new.status in ('accepted', 'declined')
     and coalesce(auth.role(), '') <> 'service_role'
     and crm_private.is_staff() then
    raise exception 'La décision signée est réservée au client'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_quote_insert_decision on public.crm_quotes;
create trigger trg_crm_quote_insert_decision
before insert on public.crm_quotes
for each row execute function crm_private.block_staff_decision_on_quote_insert();

-- Revoke legacy 40-bit links. A new 80-bit code is generated on the next send.
update public.agency_mtrip_guides
set short_code = null, updated_at = now()
where short_code is not null and length(short_code) < 16;

drop trigger if exists trg_crm_invoice_link_transaction on public.crm_invoices;
drop function if exists crm_private.link_invoice_transaction();

create or replace function crm_private.validate_invoice_transaction()
returns trigger
language plpgsql
security definer
set search_path = public, crm_private
as $$
declare
  tx public.crm_transactions;
begin
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

drop trigger if exists trg_crm_invoice_transaction_consistency on public.crm_invoices;
create trigger trg_crm_invoice_transaction_consistency
before insert or update of transaction_id, customer_id, booking_id, kind,
  amount, currency, status
on public.crm_invoices
for each row execute function crm_private.validate_invoice_transaction();

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
  net_paid numeric;
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

  if original.payment_schedule_id is not null then
    select * into schedule
    from public.crm_payment_schedules
    where id = original.payment_schedule_id
    for update;
  end if;

  insert into public.crm_transactions
    (customer_id, booking_id, direction, kind, amount, currency, occurred_on,
     label, source, external_id, related_transaction_id, payment_schedule_id,
     status)
  values
    (original.customer_id, original.booking_id, 'debit', 'refund', p_amount,
     original.currency, p_occurred_on, 'Remboursement ' || original.label,
     'stripe', p_external_id, original.id, original.payment_schedule_id,
     'posted')
  returning * into refund_tx;

  if schedule.id is not null then
    select greatest(
      0,
      coalesce(sum(
        case when direction = 'credit' then amount else -amount end
      ), 0)
    ) into net_paid
    from public.crm_transactions
    where payment_schedule_id = schedule.id
      and status = 'posted';
    new_paid := least(schedule.amount, net_paid);
    update public.crm_payment_schedules set
      paid_amount = new_paid,
      status = case
        when new_paid >= amount then 'paid'
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
    (customer_id, booking_id, quote_id, transaction_id, number, kind, status,
     amount, currency, issued_on, paid_on)
  values
    (original.customer_id, original.booking_id, schedule.quote_id,
     refund_tx.id, credit_number, 'credit_note', 'issued', -p_amount,
     original.currency, p_occurred_on, p_occurred_on)
  on conflict (number) do nothing;

  insert into public.crm_audit_events
    (customer_id, entity_type, entity_id, action, metadata)
  values
    (original.customer_id, 'transaction', refund_tx.id::text,
     'stripe_refund_reconciled',
     jsonb_build_object(
       'original_transaction_id', original.id,
       'stripe_refund_id', p_external_id,
       'amount', p_amount,
       'schedule_net_paid', net_paid
     ));

  return refund_tx;
end;
$$;

revoke all on function crm_private.record_schedule_refund(uuid,text,text,numeric,date)
  from public, anon, authenticated;
grant execute on function crm_private.record_schedule_refund(uuid,text,text,numeric,date)
  to service_role;
