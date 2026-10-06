-- Défaut chrono. Un glisser-déposer hors dates pose le drapeau.
-- Une fois : Milan · Paris · Rome (imports) repasse aux dates.
-- Les autres dossiers déjà hors dates sont marqués rangés, pour ne pas les rebouger.

alter table public.crm_bookings
  add column if not exists items_order_custom boolean not null default false;

create or replace function public.crm_step_chrono_key(kind text, start_at timestamptz)
returns text
language sql
stable
as $$
  select
    coalesce(to_char(start_at at time zone 'UTC', 'YYYY-MM-DD'), '9999-99-99')
    || 'T'
    || case
      when kind in ('flight', 'rail')
        then coalesce(to_char(start_at at time zone 'UTC', 'HH24:MI'), '00:00')
      when start_at is not null
        and to_char(start_at at time zone 'UTC', 'HH24:MI') <> '00:00'
        then to_char(start_at at time zone 'UTC', 'HH24:MI')
      else '23:59'
    end;
$$;

-- Ne pas réécrire updated_at : ce passage ne change que l’ordre d’affichage.
set local session_replication_role = replica;

with ordered as (
  select
    booking_id,
    array_agg(id order by coalesce(sort_order, 0), id) as stored,
    array_agg(
      id order by public.crm_step_chrono_key(kind, start_at), coalesce(sort_order, 0), id
    ) as chrono
  from public.crm_booking_items
  where kind is distinct from 'expense'
  group by booking_id
)
update public.crm_bookings as booking
set items_order_custom = true
from ordered
where booking.id = ordered.booking_id
  and ordered.stored is distinct from ordered.chrono
  and booking.reference is distinct from 'TB-2026-0049';

with ranked as (
  select
    item.id,
    row_number() over (
      order by
        public.crm_step_chrono_key(item.kind, item.start_at),
        coalesce(item.sort_order, 0),
        item.id
    ) - 1 as next_order
  from public.crm_booking_items as item
  join public.crm_bookings as booking on booking.id = item.booking_id
  where booking.reference = 'TB-2026-0049'
    and item.kind is distinct from 'expense'
)
update public.crm_booking_items as item
set sort_order = ranked.next_order
from ranked
where item.id = ranked.id
  and item.sort_order is distinct from ranked.next_order;

update public.crm_bookings
set items_order_custom = false
where reference = 'TB-2026-0049';

drop function public.crm_step_chrono_key(text, timestamptz);
