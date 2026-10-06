-- Vérification ESTA : une ligne par voyageur et par dossier.
-- Le numéro de passeport n’est pas recopié ici. Il reste dans crm_travel_documents.
-- L’assistant externe écrit le résultat avec la clé service (statut, validité, 3 derniers
-- caractères du passeport vu sur esta.cbp.dhs.gov). Jamais le numéro complet, jamais la MRZ.

create table if not exists public.crm_esta_checks (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  traveler_id uuid not null references public.crm_booking_travelers (id) on delete cascade,
  travel_document_id uuid references public.crm_travel_documents (id) on delete set null,
  status text not null default 'a_verifier',
  application_number text,
  valid_until date,
  esta_passport_last3 text,
  checked_at timestamptz,
  source text,
  note text,
  dispatch_key text,
  dispatch_attempt_at timestamptz,
  dispatched_at timestamptz,
  client_message_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, traveler_id)
);

alter table public.crm_esta_checks drop constraint if exists crm_esta_checks_status_check;
alter table public.crm_esta_checks
  add constraint crm_esta_checks_status_check
  check (status in (
    'a_verifier', 'approuve', 'inacheve', 'introuvable', 'refuse', 'en_attente', 'non_concerne', 'erreur'
  ));

alter table public.crm_esta_checks drop constraint if exists crm_esta_checks_last3_check;
alter table public.crm_esta_checks
  add constraint crm_esta_checks_last3_check
  check (esta_passport_last3 is null or esta_passport_last3 ~ '^[A-Za-z0-9]{3}$');

alter table public.crm_esta_checks drop constraint if exists crm_esta_checks_note_check;
alter table public.crm_esta_checks
  add constraint crm_esta_checks_note_check
  check (note is null or char_length(note) <= 400);

alter table public.crm_esta_checks drop constraint if exists crm_esta_checks_application_check;
alter table public.crm_esta_checks
  add constraint crm_esta_checks_application_check
  check (application_number is null or char_length(application_number) <= 64);

alter table public.crm_esta_checks drop constraint if exists crm_esta_checks_source_check;
alter table public.crm_esta_checks
  add constraint crm_esta_checks_source_check
  check (source is null or char_length(source) <= 80);

create index if not exists crm_esta_checks_booking_idx
  on public.crm_esta_checks (booking_id);

create table if not exists public.crm_esta_notices (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.crm_esta_checks (id) on delete cascade,
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  traveler_id uuid not null references public.crm_booking_travelers (id) on delete cascade,
  status text not null,
  kind text not null,
  result_key text not null,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  emailed_at timestamptz,
  unique (check_id, result_key)
);

alter table public.crm_esta_notices drop constraint if exists crm_esta_notices_kind_check;
alter table public.crm_esta_notices
  add constraint crm_esta_notices_kind_check
  check (kind in ('alerte', 'valable'));

create index if not exists crm_esta_notices_open_idx
  on public.crm_esta_notices (created_at desc)
  where seen_at is null;

alter table public.crm_esta_checks enable row level security;
alter table public.crm_esta_notices enable row level security;

revoke all on public.crm_esta_checks from anon, authenticated, public;
grant select on public.crm_esta_checks to authenticated;
grant all on public.crm_esta_checks to service_role;

revoke all on public.crm_esta_notices from anon, authenticated, public;
grant select on public.crm_esta_notices to authenticated;
grant all on public.crm_esta_notices to service_role;

drop policy if exists crm_esta_checks_staff on public.crm_esta_checks;
create policy crm_esta_checks_staff on public.crm_esta_checks
  for select to authenticated
  using (crm_private.is_staff());

drop policy if exists crm_esta_notices_staff on public.crm_esta_notices;
create policy crm_esta_notices_staff on public.crm_esta_notices
  for select to authenticated
  using (crm_private.is_staff());

