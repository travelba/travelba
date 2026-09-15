-- Preserve signed quote versions, link accounting documents, and automate daily follow-up.

alter table public.crm_invoices
  add column if not exists transaction_id uuid
    references public.crm_transactions(id) on delete set null;

create unique index if not exists crm_invoices_transaction_unique
  on public.crm_invoices(transaction_id)
  where transaction_id is not null;

create or replace function crm_private.link_invoice_transaction()
returns trigger
language plpgsql
security definer
set search_path = public, crm_private
as $$
begin
  if new.transaction_id is null and new.kind in ('receipt', 'credit_note') then
    select tx.id into new.transaction_id
    from public.crm_transactions tx
    where tx.source = 'stripe'
      and (
        (new.kind = 'receipt'
          and new.number = 'REC-' || upper(substr(md5(tx.external_id), 1, 12)))
        or
        (new.kind = 'credit_note'
          and new.number = 'AV-' || upper(substr(md5(tx.external_id), 1, 12)))
      )
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_invoice_link_transaction on public.crm_invoices;
create trigger trg_crm_invoice_link_transaction
before insert or update of number, kind, transaction_id on public.crm_invoices
for each row execute function crm_private.link_invoice_transaction();

update public.crm_invoices invoice
set transaction_id = tx.id
from public.crm_transactions tx
where invoice.transaction_id is null
  and tx.source = 'stripe'
  and (
    (invoice.kind = 'receipt'
      and invoice.number = 'REC-' || upper(substr(md5(tx.external_id), 1, 12)))
    or
    (invoice.kind = 'credit_note'
      and invoice.number = 'AV-' || upper(substr(md5(tx.external_id), 1, 12)))
  );

create or replace function crm_private.accept_quote_with_options(
  p_quote_id uuid,
  p_acceptance_name text,
  p_terms_accepted boolean,
  p_signature_data text,
  p_ip_hash text default null,
  p_selected_option_ids uuid[] default '{}'::uuid[]
)
returns public.crm_quotes
language plpgsql
security definer
set search_path = public, crm_private
as $$
declare
  q public.crm_quotes;
  target_booking_id uuid;
  quote_total numeric;
  year_number integer := extract(year from now())::integer;
  sequence_number integer;
begin
  if not p_terms_accepted
     or nullif(trim(p_acceptance_name), '') is null
     or nullif(trim(p_signature_data), '') is null then
    raise exception 'Nom, signature et acceptation des CGV requis'
      using errcode = '22023';
  end if;

  select * into q
  from public.crm_quotes
  where id = p_quote_id
    and customer_id = crm_private.customer_id()
    and status = 'sent'
    and (valid_until is null or valid_until >= current_date)
  for update;
  if not found then
    raise exception 'Devis indisponible ou expiré' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_selected_option_ids, '{}'::uuid[])) selected_id
    where not exists (
      select 1 from public.crm_quote_lines line
      where line.id = selected_id
        and line.quote_id = q.id
        and line.optional
    )
  ) then
    raise exception 'Option de devis invalide' using errcode = '22023';
  end if;

  update public.crm_quote_lines
  set selected = id = any(coalesce(p_selected_option_ids, '{}'::uuid[])),
      updated_at = now()
  where quote_id = q.id and optional;

  select coalesce(
    sum(quantity * unit_price * (1 + tax_rate / 100)),
    0
  ) into quote_total
  from public.crm_quote_lines
  where quote_id = q.id and (not optional or selected);

  target_booking_id := q.booking_id;
  if target_booking_id is null then
    insert into public.crm_booking_seq (year, last)
    values (year_number, 1)
    on conflict (year) do update
      set last = public.crm_booking_seq.last + 1
    returning last into sequence_number;

    insert into public.crm_bookings
      (customer_id, reference, title, status, currency, total_amount, notes_client)
    values
      (q.customer_id,
       'TB-' || year_number::text || '-' || lpad(sequence_number::text, 4, '0'),
       q.title, 'confirmed', q.currency, quote_total, q.client_note)
    returning id into target_booking_id;
  else
    update public.crm_bookings
    set total_amount = quote_total,
        currency = q.currency,
        updated_at = now()
    where id = target_booking_id and customer_id = q.customer_id;
  end if;

  insert into public.crm_booking_items
    (booking_id, kind, title, amount, sort_order, details)
  select target_booking_id,
    case
      when line.kind in ('flight','hotel','transfer','activity','insurance','fee')
        then line.kind
      else 'fee'
    end,
    line.title,
    line.quantity * line.unit_price * (1 + line.tax_rate / 100),
    line.sort_order,
    jsonb_build_object(
      'quote_line_id', line.id,
      'description', line.description,
      'quantity', line.quantity,
      'unit_price', line.unit_price,
      'tax_rate', line.tax_rate
    )
  from public.crm_quote_lines line
  where line.quote_id = q.id
    and (not line.optional or line.selected)
    and not exists (
      select 1 from public.crm_booking_items item
      where item.booking_id = target_booking_id
        and item.details ->> 'quote_line_id' = line.id::text
    )
  order by line.sort_order;

  if quote_total > 0 and not exists (
    select 1 from public.crm_payment_schedules
    where quote_id = q.id
      and status not in ('cancelled', 'refunded')
  ) then
    insert into public.crm_payment_schedules
      (customer_id, booking_id, quote_id, label, amount, currency, due_on)
    values
      (q.customer_id, target_booking_id, q.id, 'Solde ' || q.reference,
       quote_total, q.currency, current_date + 14);
  end if;

  update public.crm_quotes
  set status = 'accepted',
      booking_id = target_booking_id,
      accepted_at = now(),
      accepted_by = auth.uid(),
      acceptance_name = trim(p_acceptance_name),
      acceptance_ip_hash = p_ip_hash,
      terms_accepted = true,
      signature_data = trim(p_signature_data),
      updated_at = now()
  where id = q.id
  returning * into q;

  insert into public.crm_notifications
    (customer_id, booking_id, kind, title, message, action_url, idempotency_key)
  values
    (q.customer_id, target_booking_id, 'travel', 'Devis accepté',
     'Votre devis ' || q.reference || ' est accepté. Votre dossier et votre échéancier sont disponibles.',
     '/mon-compte/paiements', 'quote-accepted:' || q.id::text)
  on conflict (idempotency_key) do nothing;

  insert into public.crm_audit_events
    (actor_user_id, customer_id, entity_type, entity_id, action, metadata)
  values
    (auth.uid(), q.customer_id, 'quote', q.id::text, 'accepted',
     jsonb_build_object(
       'version', q.version,
       'terms_accepted', true,
       'selected_option_ids', coalesce(p_selected_option_ids, '{}'::uuid[])
     ));

  return q;
