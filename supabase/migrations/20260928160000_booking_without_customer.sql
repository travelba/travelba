-- Une réservation peut s’ouvrir avant le client. Le grand livre attend le rattachement.

alter table public.crm_bookings
  alter column customer_id drop not null;

alter table public.crm_bookings
  alter column billing_customer_id drop not null;

comment on column public.crm_bookings.customer_id is
  'Voyageur titulaire. Null tant que l’agence n’a pas créé ou choisi le client.';

create or replace function crm_private.sync_booking_debit()
returns trigger
language plpgsql
security definer
set search_path = public, crm_private
as $$
declare
  target public.crm_bookings;
  payer uuid;
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
  if target.status not in ('confirmed', 'travelling', 'completed')
    or coalesce(target.total_amount, 0) <= 0
    or payer is null
  then
    if payer is null and target.status in ('confirmed', 'travelling', 'completed')
      and coalesce(target.total_amount, 0) > 0
    then
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
