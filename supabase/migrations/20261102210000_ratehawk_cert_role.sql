-- Rôle ratehawk_cert : relecteur Emerging Travel / Ratehawk.
-- Il ne rejoint pas les rôles d’agence des policies CRM (clients, dossiers, grand livre) : elles restent fermées.
-- Les lectures Ratehawk passent par le service role, après la garde de route /api/admin/ratehawk.
-- Idempotente. Aucun compte n’est créé ni modifié.
--
-- Attribution, une fois cette migration jouée (l’écran Équipe le fait aussi) :
--   update public.crm_staff set role = 'ratehawk_cert' where email = 'relecteur@exemple.invalid';
-- Le JWT app_metadata.crm_role est recopié à la prochaine ouverture de session.

do $$
declare
  existing record;
begin
  for existing in
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.crm_staff'::regclass
      and c.contype = 'c'
      and a.attname = 'role'
  loop
    execute format('alter table public.crm_staff drop constraint if exists %I', existing.conname);
  end loop;
end $$;

alter table public.crm_staff
  add constraint crm_staff_role_check
  check (role in ('admin', 'manager', 'agent', 'comptable', 'lecture', 'partner', 'ratehawk_cert'));

-- Hors agence, comme le partenaire MyLER : les politiques restrictives ne s’appliquent pas,
-- et les policies permissives is_staff() ne s’ouvrent pas.
create or replace function crm_private.agency_pass()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select crm_private.agency_role() is null
    or crm_private.agency_role() in ('partner', 'ratehawk_cert');
$$;

create or replace function crm_private.agency_allows(permission text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor_role text;
  stored boolean;
begin
  actor_role := crm_private.agency_role();
  if actor_role is null or actor_role in ('partner', 'ratehawk_cert') then
    return false;
  end if;
  if actor_role = 'admin' then
    return true;
  end if;
  select allowed into stored
  from public.crm_role_permissions
  where role = actor_role
    and crm_role_permissions.permission = agency_allows.permission;
  if found then
    return stored;
  end if;
  if actor_role = 'manager' then
    return agency_allows.permission in (
      'edit_dossiers', 'create_dossiers', 'reassign_dossier', 'view_finances', 'view_margins',
      'create_pliant_card', 'message_client', 'passport_reveal', 'delete_archive', 'view_journal', 'view_inbox'
    );
  end if;
  if actor_role = 'agent' then
    return agency_allows.permission in (
      'edit_dossiers', 'create_dossiers', 'view_finances', 'edit_finances', 'view_margins',
      'create_pliant_card', 'pay_supplier', 'message_client', 'passport_reveal', 'view_inbox'
    );
  end if;
  if actor_role = 'comptable' then
    return agency_allows.permission in (
      'view_finances', 'edit_finances', 'view_margins', 'pay_supplier', 'export_data', 'view_journal'
    );
  end if;
  return false;
end;
$$;

drop policy if exists crm_role_permissions_read on public.crm_role_permissions;
create policy crm_role_permissions_read on public.crm_role_permissions
  for select to authenticated
  using (
    crm_private.agency_role() is not null
    and crm_private.agency_role() not in ('partner', 'ratehawk_cert')
  );
