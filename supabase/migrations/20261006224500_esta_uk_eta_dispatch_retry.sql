-- Relance du webhook quand la clé change, et file qui reprend un clic « à vérifier ».
-- create or replace seulement. 20261006201000_uk_eta_checks.sql est déjà en production
-- (version enregistrée 20261006143711). 20261006153000_esta_checks.sql aussi.

create or replace function public.crm_claim_esta_dispatch(p_id uuid, p_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed uuid;
begin
  if p_id is null or p_key is null or length(btrim(p_key)) = 0 then
    return false;
  end if;
  update public.crm_esta_checks
  set dispatch_key = p_key,
      dispatch_attempt_at = now(),
      dispatched_at = case when dispatch_key is distinct from p_key then null else dispatched_at end
  where id = p_id
    and (
      dispatch_key is distinct from p_key
      or (
        dispatched_at is null
        and (dispatch_attempt_at is null or dispatch_attempt_at < now() - interval '15 minutes')
      )
    )
  returning id into claimed;
  return claimed is not null;
end;
$$;

revoke all on function public.crm_claim_esta_dispatch(uuid, text) from public, anon, authenticated;
grant execute on function public.crm_claim_esta_dispatch(uuid, text) to service_role;

create or replace function public.crm_claim_uk_eta_dispatch(p_id uuid, p_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed uuid;
begin
  if p_id is null or p_key is null or length(btrim(p_key)) = 0 then
    return false;
  end if;
  update public.crm_uk_eta_checks
  set dispatch_key = p_key,
      dispatch_attempt_at = now(),
      dispatched_at = case when dispatch_key is distinct from p_key then null else dispatched_at end
  where id = p_id
    and (
      dispatch_key is distinct from p_key
      or (
        dispatched_at is null
        and (dispatch_attempt_at is null or dispatch_attempt_at < now() - interval '15 minutes')
      )
    )
  returning id into claimed;
  return claimed is not null;
end;
$$;

revoke all on function public.crm_claim_uk_eta_dispatch(uuid, text) from public, anon, authenticated;
grant execute on function public.crm_claim_uk_eta_dispatch(uuid, text) to service_role;

create or replace view public.esta_a_verifier
with (security_invoker = true) as
select
  c.id,
  c.booking_id,
  c.traveler_id,
  b.reference,
  t.first_name as traveler_first_name,
  t.last_name as traveler_last_name,
  dep.departure_on,
  ret.return_on,
  c.status,
  c.checked_at,
  c.valid_until,
  c.application_number,
  c.esta_passport_last3,
  c.travel_document_id,
  d.number as passport_number,
  d.birth_date,
  d.nationality,
  d.issuing_country,
  d.issued_on,
  d.expires_on
from public.crm_esta_checks c
join public.crm_bookings b on b.id = c.booking_id
join public.crm_booking_travelers t on t.id = c.traveler_id
left join public.crm_travel_documents d on d.id = c.travel_document_id
cross join lateral (
  select coalesce(
    b.start_date,
    (
      select min((timezone('Europe/Paris', i.start_at))::date)
      from public.crm_booking_items i
      where i.booking_id = b.id
        and i.start_at is not null
        and coalesce(i.lifecycle, 'active') not in ('cancelled', 'superseded')
    )
  ) as departure_on
) dep
cross join lateral (
  select coalesce(
    b.end_date,
    (
      select max((timezone('Europe/Paris', i.end_at))::date)
      from public.crm_booking_items i
      where i.booking_id = b.id
        and i.end_at is not null
        and coalesce(i.lifecycle, 'active') not in ('cancelled', 'superseded')
    )
  ) as return_on
) ret
where c.status <> 'non_concerne'
  and b.archived_at is null
  and dep.departure_on is not null
  and dep.departure_on >= (timezone('Europe/Paris', now()))::date
  and dep.departure_on <= (timezone('Europe/Paris', now()))::date + 90
  and (
    c.checked_at is null
    or c.status = 'a_verifier'
    or (
      c.status <> 'approuve'
      and c.checked_at < now() - interval '7 days'
    )
    or (
      c.status = 'approuve'
      and c.valid_until is not null
      and ret.return_on is not null
      and c.valid_until < ret.return_on
    )
    or (
      c.esta_passport_last3 is not null
      and d.number is not null
      and length(regexp_replace(d.number, '[^A-Za-z0-9]', '', 'g')) >= 3
      and upper(c.esta_passport_last3) <> upper(right(regexp_replace(d.number, '[^A-Za-z0-9]', '', 'g'), 3))
    )
  );

revoke all on public.esta_a_verifier from anon, authenticated, public;
grant select on public.esta_a_verifier to service_role;

create or replace view public.uk_eta_a_verifier
with (security_invoker = true) as
select
  c.id,
  c.booking_id,
  c.traveler_id,
  b.reference,
  t.first_name as traveler_first_name,
  t.last_name as traveler_last_name,
  dep.departure_on,
  ret.return_on,
  c.status,
  c.checked_at,
  c.valid_until,
  c.application_number,
  c.passport_last3,
  c.travel_document_id,
  d.number as passport_number,
  d.birth_date,
  d.nationality,
  d.issuing_country,
  d.issued_on,
  d.expires_on
from public.crm_uk_eta_checks c
join public.crm_bookings b on b.id = c.booking_id
join public.crm_booking_travelers t on t.id = c.traveler_id
left join public.crm_travel_documents d on d.id = c.travel_document_id
cross join lateral (
  select coalesce(
    b.start_date,
    (
      select min((timezone('Europe/Paris', i.start_at))::date)
      from public.crm_booking_items i
      where i.booking_id = b.id
        and i.start_at is not null
        and coalesce(i.lifecycle, 'active') not in ('cancelled', 'superseded')
    )
  ) as departure_on
) dep
cross join lateral (
  select coalesce(
    b.end_date,
    (
      select max((timezone('Europe/Paris', i.end_at))::date)
      from public.crm_booking_items i
      where i.booking_id = b.id
        and i.end_at is not null
        and coalesce(i.lifecycle, 'active') not in ('cancelled', 'superseded')
    )
  ) as return_on
) ret
where c.status <> 'non_concerne'
  and b.archived_at is null
  and dep.departure_on is not null
  and dep.departure_on >= (timezone('Europe/Paris', now()))::date
  and dep.departure_on <= (timezone('Europe/Paris', now()))::date + 90
  and (
    c.checked_at is null
    or c.status = 'a_verifier'
    or (
      c.status <> 'approuve'
      and c.checked_at < now() - interval '7 days'
    )
    or (
      c.status = 'approuve'
      and c.valid_until is not null
      and ret.return_on is not null
      and c.valid_until < ret.return_on
    )
    or (
      c.passport_last3 is not null
      and d.number is not null
      and length(regexp_replace(d.number, '[^A-Za-z0-9]', '', 'g')) >= 3
      and upper(c.passport_last3) <> upper(right(regexp_replace(d.number, '[^A-Za-z0-9]', '', 'g'), 3))
    )
  );

revoke all on public.uk_eta_a_verifier from anon, authenticated, public;
grant select on public.uk_eta_a_verifier to service_role;
