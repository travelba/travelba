-- Enforce staff capabilities in RLS so direct Data API calls cannot bypass the UI/API.

alter table public.crm_notifications
  add column if not exists idempotency_key text unique;

alter table public.crm_quotes
  add column if not exists delivery_idempotency_key text unique;

alter table public.crm_service_requests
  add column if not exists response_delivery_key text unique;

create or replace function crm_private.has_staff_permission(p_capability text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.crm_staff staff
    where staff.auth_user_id = auth.uid()
      and staff.active
      and (
        staff.role = 'admin'
        or staff.permissions @> jsonb_build_object(p_capability, true)
      )
  );
$$;

revoke all on function crm_private.has_staff_permission(text) from public, anon;
grant execute on function crm_private.has_staff_permission(text) to authenticated;

drop policy if exists crm_staff_select on public.crm_staff;
create policy crm_staff_select on public.crm_staff for select to authenticated
  using (
    auth_user_id = auth.uid()
    or crm_private.is_staff()
  );

drop policy if exists crm_bookings_select on public.crm_bookings;
drop policy if exists crm_bookings_staff_insert on public.crm_bookings;
drop policy if exists crm_bookings_staff_update on public.crm_bookings;
drop policy if exists crm_bookings_staff_delete on public.crm_bookings;
create policy crm_bookings_select on public.crm_bookings for select to authenticated
  using (
    crm_private.has_staff_permission('bookings')
    or crm_private.has_staff_permission('quotes')
    or crm_private.has_staff_permission('finance')
    or crm_private.has_staff_permission('operations')
    or crm_private.has_staff_permission('mtrip')
    or (customer_id = crm_private.customer_id() and status <> 'draft')
  );
create policy crm_bookings_staff_insert on public.crm_bookings for insert to authenticated
  with check (crm_private.has_staff_permission('bookings'));
create policy crm_bookings_staff_update on public.crm_bookings for update to authenticated
  using (crm_private.has_staff_permission('bookings'))
  with check (crm_private.has_staff_permission('bookings'));
create policy crm_bookings_staff_delete on public.crm_bookings for delete to authenticated
  using (crm_private.has_staff_permission('bookings'));

do $$
declare
  table_name text;
  select_policy text;
  insert_policy text;
  update_policy text;
  delete_policy text;
begin
  foreach table_name in array array[
    'crm_booking_items', 'crm_booking_travelers', 'crm_booking_documents'
  ] loop
    select_policy := table_name || '_select';
    insert_policy := table_name || '_staff_insert';
    update_policy := table_name || '_staff_update';
    delete_policy := table_name || '_staff_delete';
    execute format('drop policy if exists %I on public.%I', select_policy, table_name);
    execute format('drop policy if exists %I on public.%I', insert_policy, table_name);
    execute format('drop policy if exists %I on public.%I', update_policy, table_name);
    execute format('drop policy if exists %I on public.%I', delete_policy, table_name);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (crm_private.has_staff_permission(''bookings''))',
      insert_policy, table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (crm_private.has_staff_permission(''bookings'')) with check (crm_private.has_staff_permission(''bookings''))',
      update_policy, table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (crm_private.has_staff_permission(''bookings''))',
      delete_policy, table_name
    );
  end loop;
end $$;

create policy crm_booking_items_select on public.crm_booking_items for select to authenticated
  using (
    crm_private.has_staff_permission('bookings')
    or exists (
      select 1 from public.crm_bookings booking
      where booking.id = booking_id
        and booking.customer_id = crm_private.customer_id()
        and booking.status <> 'draft'
    )
  );
create policy crm_booking_travelers_select on public.crm_booking_travelers for select to authenticated
  using (
    crm_private.has_staff_permission('bookings')
    or exists (
      select 1 from public.crm_bookings booking
      where booking.id = booking_id
        and booking.customer_id = crm_private.customer_id()
        and booking.status <> 'draft'
    )
  );
create policy crm_booking_documents_select on public.crm_booking_documents for select to authenticated
  using (
    crm_private.has_staff_permission('bookings')
    or (
      visible_to_client
      and exists (
        select 1 from public.crm_bookings booking
        where booking.id = booking_id
          and booking.customer_id = crm_private.customer_id()
          and booking.status <> 'draft'
      )
    )
  );

drop policy if exists crm_customers_select on public.crm_customers;
drop policy if exists crm_customers_insert on public.crm_customers;
drop policy if exists crm_customers_update on public.crm_customers;
drop policy if exists crm_customers_delete on public.crm_customers;
create policy crm_customers_select on public.crm_customers for select to authenticated
  using (
    crm_private.has_staff_permission('bookings')
    or crm_private.has_staff_permission('quotes')
    or crm_private.has_staff_permission('finance')
    or crm_private.has_staff_permission('operations')
    or crm_private.has_staff_permission('mtrip')
    or auth_user_id = auth.uid()
  );
