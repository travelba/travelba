-- Accès agence : rôles manager, comptable, lecture en plus d’admin, agent et partner.
-- Les comptes existants restent actifs. Les dossiers sans responsable vont au propriétaire
-- (benjamin@travelba.fr, sinon le plus ancien administrateur). Rien n’est détruit.
-- Le journal est append-only. Les politiques restrictives s’ajoutent aux politiques déjà ouvertes :
-- un client ou un partenaire (agency_pass) n’est pas fermé par le périmètre agence.

alter table public.crm_staff add column if not exists active boolean not null default true;
alter table public.crm_staff add column if not exists email text;

update public.crm_staff s
set email = u.email
from auth.users u
where s.auth_user_id = u.id
  and (s.email is null or btrim(s.email) = '');

alter table public.crm_staff drop constraint if exists crm_staff_role_check;
alter table public.crm_staff
  add constraint crm_staff_role_check
  check (role in ('admin', 'manager', 'agent', 'comptable', 'lecture', 'partner'));

create or replace function crm_private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.crm_staff s
    where s.auth_user_id = auth.uid()
      and s.role in ('admin', 'manager', 'agent', 'comptable', 'lecture')
      and s.active is true
  );
$$;

alter table public.crm_bookings
  add column if not exists owner_staff_id uuid references public.crm_staff (id) on delete set null;

create index if not exists crm_bookings_owner_staff_idx
  on public.crm_bookings (owner_staff_id);

create table if not exists public.crm_booking_assignees (
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  staff_id uuid not null references public.crm_staff (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (booking_id, staff_id)
);

create table if not exists public.crm_role_permissions (
  role text not null,
  permission text not null,
  allowed boolean not null,
  primary key (role, permission)
);

create table if not exists public.crm_agency_settings (
  id integer primary key check (id = 1),
  pliant_agent_ceiling_cents integer not null default 200000,
  payment_alert_cents integer not null default 500000,
  failed_login_alert_count integer not null default 5
);

insert into public.crm_agency_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.crm_agency_journal (
  seq bigint generated always as identity primary key,
  id uuid not null default gen_random_uuid() unique,
  occurred_at timestamptz not null default now(),
  staff_id uuid references public.crm_staff (id) on delete set null,
  action text not null check (action in (
    'view', 'create', 'update', 'delete', 'send', 'export', 'login', 'logout', 'login_failed', 'reveal'
  )),
  entity_type text not null check (entity_type in (
    'dossier', 'client', 'card', 'message', 'setting', 'user', 'finance', 'document', 'session'
  )),
  entity_id text,
  summary text not null default '',
  diff jsonb,
  ip text,
  user_agent text,
  path text,
  canonical text not null default '',
  prev_hash text,
  row_hash text not null
);

create table if not exists public.crm_agency_alerts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('passport_reveal', 'export', 'payment', 'failed_login', 'card_reveal')),
  summary text not null,
  staff_id uuid references public.crm_staff (id) on delete set null,
  entity_type text,
  entity_id text,
  read_at timestamptz
);

create table if not exists public.crm_staff_sessions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.crm_staff (id) on delete cascade,
  session_id text not null,
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (staff_id, session_id)
);

-- Défauts alignés sur lib/crm/agency-access.ts. L’admin a tout, même sans ligne.
create or replace function crm_private.agency_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select s.role
  from public.crm_staff s
  where s.auth_user_id = auth.uid()
    and s.active is true
  limit 1;
$$;

create or replace function crm_private.agency_staff_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.crm_staff s
  where s.auth_user_id = auth.uid()
    and s.active is true
  limit 1;
$$;

create or replace function crm_private.agency_pass()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select crm_private.agency_role() is null
    or crm_private.agency_role() = 'partner';
$$;

