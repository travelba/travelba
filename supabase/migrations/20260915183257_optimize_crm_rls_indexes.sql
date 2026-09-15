-- Cover every operational foreign key used for joins/deletes.
create index if not exists crm_agency_settings_updated_by_idx on public.crm_agency_settings(updated_by);
create index if not exists crm_audit_actor_staff_idx on public.crm_audit_events(actor_staff_id);
create index if not exists crm_audit_customer_idx on public.crm_audit_events(customer_id);
create index if not exists crm_invoices_booking_idx on public.crm_invoices(booking_id);
create index if not exists crm_invoices_quote_idx on public.crm_invoices(quote_id);
create index if not exists crm_mtrip_publications_published_by_idx on public.crm_mtrip_publications(published_by);
create index if not exists crm_notifications_booking_idx on public.crm_notifications(booking_id);
create index if not exists crm_schedules_quote_idx on public.crm_payment_schedules(quote_id);
create index if not exists crm_schedules_transaction_idx on public.crm_payment_schedules(transaction_id);
create index if not exists crm_quote_versions_created_by_idx on public.crm_quote_versions(created_by);
create index if not exists crm_quotes_accepted_by_idx on public.crm_quotes(accepted_by);
create index if not exists crm_quotes_created_by_idx on public.crm_quotes(created_by);
create index if not exists crm_requests_assigned_to_idx on public.crm_service_requests(assigned_to);
create index if not exists crm_requests_booking_idx on public.crm_service_requests(booking_id);
create index if not exists crm_tasks_assigned_to_idx on public.crm_tasks(assigned_to);
create index if not exists crm_tasks_customer_idx on public.crm_tasks(customer_id);

alter table public.crm_transactions
  add column if not exists receipt_storage_path text,
  add column if not exists receipt_file_name text,
  add column if not exists receipt_mime_type text;

-- Replace overlapping staff/customer policies with one policy per operation.
drop policy if exists crm_quotes_staff on public.crm_quotes;
drop policy if exists crm_quotes_customer_select on public.crm_quotes;
create policy crm_quotes_select on public.crm_quotes for select to authenticated
  using (crm_private.is_staff() or (customer_id = crm_private.customer_id() and status <> 'draft'));
create policy crm_quotes_staff_insert on public.crm_quotes for insert to authenticated
  with check (crm_private.is_staff());
create policy crm_quotes_staff_update on public.crm_quotes for update to authenticated
  using (crm_private.is_staff()) with check (crm_private.is_staff());
create policy crm_quotes_staff_delete on public.crm_quotes for delete to authenticated
  using (crm_private.is_staff());

drop policy if exists crm_quote_lines_staff on public.crm_quote_lines;
drop policy if exists crm_quote_lines_customer_select on public.crm_quote_lines;
create policy crm_quote_lines_select on public.crm_quote_lines for select to authenticated
  using (
    crm_private.is_staff() or exists (
      select 1 from public.crm_quotes q
      where q.id = quote_id and q.customer_id = crm_private.customer_id() and q.status <> 'draft'
    )
  );
create policy crm_quote_lines_staff_insert on public.crm_quote_lines for insert to authenticated
  with check (crm_private.is_staff());
create policy crm_quote_lines_staff_update on public.crm_quote_lines for update to authenticated
  using (crm_private.is_staff()) with check (crm_private.is_staff());
create policy crm_quote_lines_staff_delete on public.crm_quote_lines for delete to authenticated
  using (crm_private.is_staff());

drop policy if exists crm_quote_versions_staff on public.crm_quote_versions;
drop policy if exists crm_quote_versions_customer_select on public.crm_quote_versions;
create policy crm_quote_versions_select on public.crm_quote_versions for select to authenticated
  using (
    crm_private.is_staff() or exists (
      select 1 from public.crm_quotes q
      where q.id = quote_id and q.customer_id = crm_private.customer_id() and q.status <> 'draft'
    )
  );
create policy crm_quote_versions_staff_insert on public.crm_quote_versions for insert to authenticated
  with check (crm_private.is_staff());

