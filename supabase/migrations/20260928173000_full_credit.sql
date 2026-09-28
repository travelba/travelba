-- Full credit : extras d’hôtel (restaurant, bar, spa) sur une carte agence.
-- Une demande par carte hôtel. Le plafond est 500 € × nuits. Pas de PAN.

create table if not exists public.crm_full_credits (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  booking_item_id uuid not null references public.crm_booking_items (id) on delete cascade,
  status text not null default 'demandee' check (status in ('demandee', 'envoyee', 'carte', 'cloturee')),
  nights integer not null check (nights > 0),
  ceiling_cents integer not null check (ceiling_cents = nights * 50000),
  hotel_email text,
  draft_subject text not null,
  draft_body text not null,
  pliant_card_id text,
  payment_url text,
  captured_cents integer,
  requested_at timestamptz not null default now(),
  sent_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (booking_item_id)
);

create index if not exists crm_full_credits_booking_idx
  on public.crm_full_credits (booking_id);

comment on table public.crm_full_credits is
  'Demande de full credit : extras dans l’hôtel. Le plafond n’est pas un débit. Seul captured_cents va au grand livre.';

-- Même règle que fullCreditArrival : minuit UTC = jour sans horaire, échéance à minuit Paris − 48 h.
create or replace function public.crm_full_credit_in_time(start_at timestamptz)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  arrival timestamptz;
  day date;
begin
  if start_at is null then
    return false;
  end if;
  if date_trunc('minute', start_at at time zone 'UTC')::time = time '00:00' then
    day := (start_at at time zone 'UTC')::date;
    arrival := day::timestamp at time zone 'Europe/Paris';
  else
    arrival := start_at;
  end if;
  return now() < arrival - interval '48 hours';
end;
$$;

create or replace function public.crm_full_credit_nights(start_at timestamptz, end_at timestamptz)
returns integer
language sql
stable
set search_path = public
as $$
  select case
    when start_at is null or end_at is null then null
    when ((end_at at time zone 'UTC')::date - (start_at at time zone 'UTC')::date) > 0
      then ((end_at at time zone 'UTC')::date - (start_at at time zone 'UTC')::date)::integer
    else null
  end
$$;

revoke all on function public.crm_full_credit_in_time(timestamptz) from public;
revoke all on function public.crm_full_credit_nights(timestamptz, timestamptz) from public;
grant execute on function public.crm_full_credit_in_time(timestamptz) to authenticated;
grant execute on function public.crm_full_credit_nights(timestamptz, timestamptz) to authenticated;

grant select, insert, update, delete on public.crm_full_credits to authenticated;

alter table public.crm_full_credits enable row level security;

drop policy if exists crm_full_credits_staff on public.crm_full_credits;
create policy crm_full_credits_staff on public.crm_full_credits
  for all using (crm_private.is_staff()) with check (crm_private.is_staff());

drop policy if exists crm_full_credits_client_select on public.crm_full_credits;
create policy crm_full_credits_client_select on public.crm_full_credits
  for select using (
    exists (
      select 1 from public.crm_bookings b
      where b.id = booking_id
        and b.customer_id = crm_private.customer_id()
        and b.visible_to_client
    )
  );

drop policy if exists crm_full_credits_client_insert on public.crm_full_credits;
create policy crm_full_credits_client_insert on public.crm_full_credits
  for insert with check (
    status = 'demandee'
    and pliant_card_id is null
    and payment_url is null
    and captured_cents is null
    and sent_at is null
    and closed_at is null
    and exists (
      select 1
      from public.crm_bookings b
      join public.crm_booking_items i on i.booking_id = b.id and i.id = booking_item_id
      where b.id = booking_id
        and b.customer_id = crm_private.customer_id()
        and b.visible_to_client
        and b.client_settles_stay = false
        and b.status in ('confirmed', 'travelling')
        and i.kind = 'hotel'
        and i.visible_to_client
        and nights = public.crm_full_credit_nights(i.start_at, i.end_at)
        and public.crm_full_credit_in_time(i.start_at)
    )
  );