create policy crm_customers_insert on public.crm_customers for insert to authenticated
  with check (crm_private.has_staff_permission('bookings'));
create policy crm_customers_update on public.crm_customers for update to authenticated
  using (crm_private.has_staff_permission('bookings') or auth_user_id = auth.uid())
  with check (crm_private.has_staff_permission('bookings') or auth_user_id = auth.uid());
create policy crm_customers_delete on public.crm_customers for delete to authenticated
  using (crm_private.has_staff_permission('bookings'));

drop policy if exists crm_companions_access on public.crm_travel_companions;
create policy crm_companions_access on public.crm_travel_companions for all to authenticated
  using (
    crm_private.has_staff_permission('bookings')
    or customer_id = crm_private.customer_id()
  )
  with check (
    crm_private.has_staff_permission('bookings')
    or customer_id = crm_private.customer_id()
  );

drop policy if exists crm_travel_documents_access on public.crm_travel_documents;
create policy crm_travel_documents_access on public.crm_travel_documents for all to authenticated
  using (
    crm_private.has_staff_permission('bookings')
    or customer_id = crm_private.customer_id()
  )
  with check (
    crm_private.has_staff_permission('bookings')
    or customer_id = crm_private.customer_id()
  );

drop policy if exists crm_transactions_select on public.crm_transactions;
drop policy if exists crm_transactions_staff_insert on public.crm_transactions;
drop policy if exists crm_transactions_staff_update on public.crm_transactions;
drop policy if exists crm_transactions_staff_delete on public.crm_transactions;
create policy crm_transactions_select on public.crm_transactions for select to authenticated
  using (
    crm_private.has_staff_permission('finance')
    or (customer_id = crm_private.customer_id() and status = 'posted')
  );
create policy crm_transactions_staff_insert on public.crm_transactions for insert to authenticated
  with check (crm_private.has_staff_permission('finance'));
create policy crm_transactions_staff_update on public.crm_transactions for update to authenticated
  using (crm_private.has_staff_permission('finance'))
  with check (crm_private.has_staff_permission('finance'));
create policy crm_transactions_staff_delete on public.crm_transactions for delete to authenticated
  using (crm_private.has_staff_permission('finance'));

drop policy if exists crm_payment_methods_select on public.crm_payment_methods;
create policy crm_payment_methods_select on public.crm_payment_methods for select to authenticated
  using (
    crm_private.has_staff_permission('finance')
    or customer_id = crm_private.customer_id()
  );

drop policy if exists crm_quotes_select on public.crm_quotes;
drop policy if exists crm_quotes_staff_insert on public.crm_quotes;
drop policy if exists crm_quotes_staff_update on public.crm_quotes;
drop policy if exists crm_quotes_staff_delete on public.crm_quotes;
create policy crm_quotes_select on public.crm_quotes for select to authenticated
  using (
    crm_private.has_staff_permission('quotes')
    or (customer_id = crm_private.customer_id() and status <> 'draft')
  );
create policy crm_quotes_staff_insert on public.crm_quotes for insert to authenticated
  with check (crm_private.has_staff_permission('quotes'));
create policy crm_quotes_staff_update on public.crm_quotes for update to authenticated
  using (crm_private.has_staff_permission('quotes'))
  with check (crm_private.has_staff_permission('quotes'));
create policy crm_quotes_staff_delete on public.crm_quotes for delete to authenticated
  using (crm_private.has_staff_permission('quotes'));

do $$
declare
  table_name text;
  capability text;
begin
  for table_name, capability in
    select * from (values
      ('crm_quote_lines', 'quotes'),
      ('crm_quote_versions', 'quotes'),
      ('crm_payment_schedules', 'finance'),
      ('crm_invoices', 'finance')
    ) configured(table_name, capability)
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_staff', table_name);
    execute format('drop policy if exists %I on public.%I', replace(table_name, 'crm_payment_schedules', 'crm_schedules') || '_staff_insert', table_name);
    execute format('drop policy if exists %I on public.%I', replace(table_name, 'crm_payment_schedules', 'crm_schedules') || '_staff_update', table_name);
    execute format('drop policy if exists %I on public.%I', replace(table_name, 'crm_payment_schedules', 'crm_schedules') || '_staff_delete', table_name);
  end loop;
end $$;

