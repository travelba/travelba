-- Le débit du séjour suit la visibilité. Le statut stocké ne décide plus.

create or replace function crm_private.sync_booking_debit()
returns trigger
language plpgsql
security definer
set search_path = public, crm_private
as $$
declare
  target public.crm_bookings;
  payer uuid;
  should_debit boolean;
begin
  if tg_op = 'DELETE' then
    update public.crm_transactions set status = 'void'
    where booking_id = old.id and kind = 'booking'
      and direction = 'debit' and status <> 'void'
      and external_id is null;
    return old;
  end if;

  target := new;
  payer := coalesce(target.billing_customer_id, target.customer_id);
  should_debit :=
    target.status <> 'cancelled'
    and target.archived_at is null
    and target.visible_to_client
    and target.include_in_ledger
    and not target.client_settles_stay
    and coalesce(target.total_amount, 0) > 0;

  if not should_debit or payer is null then
    if payer is null and should_debit then
      return new;
    end if;
    update public.crm_transactions set status = 'void'
    where booking_id = target.id and kind = 'booking'
      and direction = 'debit' and status <> 'void'
      and external_id is null;
    return new;
  end if;

  insert into public.crm_transactions (
    customer_id, booking_id, direction, kind, amount,
    currency, label, source, status
  ) values (
    payer,
    target.id, 'debit', 'booking',
    target.total_amount, coalesce(target.currency, 'EUR'),
    'Réservation ' || target.reference || ' — ' || target.title,
    'manual', 'posted'
  )
  on conflict (booking_id)
    where booking_id is not null and kind = 'booking'
      and direction = 'debit' and status <> 'void'
      and external_id is null
  do update set
    customer_id = excluded.customer_id,
    amount = excluded.amount,
    currency = excluded.currency,
    label = excluded.label,
    status = 'posted';
  return new;
end;
$$;
