-- Partenaire Little Emperors : une ligne crm_staff, sans les lectures de l’agence.
-- is_staff() reste admin | agent. Le partenaire lit deux vues, sans candidats ni pièce brute.

alter table public.crm_staff drop constraint if exists crm_staff_role_check;
alter table public.crm_staff
  add constraint crm_staff_role_check check (role in ('admin', 'agent', 'partner'));

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
      and s.role in ('admin', 'agent')
  );
$$;

create or replace function crm_private.is_partner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.crm_staff s
    where s.auth_user_id = auth.uid()
      and s.role = 'partner'
  );
$$;

revoke all on function crm_private.is_partner() from public;
grant execute on function crm_private.is_partner() to authenticated;

-- Propriétaire de la vue : le filtre is_partner() s’applique, pas les policies staff.
create or replace view public.crm_le_bookings_partner
with (security_invoker = false) as
select
  id,
  le_booking_id,
  confirmation_number,
  state,
  hotel_id,
  hotel_name,
  address,
  city,
  country,
  website,
  check_in,
  check_out,
  currency,
  total_cost,
  is_cancellable,
  cancellation_deadline,
  guest_names,
  cancellation_policies,
  room_types,
  status,
  last_event,
  last_error,
  created_at,
  updated_at
from public.crm_le_bookings
where crm_private.is_partner();

create or replace view public.crm_le_sync_partner
with (security_invoker = false) as
select provider, last_status, last_error, last_ok_at, updated_at
from public.crm_le_sync
where crm_private.is_partner();

revoke all on public.crm_le_bookings_partner from anon, public;
revoke all on public.crm_le_sync_partner from anon, public;
grant select on public.crm_le_bookings_partner to authenticated;
grant select on public.crm_le_sync_partner to authenticated;

comment on view public.crm_le_bookings_partner is
  'Réservations Little Emperors pour le partenaire : pas de candidat client, pas de pièce brute.';