drop policy if exists crm_quote_lines_select on public.crm_quote_lines;
create policy crm_quote_lines_select on public.crm_quote_lines for select to authenticated
  using (
    crm_private.has_staff_permission('quotes')
    or exists (
      select 1 from public.crm_quotes quote
      where quote.id = quote_id
        and quote.customer_id = crm_private.customer_id()
        and quote.status <> 'draft'
    )
  );
create policy crm_quote_lines_staff_insert on public.crm_quote_lines for insert to authenticated
  with check (crm_private.has_staff_permission('quotes'));
create policy crm_quote_lines_staff_update on public.crm_quote_lines for update to authenticated
  using (crm_private.has_staff_permission('quotes'))
  with check (crm_private.has_staff_permission('quotes'));
create policy crm_quote_lines_staff_delete on public.crm_quote_lines for delete to authenticated
  using (crm_private.has_staff_permission('quotes'));

drop policy if exists crm_quote_versions_select on public.crm_quote_versions;
create policy crm_quote_versions_select on public.crm_quote_versions for select to authenticated
  using (
    crm_private.has_staff_permission('quotes')
    or exists (
      select 1 from public.crm_quotes quote
      where quote.id = quote_id
        and quote.customer_id = crm_private.customer_id()
        and quote.status <> 'draft'
    )
  );
create policy crm_quote_versions_staff_insert on public.crm_quote_versions for insert to authenticated
  with check (crm_private.has_staff_permission('quotes'));

drop policy if exists crm_schedules_select on public.crm_payment_schedules;
create policy crm_schedules_select on public.crm_payment_schedules for select to authenticated
  using (
    crm_private.has_staff_permission('finance')
    or customer_id = crm_private.customer_id()
  );
create policy crm_schedules_staff_insert on public.crm_payment_schedules for insert to authenticated
  with check (crm_private.has_staff_permission('finance'));
create policy crm_schedules_staff_update on public.crm_payment_schedules for update to authenticated
  using (crm_private.has_staff_permission('finance'))
  with check (crm_private.has_staff_permission('finance'));
create policy crm_schedules_staff_delete on public.crm_payment_schedules for delete to authenticated
  using (crm_private.has_staff_permission('finance'));

drop policy if exists crm_invoices_select on public.crm_invoices;
create policy crm_invoices_select on public.crm_invoices for select to authenticated
  using (
    crm_private.has_staff_permission('finance')
    or (customer_id = crm_private.customer_id() and status <> 'draft')
  );
create policy crm_invoices_staff_insert on public.crm_invoices for insert to authenticated
  with check (crm_private.has_staff_permission('finance'));
create policy crm_invoices_staff_update on public.crm_invoices for update to authenticated
  using (crm_private.has_staff_permission('finance'))
  with check (crm_private.has_staff_permission('finance'));
create policy crm_invoices_staff_delete on public.crm_invoices for delete to authenticated
  using (crm_private.has_staff_permission('finance'));

drop policy if exists crm_requests_select on public.crm_service_requests;
drop policy if exists crm_requests_insert on public.crm_service_requests;
drop policy if exists crm_requests_staff_update on public.crm_service_requests;
drop policy if exists crm_requests_staff_delete on public.crm_service_requests;
create policy crm_requests_select on public.crm_service_requests for select to authenticated
  using (
    crm_private.has_staff_permission('operations')
    or customer_id = crm_private.customer_id()
  );
create policy crm_requests_insert on public.crm_service_requests for insert to authenticated
  with check (
    crm_private.has_staff_permission('operations')
    or (
      customer_id = crm_private.customer_id()
      and status = 'open'
      and assigned_to is null
      and staff_response is null
      and (
        booking_id is null
        or exists (
          select 1 from public.crm_bookings booking
          where booking.id = booking_id
            and booking.customer_id = crm_private.customer_id()
        )
      )
    )
  );
create policy crm_requests_staff_update on public.crm_service_requests for update to authenticated
  using (crm_private.has_staff_permission('operations'))
  with check (crm_private.has_staff_permission('operations'));
create policy crm_requests_staff_delete on public.crm_service_requests for delete to authenticated
  using (crm_private.has_staff_permission('operations'));

drop policy if exists crm_notifications_select on public.crm_notifications;
drop policy if exists crm_notifications_staff_insert on public.crm_notifications;
drop policy if exists crm_notifications_staff_delete on public.crm_notifications;
create policy crm_notifications_select on public.crm_notifications for select to authenticated
  using (
    crm_private.has_staff_permission('operations')
    or customer_id = crm_private.customer_id()
  );
create policy crm_notifications_staff_insert on public.crm_notifications for insert to authenticated
  with check (crm_private.has_staff_permission('operations'));