drop policy if exists crm_payment_schedules_staff on public.crm_payment_schedules;
drop policy if exists crm_schedules_customer_select on public.crm_payment_schedules;
create policy crm_schedules_select on public.crm_payment_schedules for select to authenticated
  using (crm_private.is_staff() or customer_id = crm_private.customer_id());
create policy crm_schedules_staff_insert on public.crm_payment_schedules for insert to authenticated
  with check (crm_private.is_staff());
create policy crm_schedules_staff_update on public.crm_payment_schedules for update to authenticated
  using (crm_private.is_staff()) with check (crm_private.is_staff());
create policy crm_schedules_staff_delete on public.crm_payment_schedules for delete to authenticated
  using (crm_private.is_staff());

drop policy if exists crm_invoices_staff on public.crm_invoices;
drop policy if exists crm_invoices_customer_select on public.crm_invoices;
create policy crm_invoices_select on public.crm_invoices for select to authenticated
  using (crm_private.is_staff() or (customer_id = crm_private.customer_id() and status <> 'draft'));
create policy crm_invoices_staff_insert on public.crm_invoices for insert to authenticated
  with check (crm_private.is_staff());
create policy crm_invoices_staff_update on public.crm_invoices for update to authenticated
  using (crm_private.is_staff()) with check (crm_private.is_staff());
create policy crm_invoices_staff_delete on public.crm_invoices for delete to authenticated
  using (crm_private.is_staff());

drop policy if exists crm_service_requests_staff on public.crm_service_requests;
drop policy if exists crm_requests_customer_select on public.crm_service_requests;
drop policy if exists crm_requests_customer_insert on public.crm_service_requests;
create policy crm_requests_select on public.crm_service_requests for select to authenticated
  using (crm_private.is_staff() or customer_id = crm_private.customer_id());
create policy crm_requests_insert on public.crm_service_requests for insert to authenticated
  with check (
    crm_private.is_staff() or (
      customer_id = crm_private.customer_id()
      and status = 'open' and assigned_to is null and staff_response is null
    )
  );
create policy crm_requests_staff_update on public.crm_service_requests for update to authenticated
  using (crm_private.is_staff()) with check (crm_private.is_staff());
create policy crm_requests_staff_delete on public.crm_service_requests for delete to authenticated
  using (crm_private.is_staff());

drop policy if exists crm_notifications_staff on public.crm_notifications;
drop policy if exists crm_notifications_customer_select on public.crm_notifications;
drop policy if exists crm_notifications_customer_update on public.crm_notifications;
create policy crm_notifications_select on public.crm_notifications for select to authenticated
  using (crm_private.is_staff() or customer_id = crm_private.customer_id());
create policy crm_notifications_staff_insert on public.crm_notifications for insert to authenticated
  with check (crm_private.is_staff());
create policy crm_notifications_update_read on public.crm_notifications for update to authenticated
  using (customer_id = crm_private.customer_id())
  with check (customer_id = crm_private.customer_id());
create policy crm_notifications_staff_delete on public.crm_notifications for delete to authenticated
  using (crm_private.is_staff());
revoke update on public.crm_notifications from authenticated;
grant update(read_at) on public.crm_notifications to authenticated;

drop policy if exists crm_notification_preferences_staff on public.crm_notification_preferences;
drop policy if exists crm_notification_preferences_customer on public.crm_notification_preferences;
create policy crm_notification_preferences_access on public.crm_notification_preferences
  for all to authenticated
  using (crm_private.is_staff() or customer_id = crm_private.customer_id())
  with check (crm_private.is_staff() or customer_id = crm_private.customer_id());

create or replace function public.crm_set_transaction_status(
  p_transaction_id uuid,
  p_status text
)
returns public.crm_transactions
language sql
security invoker
set search_path = public, crm_private
as $$ select crm_private.set_transaction_status(p_transaction_id, p_status); $$;

revoke all on function public.crm_set_transaction_status(uuid,text) from public, anon;
grant execute on function public.crm_set_transaction_status(uuid,text) to authenticated;