create or replace function crm_private.agency_allows(permission text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_role text;
  stored boolean;
begin
  current_role := crm_private.agency_role();
  if current_role is null or current_role = 'partner' then
    return false;
  end if;
  if current_role = 'admin' then
    return true;
  end if;
  select allowed into stored
  from public.crm_role_permissions
  where role = current_role
    and crm_role_permissions.permission = agency_allows.permission;
  if found then
    return stored;
  end if;
  if current_role = 'manager' then
    return agency_allows.permission in (
      'view_all_dossiers', 'view_assigned_dossiers', 'edit_dossiers', 'create_dossiers',
      'reassign_dossier', 'view_finances', 'view_margins', 'create_pliant_card',
      'message_client', 'passport_reveal', 'delete_archive', 'view_journal', 'view_inbox'
    );
  end if;
  if current_role = 'agent' then
    return agency_allows.permission in (
      'view_assigned_dossiers', 'edit_dossiers', 'create_dossiers', 'create_pliant_card',
      'message_client', 'passport_reveal', 'view_inbox'
    );
  end if;
  if current_role = 'comptable' then
    return agency_allows.permission in (
      'view_all_dossiers', 'view_assigned_dossiers', 'view_finances', 'edit_finances',
      'view_margins', 'pay_supplier', 'export_data', 'view_journal'
    );
  end if;
  if current_role = 'lecture' then
    return agency_allows.permission in ('view_all_dossiers', 'view_assigned_dossiers');
  end if;
  return false;
end;
$$;

create or replace function crm_private.can_read_booking(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    crm_private.agency_allows('view_all_dossiers')
    or (
      crm_private.agency_allows('view_assigned_dossiers')
      and exists (
        select 1
        from public.crm_bookings b
        where b.id = target
          and (
            b.owner_staff_id is null
            or b.owner_staff_id = crm_private.agency_staff_id()
            or exists (
              select 1
              from public.crm_booking_assignees a
              where a.booking_id = b.id
                and a.staff_id = crm_private.agency_staff_id()
            )
          )
      )
    );
$$;

with roles as (
  select unnest(array['admin', 'manager', 'agent', 'comptable', 'lecture']) as role
),
perms as (
  select unnest(array[
    'view_all_dossiers', 'view_assigned_dossiers', 'edit_dossiers', 'create_dossiers',
    'reassign_dossier', 'view_finances', 'edit_finances', 'view_margins',
    'create_pliant_card', 'pay_supplier', 'message_client', 'passport_reveal',
    'export_data', 'delete_archive', 'change_settings', 'manage_users',
    'view_journal', 'view_inbox'
  ]) as permission
),
granted as (
  select * from (values
    ('manager', 'view_all_dossiers'),
    ('manager', 'view_assigned_dossiers'),
    ('manager', 'edit_dossiers'),
    ('manager', 'create_dossiers'),
    ('manager', 'reassign_dossier'),
    ('manager', 'view_finances'),
    ('manager', 'view_margins'),
    ('manager', 'create_pliant_card'),
    ('manager', 'message_client'),
    ('manager', 'passport_reveal'),
    ('manager', 'delete_archive'),
    ('manager', 'view_journal'),
    ('manager', 'view_inbox'),
    ('agent', 'view_assigned_dossiers'),
    ('agent', 'edit_dossiers'),
    ('agent', 'create_dossiers'),
    ('agent', 'create_pliant_card'),
    ('agent', 'message_client'),
    ('agent', 'passport_reveal'),
    ('agent', 'view_inbox'),
    ('comptable', 'view_all_dossiers'),
    ('comptable', 'view_assigned_dossiers'),
    ('comptable', 'view_finances'),
    ('comptable', 'edit_finances'),
    ('comptable', 'view_margins'),
    ('comptable', 'pay_supplier'),
    ('comptable', 'export_data'),
    ('comptable', 'view_journal'),
    ('lecture', 'view_all_dossiers'),
    ('lecture', 'view_assigned_dossiers')
  ) as v(role, permission)
)
insert into public.crm_role_permissions (role, permission, allowed)
select r.role,
       p.permission,
       r.role = 'admin'
         or exists (
           select 1 from granted g
           where g.role = r.role and g.permission = p.permission
         )
from roles r
cross join perms p
on conflict (role, permission) do nothing;

-- Chaîne scellée en base. Le diff qui contient encore un PAN est remplacé avant le hash.
create or replace function crm_private.seal_agency_journal()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  prev text;
begin
  perform pg_advisory_xact_lock(84221024);
  select j.row_hash into prev
  from public.crm_agency_journal j
  order by j.seq desc
  limit 1;

  if new.summary ~ '[0-9]{13,19}' then
    new.summary := regexp_replace(new.summary, '[0-9]{13,19}', '••••', 'g');
  end if;
  if new.diff is not null and new.diff::text ~ '[0-9]{13,19}' then
    new.diff := '{"masked":true}'::jsonb;
  end if;

  new.canonical := new.action
    || '|' || new.entity_type
    || '|' || coalesce(new.entity_id, '')
    || '|' || new.summary
    || '|' || coalesce(new.diff::text, '');
  new.prev_hash := prev;
  new.row_hash := encode(
    extensions.digest(convert_to(coalesce(prev, '') || '|' || new.canonical, 'UTF8'), 'sha256'),
    'hex'
  );
  if new.occurred_at is null then
    new.occurred_at := now();
  end if;
  return new;
end;
$$;

create or replace function crm_private.reject_agency_journal_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'journal append-only';
end;
$$;

drop trigger if exists trg_seal_agency_journal on public.crm_agency_journal;
create trigger trg_seal_agency_journal
  before insert on public.crm_agency_journal
  for each row execute function crm_private.seal_agency_journal();

drop trigger if exists trg_reject_agency_journal_change on public.crm_agency_journal;
create trigger trg_reject_agency_journal_change
  before update or delete on public.crm_agency_journal
  for each row execute function crm_private.reject_agency_journal_change();

alter table public.crm_role_permissions enable row level security;
alter table public.crm_agency_settings enable row level security;
alter table public.crm_agency_journal enable row level security;
alter table public.crm_agency_alerts enable row level security;
alter table public.crm_staff_sessions enable row level security;
alter table public.crm_booking_assignees enable row level security;

drop policy if exists crm_role_permissions_read on public.crm_role_permissions;
create policy crm_role_permissions_read on public.crm_role_permissions
  for select to authenticated
  using (crm_private.agency_role() is not null and crm_private.agency_role() <> 'partner');

drop policy if exists crm_agency_settings_read on public.crm_agency_settings;
create policy crm_agency_settings_read on public.crm_agency_settings
  for select to authenticated
  using (crm_private.is_staff());

drop policy if exists crm_agency_journal_read on public.crm_agency_journal;
create policy crm_agency_journal_read on public.crm_agency_journal
  for select to authenticated
  using (
    crm_private.agency_allows('view_journal')
    or staff_id = crm_private.agency_staff_id()
    or (
      entity_type = 'dossier'
      and entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and crm_private.can_read_booking(entity_id::uuid)
    )
    or (
      entity_type = 'client'
      and entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and exists (
        select 1 from public.crm_bookings b
        where b.customer_id = crm_agency_journal.entity_id::uuid
          and crm_private.can_read_booking(b.id)
      )
    )
  );

drop policy if exists crm_agency_alerts_read on public.crm_agency_alerts;
create policy crm_agency_alerts_read on public.crm_agency_alerts
  for select to authenticated
  using (crm_private.agency_allows('view_journal'));

drop policy if exists crm_staff_sessions_own on public.crm_staff_sessions;
create policy crm_staff_sessions_own on public.crm_staff_sessions
  for select to authenticated
  using (staff_id = crm_private.agency_staff_id());

revoke all on public.crm_agency_journal from anon, public, authenticated;
grant select on public.crm_agency_journal to authenticated;

revoke all on public.crm_agency_alerts from anon, public, authenticated;
grant select on public.crm_agency_alerts to authenticated;

revoke all on public.crm_staff_sessions from anon, public, authenticated;
grant select on public.crm_staff_sessions to authenticated;

revoke all on public.crm_role_permissions from anon, public, authenticated;
grant select on public.crm_role_permissions to authenticated;

revoke all on public.crm_agency_settings from anon, public, authenticated;
grant select on public.crm_agency_settings to authenticated;

revoke all on function crm_private.agency_role() from public, anon;
revoke all on function crm_private.agency_staff_id() from public, anon;
revoke all on function crm_private.agency_pass() from public, anon;
revoke all on function crm_private.agency_allows(text) from public, anon;
revoke all on function crm_private.can_read_booking(uuid) from public, anon;
grant execute on function crm_private.agency_role() to authenticated;
grant execute on function crm_private.agency_staff_id() to authenticated;
grant execute on function crm_private.agency_pass() to authenticated;
grant execute on function crm_private.agency_allows(text) to authenticated;
grant execute on function crm_private.can_read_booking(uuid) to authenticated;

-- Périmètre des dossiers. as restrictive : ET avec les politiques staff déjà présentes.
drop policy if exists crm_bookings_agency_read on public.crm_bookings;
create policy crm_bookings_agency_read on public.crm_bookings
  as restrictive for select to authenticated
  using (crm_private.agency_pass() or crm_private.can_read_booking(id));

drop policy if exists crm_bookings_agency_insert on public.crm_bookings;
create policy crm_bookings_agency_insert on public.crm_bookings
  as restrictive for insert to authenticated
  with check (
    crm_private.agency_pass()
    or (
      crm_private.agency_allows('edit_dossiers')
      and crm_private.agency_allows('create_dossiers')
      and (
        crm_private.agency_allows('view_all_dossiers')
        or owner_staff_id is null
        or owner_staff_id = crm_private.agency_staff_id()
      )
    )
  );

drop policy if exists crm_bookings_agency_update on public.crm_bookings;
create policy crm_bookings_agency_update on public.crm_bookings
  as restrictive for update to authenticated
  using (
    crm_private.agency_pass()
    or (crm_private.agency_allows('edit_dossiers') and crm_private.can_read_booking(id))
  )
  with check (
    crm_private.agency_pass()
    or (
      crm_private.agency_allows('edit_dossiers')
      and (
        crm_private.agency_allows('view_all_dossiers')
        or owner_staff_id is null
        or owner_staff_id = crm_private.agency_staff_id()
        or crm_private.can_read_booking(id)
      )
    )
  );

drop policy if exists crm_bookings_agency_delete on public.crm_bookings;
create policy crm_bookings_agency_delete on public.crm_bookings
  as restrictive for delete to authenticated
  using (
    crm_private.agency_pass()
    or (crm_private.agency_allows('delete_archive') and crm_private.can_read_booking(id))
  );

do $$
declare
  child record;
  finance text[] := array[
    'crm_transactions',
    'crm_payment_methods',
    'crm_pliant_cards',
    'crm_pliant_transactions',
    'crm_trip_costs',
    'crm_trip_cost_events',
    'crm_revolut_transactions',
    'crm_stripe_transactions',
    'crm_agency_journal',
    'crm_agency_alerts'
  ];
begin
  for child in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'booking_id'
      and c.data_type = 'uuid'
      and t.table_type = 'BASE TABLE'
      and c.table_name like 'crm_%'
      and not (c.table_name = any (finance))
  loop
    execute format('drop policy if exists %I on public.%I', child.table_name || '_agency_read', child.table_name);
    execute format(
      'create policy %I on public.%I as restrictive for select to authenticated using (crm_private.agency_pass() or crm_private.can_read_booking(booking_id))',
      child.table_name || '_agency_read',
      child.table_name
    );
    execute format('drop policy if exists %I on public.%I', child.table_name || '_agency_insert', child.table_name);
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check (crm_private.agency_pass() or (crm_private.agency_allows(''edit_dossiers'') and crm_private.can_read_booking(booking_id)))',
      child.table_name || '_agency_insert',
      child.table_name
    );
    execute format('drop policy if exists %I on public.%I', child.table_name || '_agency_update', child.table_name);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using (crm_private.agency_pass() or (crm_private.agency_allows(''edit_dossiers'') and crm_private.can_read_booking(booking_id))) with check (crm_private.agency_pass() or (crm_private.agency_allows(''edit_dossiers'') and crm_private.can_read_booking(booking_id)))',
      child.table_name || '_agency_update',
      child.table_name
    );
    execute format('drop policy if exists %I on public.%I', child.table_name || '_agency_delete', child.table_name);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (crm_private.agency_pass() or (crm_private.agency_allows(''edit_dossiers'') and crm_private.can_read_booking(booking_id)))',
      child.table_name || '_agency_delete',
      child.table_name
    );
  end loop;