comment on table public.crm_esta_checks is
  'ESTA par voyageur et dossier. Pas de numéro de passeport : seulement travel_document_id et les 3 derniers caractères vus sur le site officiel.';

comment on column public.crm_esta_checks.esta_passport_last3 is
  '3 derniers caractères du passeport auquel l’ESTA est lié. Jamais le numéro complet.';

-- Un seul POST webhook par changement. Nouvel essai après 15 minutes si l’appel n’a pas abouti.
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
      dispatch_attempt_at = now()
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

create or replace function public.crm_esta_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE'
     and new.checked_at is not null
     and new.status is distinct from 'a_verifier'
     and new.status is distinct from 'non_concerne'
     and old.checked_at is distinct from new.checked_at then
    new.client_message_sent_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_esta_before_write on public.crm_esta_checks;
create trigger crm_esta_before_write
  before insert or update on public.crm_esta_checks
  for each row execute function public.crm_esta_before_write();

create or replace function public.crm_esta_on_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ret date;
  pass_exp date;
  pass_last3 text;
  covers boolean;
  sig text;
  notice_kind text;
begin
  if new.checked_at is null or new.status in ('a_verifier', 'non_concerne') then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.status is not distinct from new.status
     and old.valid_until is not distinct from new.valid_until
     and old.esta_passport_last3 is not distinct from new.esta_passport_last3
     and old.checked_at is not distinct from new.checked_at then
    return new;
  end if;

  select coalesce(
    b.end_date,
    (
      select max((timezone('Europe/Paris', i.end_at))::date)
      from public.crm_booking_items i
      where i.booking_id = new.booking_id
        and i.end_at is not null
        and coalesce(i.lifecycle, 'active') not in ('cancelled', 'superseded')
    )
  )
  into ret
  from public.crm_bookings b
  where b.id = new.booking_id;

  pass_exp := null;
  pass_last3 := null;
  if new.travel_document_id is not null then
    select d.expires_on,
           case
             when length(regexp_replace(coalesce(d.number, ''), '[^A-Za-z0-9]', '', 'g')) >= 3
               then upper(right(regexp_replace(d.number, '[^A-Za-z0-9]', '', 'g'), 3))
             else null
           end
    into pass_exp, pass_last3
    from public.crm_travel_documents d
    where d.id = new.travel_document_id;
  end if;

  covers := new.status = 'approuve'
    and (new.valid_until is null or ret is null or new.valid_until >= ret)
    and (
      new.esta_passport_last3 is null
      or pass_last3 is null
      or upper(new.esta_passport_last3) = pass_last3
    )
    and (pass_exp is null or ret is null or pass_exp >= ret)
    and (pass_exp is null or new.valid_until is null or pass_exp >= new.valid_until);

  notice_kind := case when covers then 'valable' else 'alerte' end;
  sig := concat_ws(
    '|',
    new.status,
    coalesce(new.valid_until::text, ''),
    coalesce(upper(new.esta_passport_last3), ''),
    new.checked_at::text
  );

  insert into public.crm_esta_notices (check_id, booking_id, traveler_id, status, kind, result_key)
  values (new.id, new.booking_id, new.traveler_id, new.status, notice_kind, sig)
  on conflict (check_id, result_key) do nothing;

  return new;
end;
$$;

revoke all on function public.crm_esta_on_result() from public, anon, authenticated;
revoke all on function public.crm_esta_before_write() from public, anon, authenticated;

drop trigger if exists crm_esta_on_result on public.crm_esta_checks;
create trigger crm_esta_on_result
  after insert or update on public.crm_esta_checks
  for each row execute function public.crm_esta_on_result();

-- File du passage quotidien. Le numéro de passeport n’est lisible que par service_role.
drop view if exists public.esta_a_verifier;
create view public.esta_a_verifier
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

comment on view public.esta_a_verifier is
  'Vérifications ESTA à faire (départ sous 90 jours). Passeport lisible uniquement par service_role.';
