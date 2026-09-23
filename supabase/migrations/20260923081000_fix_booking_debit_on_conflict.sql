-- Le trigger sync_booking_debit faisait ON CONFLICT (booking_id) WHERE … sans
-- « external_id is null ». Depuis l’index séjour + cartes, Postgres 42P10
-- et l’import d’une confirmation (statut confirmed + total > 0) refuse le dossier.

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
    update public.crm_transactions set status = 'void'
    where booking_id = old.id and kind = 'booking'
      and direction = 'debit' and status <> 'void'
      and external_id is null;
    return old;
  end if;

  target := new;
  if target.status not in ('confirmed', 'travelling', 'completed')
    or coalesce(target.total_amount, 0) <= 0
  then
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
    coalesce(target.billing_customer_id, target.customer_id),
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