end $$;

do $$
declare
  finance text[] := array[
    'crm_transactions',
    'crm_payment_methods',
    'crm_pliant_cards',
    'crm_pliant_transactions',
    'crm_trip_costs',
    'crm_trip_cost_events',
    'crm_revolut_transactions',
    'crm_stripe_transactions'
  ];
  name text;
begin
  foreach name in array finance loop
    if to_regclass('public.' || name) is null then
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', name || '_agency_read', name);
    execute format(
      'create policy %I on public.%I as restrictive for select to authenticated using (crm_private.agency_pass() or crm_private.agency_allows(''view_finances''))',
      name || '_agency_read',
      name
    );
    execute format('drop policy if exists %I on public.%I', name || '_agency_insert', name);
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check (crm_private.agency_pass() or crm_private.agency_allows(''edit_finances'') or crm_private.agency_allows(''pay_supplier''))',
      name || '_agency_insert',
      name
    );
    execute format('drop policy if exists %I on public.%I', name || '_agency_update', name);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using (crm_private.agency_pass() or crm_private.agency_allows(''edit_finances'') or crm_private.agency_allows(''pay_supplier'')) with check (crm_private.agency_pass() or crm_private.agency_allows(''edit_finances'') or crm_private.agency_allows(''pay_supplier''))',
      name || '_agency_update',
      name
    );
    execute format('drop policy if exists %I on public.%I', name || '_agency_delete', name);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (crm_private.agency_pass() or crm_private.agency_allows(''edit_finances'') or crm_private.agency_allows(''delete_archive''))',
      name || '_agency_delete',
      name
    );
  end loop;
