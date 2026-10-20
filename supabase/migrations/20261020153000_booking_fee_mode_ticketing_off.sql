-- Un retrait des frais de billeterie pose fee_mode = ticketing_off.
-- percent et carte restent acceptés : la contrainte prod les autorisait déjà.

alter table public.crm_bookings
  drop constraint if exists crm_bookings_fee_mode_check;

alter table public.crm_bookings
  add constraint crm_bookings_fee_mode_check
  check (
    fee_mode is null
    or fee_mode = any (array['percent'::text, 'carte'::text, 'ticketing_off'::text])
  );