create policy crm_notifications_staff_delete on public.crm_notifications for delete to authenticated
  using (crm_private.has_staff_permission('operations'));

drop policy if exists crm_notification_preferences_access on public.crm_notification_preferences;
create policy crm_notification_preferences_access on public.crm_notification_preferences
  for all to authenticated
  using (
    crm_private.has_staff_permission('operations')
    or customer_id = crm_private.customer_id()
  )
  with check (
    crm_private.has_staff_permission('operations')
    or customer_id = crm_private.customer_id()
  );

do $$
declare
  table_name text;
  capability text;
begin
  for table_name, capability in
    select * from (values
      ('crm_tasks', 'operations'),
      ('crm_suppliers', 'suppliers'),
      ('crm_mtrip_publications', 'mtrip')
    ) configured(table_name, capability)
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_staff', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (crm_private.has_staff_permission(%L)) with check (crm_private.has_staff_permission(%L))',
      table_name || '_staff', table_name, capability, capability
    );
  end loop;
end $$;

drop policy if exists crm_mtrip_publications_customer_select on public.crm_mtrip_publications;
create policy crm_mtrip_publications_customer_select
  on public.crm_mtrip_publications for select to authenticated
  using (
    state = 'published'
    and exists (
      select 1 from public.crm_bookings booking
      where booking.id = booking_id
        and booking.customer_id = crm_private.customer_id()
        and booking.status <> 'draft'
    )
  );

drop policy if exists crm_agency_settings_staff on public.crm_agency_settings;
create policy crm_agency_settings_staff on public.crm_agency_settings
  for all to authenticated
  using (crm_private.has_staff_permission('admin'))
  with check (crm_private.has_staff_permission('admin'));

drop policy if exists crm_audit_events_staff on public.crm_audit_events;
create policy crm_audit_events_staff on public.crm_audit_events
  for select to authenticated
  using (crm_private.has_staff_permission('admin'));

create or replace function crm_private.set_transaction_status(
  p_transaction_id uuid,
  p_status text
)
returns public.crm_transactions
language plpgsql
security definer
set search_path = public, crm_private
as $$
declare
  tx public.crm_transactions;
  staff_id uuid;
begin
  if not crm_private.has_staff_permission('finance') then
    raise exception 'Permission finance requise' using errcode = '42501';
  end if;
  if p_status not in ('pending','posted','void') then
    raise exception 'Statut invalide' using errcode = '22023';
  end if;
  select id into staff_id
  from public.crm_staff
  where auth_user_id = auth.uid() and active
  limit 1;
  update public.crm_transactions
  set status = p_status, updated_at = now()
  where id = p_transaction_id
  returning * into tx;
  if not found then
    raise exception 'Transaction introuvable' using errcode = 'P0002';
  end if;
  insert into public.crm_audit_events
    (actor_user_id, actor_staff_id, customer_id, entity_type, entity_id, action, metadata)
  values
    (auth.uid(), staff_id, tx.customer_id, 'transaction', tx.id::text,
     'status_changed', jsonb_build_object('status', p_status));
  return tx;
end;
$$;

create or replace function crm_private.refresh_operational_tasks()
returns integer
language plpgsql
security definer
set search_path = public, crm_private
as $$
declare
  affected integer := 0;
  n integer;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not crm_private.has_staff_permission('operations') then
    raise exception 'Permission opérations requise' using errcode = '42501';
  end if;

  insert into public.crm_tasks
    (customer_id, booking_id, title, description, category, priority, due_at, source_key)
  select customer_id, booking_id, 'Échéance à relancer : ' || label,
    'Montant restant : ' || greatest(amount - paid_amount, 0) || ' ' || currency,
    'payment', case when due_on < current_date then 'urgent' else 'high' end,
    due_on::timestamptz, 'schedule:' || id
  from public.crm_payment_schedules
  where status in ('pending','overdue') and due_on <= current_date + 7
  on conflict (source_key) do update set
    title = excluded.title,
    description = excluded.description,
    priority = excluded.priority,
    due_at = excluded.due_at;
  get diagnostics n = row_count;
  affected := affected + n;

  insert into public.crm_tasks
    (customer_id, title, description, category, priority, due_at, source_key)
  select customer_id, 'Document bientôt expiré',
    coalesce(file_name, doc_type) || ' expire le ' || expires_on,
    'document', case when expires_on <= current_date + 30 then 'urgent' else 'high' end,
    expires_on::timestamptz, 'document:' || id
  from public.crm_travel_documents
  where expires_on between current_date and current_date + 90
  on conflict (source_key) do update set
    description = excluded.description,
    priority = excluded.priority,
    due_at = excluded.due_at;
  get diagnostics n = row_count;
  affected := affected + n;

  insert into public.crm_tasks
    (customer_id, booking_id, title, description, category, priority, due_at, source_key)
  select customer_id, id, 'Préparer le départ : ' || title,
    'Vérifier billets, vouchers, documents et carnet mTrip pour ' || reference,
    'departure', 'high', start_date::timestamptz, 'departure:' || id
  from public.crm_bookings
  where status in ('confirmed','travelling')
    and start_date between current_date and current_date + 30
  on conflict (source_key) do update set
    title = excluded.title,
    description = excluded.description,
    due_at = excluded.due_at;
  get diagnostics n = row_count;
  return affected + n;
