-- Enforce quote lifecycle and accounting integrity below the API layer.

create or replace function crm_private.enforce_quote_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, crm_private
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('accepted', 'declined')
       and coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Un devis accepté ou refusé est immuable'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if new.booking_id is not null and not exists (
    select 1 from public.crm_bookings booking
    where booking.id = new.booking_id
      and booking.customer_id = new.customer_id
  ) then
    raise exception 'Le dossier et le devis appartiennent à des clients différents'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if old.status in ('accepted', 'declined')
       and coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Un devis accepté ou refusé est immuable'
        using errcode = '42501';
    end if;
    if old.status = 'sent' and new.status = 'sent' and (
      new.title is distinct from old.title
      or new.currency is distinct from old.currency
      or new.valid_until is distinct from old.valid_until
      or new.terms is distinct from old.terms
      or new.client_note is distinct from old.client_note
      or new.booking_id is distinct from old.booking_id
    ) then
      raise exception 'Repassez le devis en brouillon avant de le modifier'
        using errcode = '42501';
    end if;
    if old.status is distinct from new.status
       and new.status in ('accepted', 'declined')
       and crm_private.is_staff() then
      raise exception 'La décision signée est réservée au client'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_quote_integrity on public.crm_quotes;
create trigger trg_crm_quote_integrity
before insert or update or delete on public.crm_quotes
for each row execute function crm_private.enforce_quote_integrity();

create or replace function crm_private.enforce_quote_line_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, crm_private
as $$
declare
  target_quote_id uuid := case when tg_op = 'DELETE' then old.quote_id else new.quote_id end;
  quote_status text;
begin
  select status into quote_status
  from public.crm_quotes
  where id = target_quote_id;
  if quote_status is null then
    raise exception 'Devis introuvable' using errcode = '23503';
  end if;
  if quote_status <> 'draft' and crm_private.is_staff() then
    raise exception 'Les prestations sont modifiables uniquement en brouillon'
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_crm_quote_line_integrity on public.crm_quote_lines;
create trigger trg_crm_quote_line_integrity
before insert or update or delete on public.crm_quote_lines
for each row execute function crm_private.enforce_quote_line_integrity();

create or replace function crm_private.enforce_quoted_booking_item_customer()
returns trigger
language plpgsql
security definer
set search_path = public, crm_private
as $$
begin
  if new.details ? 'quote_line_id' and not exists (
    select 1
    from public.crm_bookings booking
    join public.crm_quotes quote on quote.customer_id = booking.customer_id
    join public.crm_quote_lines line on line.quote_id = quote.id
    where booking.id = new.booking_id
      and line.id::text = new.details ->> 'quote_line_id'
  ) then
    raise exception 'La prestation et le dossier appartiennent à des clients différents'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_booking_item_quote_customer on public.crm_booking_items;
create trigger trg_crm_booking_item_quote_customer
before insert or update of booking_id, details on public.crm_booking_items
for each row execute function crm_private.enforce_quoted_booking_item_customer();

create or replace function crm_private.enforce_schedule_customer_links()
returns trigger
language plpgsql
security definer
set search_path = public, crm_private
as $$
begin
  if new.booking_id is not null and not exists (
    select 1 from public.crm_bookings booking
    where booking.id = new.booking_id
      and booking.customer_id = new.customer_id
  ) then
    raise exception 'L’échéance et le dossier appartiennent à des clients différents'
      using errcode = '23514';
  end if;
  if new.quote_id is not null and not exists (
    select 1 from public.crm_quotes quote
    where quote.id = new.quote_id
      and quote.customer_id = new.customer_id
      and (new.booking_id is null or quote.booking_id = new.booking_id)
  ) then
    raise exception 'L’échéance et le devis sont incohérents'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_schedule_customer_links on public.crm_payment_schedules;
create trigger trg_crm_schedule_customer_links
before insert or update of customer_id, booking_id, quote_id
on public.crm_payment_schedules
for each row execute function crm_private.enforce_schedule_customer_links();

create or replace function crm_private.enforce_invoice_immutability()
returns trigger
language plpgsql
security definer
set search_path = public, crm_private
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'INSERT' then
    if new.transaction_id is not null then
      raise exception 'Seul le service financier peut lier une transaction'
        using errcode = '42501';
    end if;
    return new;
  end if;
  if old.transaction_id is not null or old.status <> 'draft' then
    raise exception 'Une pièce comptable émise est immuable'
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_crm_invoice_immutability on public.crm_invoices;
drop trigger if exists trg_zz_crm_invoice_immutability on public.crm_invoices;
create trigger trg_zz_crm_invoice_immutability
before insert or update or delete on public.crm_invoices
for each row execute function crm_private.enforce_invoice_immutability();

update public.crm_transactions refund
set payment_schedule_id = original.payment_schedule_id
from public.crm_transactions original
where refund.related_transaction_id = original.id
  and refund.kind = 'refund'
  and refund.payment_schedule_id is null;

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