create or replace function crm_private.reconcile_revolut(
  p_inbox_id uuid,
  p_action text,
  p_customer_id uuid default null,
  p_actor_user_id uuid default null,
  p_actor_staff_id uuid default null
)
returns public.crm_revolut_transactions
language plpgsql
security definer
set search_path = public, crm_private
as $$
declare
  inbox public.crm_revolut_transactions;
  tx_id uuid;
  audit_customer_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service réservé' using errcode = '42501';
  end if;
  select * into inbox from public.crm_revolut_transactions where id = p_inbox_id for update;
  if not found then raise exception 'Virement introuvable' using errcode = 'P0002'; end if;
  audit_customer_id := inbox.matched_customer_id;

  if p_action = 'ignore' then
    if inbox.status = 'matched' then raise exception 'Annulez le rapprochement avant d’ignorer' using errcode = '22023'; end if;
    update public.crm_revolut_transactions set status = 'ignored' where id = p_inbox_id returning * into inbox;
  elsif p_action = 'unmatch' then
    if inbox.status <> 'matched' then raise exception 'Virement non rapproché' using errcode = '22023'; end if;
    if inbox.matched_transaction_id is not null then
      update public.crm_transactions set status = 'void' where id = inbox.matched_transaction_id;
    end if;
    update public.crm_revolut_transactions
      set status = 'unmatched', matched_customer_id = null, matched_transaction_id = null
      where id = p_inbox_id returning * into inbox;
  elsif p_action = 'match' then
    if p_customer_id is null then raise exception 'Client requis' using errcode = '22023'; end if;
    if inbox.status = 'matched' then raise exception 'Déjà rapproché' using errcode = '22023'; end if;
    insert into public.crm_transactions
      (customer_id, direction, kind, amount, currency, occurred_on, label, source, external_id, status)
    values
      (p_customer_id,
       case when inbox.amount >= 0 then 'credit' else 'debit' end,
       case when inbox.amount >= 0 then 'transfer' else 'refund' end,
       abs(inbox.amount), inbox.currency, coalesce(inbox.booked_at::date, current_date),
       coalesce(nullif(inbox.reference, ''), 'Virement Revolut ' || coalesce(inbox.counterparty_name, '')),
       'revolut', inbox.revolut_transaction_id, 'posted')
    on conflict (source, external_id) where external_id is not null
    do update set
      customer_id = excluded.customer_id, direction = excluded.direction,
      kind = excluded.kind, amount = excluded.amount, currency = excluded.currency,
      occurred_on = excluded.occurred_on, label = excluded.label, status = 'posted',
      updated_at = now()
    returning id into tx_id;
    update public.crm_revolut_transactions
      set status = 'matched', matched_customer_id = p_customer_id, matched_transaction_id = tx_id
      where id = p_inbox_id returning * into inbox;
  else
    raise exception 'Action invalide' using errcode = '22023';
  end if;

  insert into public.crm_audit_events
    (actor_user_id, actor_staff_id, customer_id, entity_type, entity_id, action)
  values
    (p_actor_user_id, p_actor_staff_id, coalesce(p_customer_id, audit_customer_id),
     'revolut_transaction', inbox.id::text, p_action);
  return inbox;
end;
$$;

revoke all on function crm_private.reconcile_revolut(uuid,text,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function crm_private.reconcile_revolut(uuid,text,uuid,uuid,uuid) to service_role;

create or replace function public.crm_reconcile_revolut(
  p_inbox_id uuid,
  p_action text,
  p_customer_id uuid default null,
  p_actor_user_id uuid default null,
  p_actor_staff_id uuid default null
)
returns public.crm_revolut_transactions
language sql
security invoker
set search_path = public, crm_private
as $$
  select crm_private.reconcile_revolut(
    p_inbox_id, p_action, p_customer_id, p_actor_user_id, p_actor_staff_id
  );
$$;

revoke all on function public.crm_reconcile_revolut(uuid,text,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.crm_reconcile_revolut(uuid,text,uuid,uuid,uuid) to service_role;
