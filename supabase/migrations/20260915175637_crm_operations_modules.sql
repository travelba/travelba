-- Functional CRM modules: quotes, billing, operations and governance.
-- All customer-facing tables use ownership RLS; staff access is capability-based.

alter table public.crm_staff
  add column if not exists permissions jsonb not null default '{"bookings":true,"quotes":true,"finance":true,"operations":true,"suppliers":true,"mtrip":true}'::jsonb,
  add column if not exists active boolean not null default true;

alter table public.crm_staff
  alter column permissions set default '{"bookings":true,"quotes":true,"finance":true,"operations":true,"suppliers":true,"mtrip":true}'::jsonb;
update public.crm_staff
set permissions = '{"bookings":true,"quotes":true,"finance":true,"operations":true,"suppliers":true,"mtrip":true}'::jsonb
where permissions = '{}'::jsonb;

create or replace function crm_private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.crm_staff s
    where s.auth_user_id = auth.uid() and s.active
  );
$$;

create table if not exists public.crm_quotes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers(id) on delete cascade,
  booking_id uuid references public.crm_bookings(id) on delete set null,
  reference text not null unique,
  title text not null,
  status text not null default 'draft' check (status in ('draft','sent','accepted','declined','expired')),
  currency text not null default 'EUR',
  valid_until date,
  terms text,
  client_note text,
  version integer not null default 1 check (version > 0),
  sent_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  acceptance_name text,
  acceptance_ip_hash text,
  terms_accepted boolean not null default false,
  signature_data text,
  created_by uuid references public.crm_staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.crm_quotes(id) on delete cascade,
  kind text not null default 'service',
  title text not null,
  description text,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0,
  supplier_cost numeric(12,2),
  tax_rate numeric(6,3) not null default 0 check (tax_rate >= 0),
  optional boolean not null default false,
  selected boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_quote_versions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.crm_quotes(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  created_by uuid references public.crm_staff(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (quote_id, version)
);

create table if not exists public.crm_payment_schedules (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers(id) on delete cascade,
  booking_id uuid references public.crm_bookings(id) on delete cascade,
  quote_id uuid references public.crm_quotes(id) on delete set null,
  label text not null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'EUR',
  due_on date not null,
  status text not null default 'pending' check (status in ('pending','paid','overdue','cancelled','refunded')),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  paid_at timestamptz,
  stripe_payment_intent_id text,
  transaction_id uuid references public.crm_transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers(id) on delete cascade,
  booking_id uuid references public.crm_bookings(id) on delete set null,
  quote_id uuid references public.crm_quotes(id) on delete set null,
  number text not null unique,
  kind text not null default 'invoice' check (kind in ('invoice','receipt','credit_note','statement')),
  status text not null default 'issued' check (status in ('draft','issued','paid','void')),
  amount numeric(12,2) not null default 0,
  currency text not null default 'EUR',
  issued_on date not null default current_date,
  due_on date,
  paid_on date,
  storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_service_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers(id) on delete cascade,
  booking_id uuid references public.crm_bookings(id) on delete set null,
  category text not null check (category in ('change','cancellation','document','assistance','other')),
  subject text not null,
  message text not null,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','in_progress','waiting_customer','resolved','closed')),
  assigned_to uuid references public.crm_staff(id) on delete set null,
  staff_response text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers(id) on delete cascade,
  booking_id uuid references public.crm_bookings(id) on delete set null,
  kind text not null default 'agency',
  title text not null,
  message text not null,
  action_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_notification_preferences (
  customer_id uuid primary key references public.crm_customers(id) on delete cascade,
  email_travel boolean not null default true,
  email_payment boolean not null default true,
  email_documents boolean not null default true,
  whatsapp_operational boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.crm_bookings(id) on delete cascade,
  customer_id uuid references public.crm_customers(id) on delete cascade,
  assigned_to uuid references public.crm_staff(id) on delete set null,
  title text not null,
  description text,
  category text not null default 'other',
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'todo' check (status in ('todo','in_progress','done','cancelled')),
  due_at timestamptz,
  completed_at timestamptz,
  source_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_suppliers (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'other',
  name text not null,
  contact_name text,
  email text,
  phone text,
  website text,
  account_reference text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_mtrip_publications (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.crm_bookings(id) on delete cascade,
  guide_id uuid,
  mtrip_identifier text,
  state text not null default 'draft' check (state in ('draft','validating','published','failed')),
  mobile_app_url text,
  validation_errors jsonb not null default '[]'::jsonb,
  published_at timestamptz,
  published_by uuid references public.crm_staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id)
);

create table if not exists public.crm_agency_settings (
  key text primary key,
  label text not null,
  value jsonb not null default '{}'::jsonb,
  secret_configured boolean not null default false,
  updated_by uuid references public.crm_staff(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_staff_id uuid references public.crm_staff(id) on delete set null,
  customer_id uuid references public.crm_customers(id) on delete set null,
  entity_type text not null,
  entity_id text,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists crm_quotes_customer_idx on public.crm_quotes(customer_id, created_at desc);
create index if not exists crm_quotes_booking_idx on public.crm_quotes(booking_id);
create index if not exists crm_quote_lines_quote_idx on public.crm_quote_lines(quote_id, sort_order);
create index if not exists crm_schedules_customer_due_idx on public.crm_payment_schedules(customer_id, due_on);
create index if not exists crm_schedules_booking_idx on public.crm_payment_schedules(booking_id);
create index if not exists crm_invoices_customer_idx on public.crm_invoices(customer_id, issued_on desc);
create index if not exists crm_requests_customer_idx on public.crm_service_requests(customer_id, created_at desc);
create index if not exists crm_requests_staff_idx on public.crm_service_requests(status, priority, created_at);
create index if not exists crm_notifications_customer_idx on public.crm_notifications(customer_id, created_at desc);
create index if not exists crm_tasks_queue_idx on public.crm_tasks(status, due_at);
create index if not exists crm_tasks_booking_idx on public.crm_tasks(booking_id);
create index if not exists crm_audit_entity_idx on public.crm_audit_events(entity_type, entity_id, created_at desc);
create index if not exists crm_audit_actor_idx on public.crm_audit_events(actor_user_id, created_at desc);

do $$
declare
  t text;
begin
  foreach t in array array[
    'crm_quotes','crm_quote_lines','crm_payment_schedules','crm_invoices',
    'crm_service_requests','crm_notification_preferences','crm_tasks',
    'crm_suppliers','crm_mtrip_publications'
  ] loop
    execute format('drop trigger if exists trg_%s_updated on public.%I', t, t);
    execute format(
      'create trigger trg_%s_updated before update on public.%I for each row execute function public.crm_set_updated_at()',
      t, t
    );
  end loop;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'crm_quotes','crm_quote_lines','crm_quote_versions','crm_payment_schedules',
    'crm_invoices','crm_service_requests','crm_notifications',
    'crm_notification_preferences','crm_tasks','crm_suppliers',
    'crm_mtrip_publications','crm_agency_settings','crm_audit_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (crm_private.is_staff()) with check (crm_private.is_staff())',
      t || '_staff', t
    );
  end loop;
end $$;

grant usage, select on sequence public.crm_audit_events_id_seq to authenticated;

create policy crm_quotes_customer_select on public.crm_quotes
  for select to authenticated
  using (customer_id = crm_private.customer_id() and status <> 'draft');

create policy crm_quote_lines_customer_select on public.crm_quote_lines
  for select to authenticated
  using (exists (
    select 1 from public.crm_quotes q
    where q.id = quote_id
      and q.customer_id = crm_private.customer_id()
      and q.status <> 'draft'
  ));

create policy crm_quote_versions_customer_select on public.crm_quote_versions
  for select to authenticated
  using (exists (
    select 1 from public.crm_quotes q
    where q.id = quote_id
      and q.customer_id = crm_private.customer_id()
      and q.status <> 'draft'
  ));

create policy crm_schedules_customer_select on public.crm_payment_schedules
  for select to authenticated using (customer_id = crm_private.customer_id());

create policy crm_invoices_customer_select on public.crm_invoices
  for select to authenticated using (customer_id = crm_private.customer_id() and status <> 'draft');

create policy crm_requests_customer_select on public.crm_service_requests
  for select to authenticated using (customer_id = crm_private.customer_id());
create policy crm_requests_customer_insert on public.crm_service_requests
  for insert to authenticated with check (
    customer_id = crm_private.customer_id()
    and status = 'open'
    and assigned_to is null
    and staff_response is null
  );

create policy crm_notifications_customer_select on public.crm_notifications
  for select to authenticated using (customer_id = crm_private.customer_id());
create policy crm_notifications_customer_update on public.crm_notifications
  for update to authenticated
  using (customer_id = crm_private.customer_id())
  with check (customer_id = crm_private.customer_id());

create policy crm_notification_preferences_customer on public.crm_notification_preferences
  for all to authenticated
  using (customer_id = crm_private.customer_id())
  with check (customer_id = crm_private.customer_id());

-- Audit rows are immutable from the Data API. Staff can read; trusted RPCs insert.
revoke insert, update, delete on public.crm_audit_events from authenticated;

create or replace function crm_private.accept_quote(
  p_quote_id uuid,
  p_acceptance_name text,
  p_terms_accepted boolean,
  p_signature_data text default null,
  p_ip_hash text default null
)
returns public.crm_quotes
language plpgsql
security definer
set search_path = public, crm_private
as $$
declare
  q public.crm_quotes;
  new_booking_id uuid;
  quote_total numeric;
begin
  if not p_terms_accepted or nullif(trim(p_acceptance_name), '') is null then
    raise exception 'Nom et acceptation des CGV requis' using errcode = '22023';
  end if;

  select * into q from public.crm_quotes
  where id = p_quote_id
    and customer_id = crm_private.customer_id()
    and status = 'sent'
    and (valid_until is null or valid_until >= current_date)
  for update;
  if not found then
    raise exception 'Devis indisponible ou expiré' using errcode = 'P0002';
  end if;

  update public.crm_quotes set
    status = 'accepted',
    accepted_at = now(),
    accepted_by = auth.uid(),
    acceptance_name = trim(p_acceptance_name),
    acceptance_ip_hash = p_ip_hash,
    terms_accepted = true,
    signature_data = nullif(p_signature_data, ''),
    updated_at = now()
  where id = p_quote_id
  returning * into q;

  insert into public.crm_audit_events
    (actor_user_id, customer_id, entity_type, entity_id, action, metadata)
  values
    (auth.uid(), q.customer_id, 'quote', q.id::text, 'accepted',
     jsonb_build_object('version', q.version, 'terms_accepted', true));

  if q.booking_id is null then
    select coalesce(sum(quantity * unit_price * (1 + tax_rate / 100)), 0)
      into quote_total
    from public.crm_quote_lines
    where quote_id = q.id and (not optional or selected);

    insert into public.crm_bookings
      (customer_id, reference, title, status, currency, total_amount, notes_client)
    values
      (q.customer_id,
       'TBA-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
       q.title, 'confirmed', q.currency, quote_total, q.client_note)
    returning id into new_booking_id;

    insert into public.crm_booking_items
      (booking_id, kind, title, amount, sort_order, details)
    select new_booking_id,
      case when kind in ('flight','hotel','transfer','activity','insurance','fee') then kind else 'fee' end,
      title, quantity * unit_price, sort_order,
      jsonb_build_object(
        'quote_line_id', id, 'description', description,
        'quantity', quantity, 'unit_price', unit_price, 'tax_rate', tax_rate
      )
    from public.crm_quote_lines
    where quote_id = q.id and (not optional or selected)
    order by sort_order;

    if quote_total > 0 then
      insert into public.crm_payment_schedules
        (customer_id, booking_id, quote_id, label, amount, currency, due_on)
      values
        (q.customer_id, new_booking_id, q.id, 'Solde ' || q.reference,
         quote_total, q.currency, coalesce(q.valid_until, current_date + 14));
    end if;

    update public.crm_quotes set booking_id = new_booking_id where id = q.id
      returning * into q;
  end if;

  return q;
end;
$$;

revoke all on function crm_private.accept_quote(uuid,text,boolean,text,text) from public, anon;
grant execute on function crm_private.accept_quote(uuid,text,boolean,text,text) to authenticated;

create or replace function public.crm_accept_quote(
  p_quote_id uuid,
  p_acceptance_name text,
  p_terms_accepted boolean,
  p_signature_data text default null,
  p_ip_hash text default null
)
returns public.crm_quotes
language sql
security invoker
set search_path = public, crm_private
as $$
  select crm_private.accept_quote(
    p_quote_id, p_acceptance_name, p_terms_accepted, p_signature_data, p_ip_hash
  );
$$;

revoke all on function public.crm_accept_quote(uuid,text,boolean,text,text) from public, anon;
grant execute on function public.crm_accept_quote(uuid,text,boolean,text,text) to authenticated;

create or replace function crm_private.decline_quote(p_quote_id uuid)
returns public.crm_quotes
language plpgsql
security definer
set search_path = public, crm_private
as $$
declare
  q public.crm_quotes;
begin
  update public.crm_quotes set
    status = 'declined', declined_at = now(), updated_at = now()
  where id = p_quote_id
    and customer_id = crm_private.customer_id()
    and status = 'sent'
  returning * into q;
  if not found then
    raise exception 'Devis indisponible' using errcode = 'P0002';
  end if;
  insert into public.crm_audit_events
    (actor_user_id, customer_id, entity_type, entity_id, action)
  values (auth.uid(), q.customer_id, 'quote', q.id::text, 'declined');
  return q;
end;
$$;

revoke all on function crm_private.decline_quote(uuid) from public, anon;
grant execute on function crm_private.decline_quote(uuid) to authenticated;

create or replace function public.crm_decline_quote(p_quote_id uuid)
returns public.crm_quotes
language sql
security invoker
set search_path = public, crm_private
as $$ select crm_private.decline_quote(p_quote_id); $$;

revoke all on function public.crm_decline_quote(uuid) from public, anon;
grant execute on function public.crm_decline_quote(uuid) to authenticated;

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
  if not crm_private.is_staff() then
    raise exception 'Accès réservé au personnel' using errcode = '42501';
  end if;
  if p_status not in ('pending','posted','void') then
    raise exception 'Statut invalide' using errcode = '22023';
  end if;
  select id into staff_id from public.crm_staff where auth_user_id = auth.uid() and active limit 1;
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

revoke all on function crm_private.set_transaction_status(uuid,text) from public, anon;
grant execute on function crm_private.set_transaction_status(uuid,text) to authenticated;

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
  new_paid numeric;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service réservé' using errcode = '42501';
  end if;
  select * into schedule from public.crm_payment_schedules
    where id = p_schedule_id for update;
  if not found then
    raise exception 'Échéance introuvable' using errcode = 'P0002';
  end if;
  if p_amount <= 0 then
    raise exception 'Montant invalide' using errcode = '22023';
  end if;

  insert into public.crm_transactions
    (customer_id, booking_id, direction, kind, amount, currency, occurred_on,
     label, source, external_id, status)
  values
    (schedule.customer_id, schedule.booking_id, 'credit', 'card_payment',
     p_amount, schedule.currency, p_occurred_on, schedule.label, 'stripe',
     p_external_id, 'posted')
  on conflict (source, external_id) where external_id is not null
  do update set updated_at = excluded.updated_at
  returning id into tx_id;

  new_paid := least(schedule.amount, schedule.paid_amount + p_amount);
  update public.crm_payment_schedules set
    paid_amount = new_paid,
    status = case when new_paid >= amount then 'paid' else status end,
    paid_at = case when new_paid >= amount then now() else paid_at end,
    transaction_id = tx_id,
    updated_at = now()
  where id = p_schedule_id
  returning * into schedule;
  return schedule;
end;
$$;

revoke all on function crm_private.record_schedule_payment(uuid,text,numeric,date) from public, anon, authenticated;
grant execute on function crm_private.record_schedule_payment(uuid,text,numeric,date) to service_role;

create or replace function public.crm_record_schedule_payment(
  p_schedule_id uuid,
  p_external_id text,
  p_amount numeric,
  p_occurred_on date default current_date
)
returns public.crm_payment_schedules
language sql
security invoker
set search_path = public, crm_private
as $$
  select crm_private.record_schedule_payment(p_schedule_id, p_external_id, p_amount, p_occurred_on);
$$;

revoke all on function public.crm_record_schedule_payment(uuid,text,numeric,date) from public, anon, authenticated;
grant execute on function public.crm_record_schedule_payment(uuid,text,numeric,date) to service_role;

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
  if not crm_private.is_staff() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Accès réservé au personnel' using errcode = '42501';
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
    title = excluded.title, description = excluded.description,
    priority = excluded.priority, due_at = excluded.due_at;
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
    description = excluded.description, priority = excluded.priority, due_at = excluded.due_at;
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
    title = excluded.title, description = excluded.description, due_at = excluded.due_at;
  get diagnostics n = row_count;
  return affected + n;
end;
$$;

revoke all on function crm_private.refresh_operational_tasks() from public, anon;
grant execute on function crm_private.refresh_operational_tasks() to authenticated, service_role;

create or replace function public.crm_refresh_operational_tasks()
returns integer
language sql
security invoker
set search_path = public, crm_private
as $$ select crm_private.refresh_operational_tasks(); $$;

revoke all on function public.crm_refresh_operational_tasks() from public, anon;
grant execute on function public.crm_refresh_operational_tasks() to authenticated, service_role;

create or replace function crm_private.merge_customers(p_source_id uuid, p_target_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, crm_private
as $$
declare
  source_user uuid;
  target_user uuid;
begin
  if not crm_private.is_staff() then
    raise exception 'Accès réservé au personnel' using errcode = '42501';
  end if;
  if p_source_id = p_target_id then
    raise exception 'Les clients doivent être différents' using errcode = '22023';
  end if;
  select auth_user_id into source_user from public.crm_customers where id = p_source_id for update;
  if not found then raise exception 'Client source introuvable' using errcode = 'P0002'; end if;
  select auth_user_id into target_user from public.crm_customers where id = p_target_id for update;
  if not found then raise exception 'Client cible introuvable' using errcode = 'P0002'; end if;
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

  insert into public.crm_notification_preferences(customer_id, email_travel, email_payment, email_documents, whatsapp_operational)
  select p_target_id, email_travel, email_payment, email_documents, whatsapp_operational
  from public.crm_notification_preferences where customer_id = p_source_id
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

revoke all on function crm_private.merge_customers(uuid,uuid) from public, anon;
grant execute on function crm_private.merge_customers(uuid,uuid) to authenticated;

create or replace function public.crm_merge_customers(p_source_id uuid, p_target_id uuid)
returns uuid
language sql
security invoker
set search_path = public, crm_private
as $$ select crm_private.merge_customers(p_source_id, p_target_id); $$;

revoke all on function public.crm_merge_customers(uuid,uuid) from public, anon;
grant execute on function public.crm_merge_customers(uuid,uuid) to authenticated;
