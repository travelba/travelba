-- Une carte postée tient le livre. Le total du séjour ne s’y ajoute pas :
-- ni au prochain enregistrement du dossier, ni à l’insertion d’une carte.

create or replace function crm_private.stay_rollup_covered(target_booking uuid)
returns boolean
language sql
stable
security definer
set search_path = public, crm_private
as $$
  select exists (
    select 1
    from public.crm_transactions t
    where t.booking_id = target_booking
      and t.direction = 'debit'
      and t.status = 'posted'
      and t.external_id is not null
      and coalesce(t.source, '') <> 'pliant'
      and position(':expense:' in t.external_id) = 0
      and t.external_id not like '%:agency-commission'
      and t.external_id not like '%:ticketing-fee'
  );
$$;

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

  if should_debit and payer is not null and crm_private.stay_rollup_covered(target.id) then
    delete from public.crm_transactions
    where booking_id = target.id
      and kind = 'booking'
      and direction = 'debit'
      and status <> 'void'
      and external_id is null;
    return new;
  end if;

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

create or replace function crm_private.skip_covered_stay_rollup()
returns trigger
language plpgsql
security definer
set search_path = public, crm_private
as $$
begin
  if new.direction = 'debit'
     and new.kind = 'booking'
     and new.external_id is null
     and new.booking_id is not null
     and new.status = 'posted'
     and crm_private.stay_rollup_covered(new.booking_id)
  then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_skip_covered_stay_rollup on public.crm_transactions;
create trigger trg_crm_skip_covered_stay_rollup
  before insert or update on public.crm_transactions
  for each row execute function crm_private.skip_covered_stay_rollup();

create or replace function crm_private.drop_stay_rollup_on_card()
returns trigger
language plpgsql
security definer
set search_path = public, crm_private
as $$
begin
  if new.booking_id is not null
     and new.direction = 'debit'
     and new.status = 'posted'
     and new.external_id is not null
     and coalesce(new.source, '') <> 'pliant'
     and position(':expense:' in new.external_id) = 0
     and new.external_id not like '%:agency-commission'
     and new.external_id not like '%:ticketing-fee'
  then
    delete from public.crm_transactions
    where booking_id = new.booking_id
      and kind = 'booking'
      and direction = 'debit'
      and status <> 'void'
      and external_id is null
      and id <> new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_drop_stay_rollup_on_card on public.crm_transactions;
create trigger trg_crm_drop_stay_rollup_on_card
  after insert on public.crm_transactions
  for each row execute function crm_private.drop_stay_rollup_on_card();

delete from public.crm_transactions r
where r.status = 'posted'
  and r.direction = 'debit'
  and r.kind = 'booking'
  and r.external_id is null
  and crm_private.stay_rollup_covered(r.booking_id);