end;
$$;

create or replace function crm_private.merge_customers(
  p_source_id uuid,
  p_target_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, crm_private
as $$
declare
  source_user uuid;
  target_user uuid;
begin
  if not crm_private.has_staff_permission('admin') then
    raise exception 'Permission administrateur requise' using errcode = '42501';
  end if;
  if p_source_id = p_target_id then
    raise exception 'Les clients doivent être différents' using errcode = '22023';
  end if;
  select auth_user_id into source_user
  from public.crm_customers where id = p_source_id for update;
  if not found then
    raise exception 'Client source introuvable' using errcode = 'P0002';
  end if;
  select auth_user_id into target_user
  from public.crm_customers where id = p_target_id for update;
  if not found then
    raise exception 'Client cible introuvable' using errcode = 'P0002';
  end if;
  if source_user is not null and target_user is not null and source_user <> target_user then
    raise exception 'Les deux clients ont déjà un accès portail distinct' using errcode = '23505';
  end if;

  update public.crm_travel_companions set customer_id = p_target_id where customer_id = p_source_id;
  update public.crm_travel_documents set customer_id = p_target_id where customer_id = p_source_id;
  update public.crm_bookings set customer_id = p_target_id where customer_id = p_source_id;
  update public.crm_transactions set customer_id = p_target_id where customer_id = p_source_id;
  update public.crm_payment_methods set customer_id = p_target_id where customer_id = p_source_id;
  update public.crm_quotes set customer_id = p_target_id where customer_id = p_source_id;
  update public.crm_payment_schedules set customer_id = p_target_id where customer_id = p_source_id;
  update public.crm_invoices set customer_id = p_target_id where customer_id = p_source_id;
  update public.crm_service_requests set customer_id = p_target_id where customer_id = p_source_id;
  update public.crm_notifications set customer_id = p_target_id where customer_id = p_source_id;
  update public.crm_tasks set customer_id = p_target_id where customer_id = p_source_id;

  insert into public.crm_notification_preferences
    (customer_id, email_travel, email_payment, email_documents, whatsapp_operational)
  select p_target_id, email_travel, email_payment, email_documents, whatsapp_operational
  from public.crm_notification_preferences
  where customer_id = p_source_id
  on conflict (customer_id) do nothing;
  delete from public.crm_notification_preferences where customer_id = p_source_id;

  if target_user is null and source_user is not null then
    update public.crm_customers set auth_user_id = source_user where id = p_target_id;
  end if;
  insert into public.crm_audit_events
    (actor_user_id, customer_id, entity_type, entity_id, action, metadata)
  values
    (auth.uid(), p_target_id, 'customer', p_target_id::text, 'merged',
     jsonb_build_object('source_customer_id', p_source_id));
  delete from public.crm_customers where id = p_source_id;
  return p_target_id;
end;
$$;

create or replace function public.crm_set_transaction_status(
  p_transaction_id uuid,
  p_status text
)
returns public.crm_transactions
language plpgsql
security invoker
set search_path = public, crm_private
as $$
begin
  if not crm_private.has_staff_permission('finance') then
    raise exception 'Permission finance requise' using errcode = '42501';
  end if;
  return crm_private.set_transaction_status(p_transaction_id, p_status);
end;
$$;

create or replace function public.crm_refresh_operational_tasks()
returns integer
language plpgsql
security invoker
set search_path = public, crm_private
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not crm_private.has_staff_permission('operations') then
    raise exception 'Permission opérations requise' using errcode = '42501';
  end if;
  return crm_private.refresh_operational_tasks();
end;
$$;

create or replace function public.crm_merge_customers(
  p_source_id uuid,
  p_target_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public, crm_private
as $$
begin
  if not crm_private.has_staff_permission('admin') then
    raise exception 'Permission administrateur requise' using errcode = '42501';
  end if;
  return crm_private.merge_customers(p_source_id, p_target_id);
end;
$$;
