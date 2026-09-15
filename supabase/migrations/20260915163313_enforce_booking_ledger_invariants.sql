-- A booking owns at most one active ledger debit. Keep it synchronized at the
-- database boundary so API retries and future clients cannot drift balances.

update public.crm_transactions
set kind = 'adjustment'
where booking_id is not null
  and kind = 'booking'
  and direction = 'debit'
  and label not like 'Réservation %';

update public.crm_transactions
set amount = 8170
where source = 'manual'
  and label = 'Apport Revolut Pay — Compte principal'
  and customer_id = (
    select id
    from public.crm_customers
    where email = 'client.demo@travelba.fr'
    limit 1
  );

with duplicates as (
  select
    id,
    row_number() over (
      partition by booking_id
      order by created_at asc, id asc
    ) as position
  from public.crm_transactions
  where booking_id is not null
    and kind = 'booking'
    and direction = 'debit'
    and status <> 'void'
)
update public.crm_transactions t
set kind = 'adjustment'
from duplicates d
where t.id = d.id and d.position > 1;

create unique index if not exists crm_transactions_one_active_booking_debit
  on public.crm_transactions (booking_id)
  where booking_id is not null
    and kind = 'booking'
    and direction = 'debit'
    and status <> 'void';

create or replace function crm_private.sync_booking_debit()
returns trigger
language plpgsql
security definer
set search_path = public, crm_private
as $$
declare
  target public.crm_bookings;
begin
  if tg_op = 'DELETE' then
    update public.crm_transactions
    set status = 'void'
    where booking_id = old.id
      and kind = 'booking'
      and direction = 'debit'
      and status <> 'void';
    return old;
  end if;

  target := new;
  if target.status not in ('confirmed', 'travelling', 'completed')
    or coalesce(target.total_amount, 0) <= 0
  then
    update public.crm_transactions
    set status = 'void'
    where booking_id = target.id
      and kind = 'booking'
      and direction = 'debit'
      and status <> 'void';
    return new;
  end if;

  insert into public.crm_transactions (
    customer_id,
    booking_id,
    direction,
    kind,
    amount,
    currency,
    label,
    source,
    status
  )
  values (
    target.customer_id,
    target.id,
    'debit',
    'booking',
    target.total_amount,
    coalesce(target.currency, 'EUR'),
    'Réservation ' || target.reference || ' — ' || target.title,
    'manual',
    'posted'
  )
  on conflict (booking_id)
    where booking_id is not null
      and kind = 'booking'
      and direction = 'debit'
      and status <> 'void'
  do update set
    customer_id = excluded.customer_id,
    amount = excluded.amount,
    currency = excluded.currency,
    label = excluded.label,
    status = 'posted';

  return new;
end;
$$;

drop trigger if exists trg_crm_booking_debit on public.crm_bookings;
create trigger trg_crm_booking_debit
after insert or update of customer_id, status, total_amount, currency, title, reference
or delete on public.crm_bookings
for each row execute function crm_private.sync_booking_debit();

-- Normalize every existing booking after installing the trigger.
update public.crm_bookings
set updated_at = updated_at;