end $$;

do $$
begin
  if to_regclass('public.crm_customers') is not null then
    execute 'drop policy if exists crm_customers_agency_read on public.crm_customers';
    execute $policy$
      create policy crm_customers_agency_read on public.crm_customers
        as restrictive for select to authenticated
        using (
          crm_private.agency_pass()
          or crm_private.agency_allows('view_all_dossiers')
          or exists (
            select 1 from public.crm_bookings b
            where (b.customer_id = crm_customers.id or b.billing_customer_id = crm_customers.id)
              and crm_private.can_read_booking(b.id)
          )
        )
    $policy$;
    execute 'drop policy if exists crm_customers_agency_write on public.crm_customers';
    execute $policy$
      create policy crm_customers_agency_write on public.crm_customers
        as restrictive for update to authenticated
        using (crm_private.agency_pass() or crm_private.agency_allows('edit_dossiers'))
        with check (crm_private.agency_pass() or crm_private.agency_allows('edit_dossiers'))
    $policy$;
  end if;

  if to_regclass('public.crm_travel_documents') is not null then
    execute 'drop policy if exists crm_travel_documents_agency_read on public.crm_travel_documents';
    execute $policy$
      create policy crm_travel_documents_agency_read on public.crm_travel_documents
        as restrictive for select to authenticated
        using (
          crm_private.agency_pass()
          or (
            (
              crm_private.agency_allows('view_all_dossiers')
              or exists (
                select 1 from public.crm_bookings b
                where b.customer_id = crm_travel_documents.customer_id
                  and crm_private.can_read_booking(b.id)
              )
            )
            and (
              (
                doc_type in ('passport', 'id_card')
                and crm_private.agency_allows('passport_reveal')
              )
              or doc_type not in ('passport', 'id_card')
            )
          )
        )
    $policy$;
  end if;
end $$;

-- Propriétaire : seulement les dossiers encore sans agent. L’adresse existante passe administrateur.
do $$
declare
  owner uuid;
begin
  select s.id into owner
  from public.crm_staff s
  where lower(coalesce(s.email, '')) = 'benjamin@travelba.fr'
  order by s.created_at
  limit 1;
  if owner is null then
    select s.id into owner
    from public.crm_staff s
    where s.role = 'admin'
    order by s.created_at
    limit 1;
  end if;
  if owner is null then
    return;
  end if;
  update public.crm_bookings
  set owner_staff_id = owner
  where owner_staff_id is null;
  update public.crm_staff
  set role = 'admin'
  where id = owner
    and lower(coalesce(email, '')) = 'benjamin@travelba.fr'
    and role is distinct from 'admin';
end $$;

comment on table public.crm_agency_journal is
  'Journal d’agence, append-only. Pas de grant update ni delete pour authenticated.';