end;
$$;

revoke all on function crm_private.accept_quote_with_options(
  uuid,text,boolean,text,text,uuid[]
) from public, anon;
grant execute on function crm_private.accept_quote_with_options(
  uuid,text,boolean,text,text,uuid[]
) to authenticated;

create or replace function public.crm_accept_quote_with_options(
  p_quote_id uuid,
  p_acceptance_name text,
  p_terms_accepted boolean,
  p_signature_data text,
  p_ip_hash text default null,
  p_selected_option_ids uuid[] default '{}'::uuid[]
)
returns public.crm_quotes
language sql
security invoker
set search_path = public, crm_private
as $$
  select crm_private.accept_quote_with_options(
    p_quote_id, p_acceptance_name, p_terms_accepted, p_signature_data,
    p_ip_hash, p_selected_option_ids
  );
$$;

revoke all on function public.crm_accept_quote_with_options(
  uuid,text,boolean,text,text,uuid[]
) from public, anon;
grant execute on function public.crm_accept_quote_with_options(
  uuid,text,boolean,text,text,uuid[]
) to authenticated;

-- Remove the legacy unsigned acceptance path.
revoke execute on function public.crm_accept_quote(uuid,text,boolean,text,text)
  from authenticated;
revoke execute on function crm_private.accept_quote(uuid,text,boolean,text,text)
  from authenticated;

create or replace function public.crm_run_daily_operations()
returns integer
language plpgsql
security definer
set search_path = public, crm_private
as $$
declare
  task_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service réservé' using errcode = '42501';
  end if;

  update public.crm_quotes
  set status = 'expired', updated_at = now()
  where status = 'sent'
    and valid_until < current_date;

  update public.crm_payment_schedules
  set status = 'overdue', updated_at = now()
  where status = 'pending'
    and paid_amount < amount
    and due_on < current_date;

  insert into public.crm_notifications
    (customer_id, booking_id, kind, title, message, action_url, idempotency_key)
  select schedule.customer_id, schedule.booking_id, 'payment',
    'Échéance de paiement dépassée',
    schedule.label || ' présente un solde restant de '
      || greatest(schedule.amount - schedule.paid_amount, 0)
      || ' ' || schedule.currency || '.',
    '/mon-compte/paiements',
    'schedule-overdue:' || schedule.id::text
  from public.crm_payment_schedules schedule
  where schedule.status = 'overdue'
  on conflict (idempotency_key) do nothing;

  task_count := crm_private.refresh_operational_tasks();

  update public.crm_tasks task
  set status = 'done', completed_at = coalesce(completed_at, now()), updated_at = now()
  where task.status <> 'done'
    and task.source_key like 'schedule:%'
    and not exists (
      select 1 from public.crm_payment_schedules schedule
      where 'schedule:' || schedule.id::text = task.source_key
        and schedule.status in ('pending', 'overdue')
        and schedule.due_on <= current_date + 7
    );

  update public.crm_tasks task
  set status = 'done', completed_at = coalesce(completed_at, now()), updated_at = now()
  where task.status <> 'done'
    and task.source_key like 'departure:%'
    and not exists (
      select 1 from public.crm_bookings booking
      where 'departure:' || booking.id::text = task.source_key
        and booking.status in ('confirmed', 'travelling')
        and booking.start_date between current_date and current_date + 30
    );

  return task_count;
end;
$$;

revoke all on function public.crm_run_daily_operations()
  from public, anon, authenticated;
grant execute on function public.crm_run_daily_operations()
  to service_role;
