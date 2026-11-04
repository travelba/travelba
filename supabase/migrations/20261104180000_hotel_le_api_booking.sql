-- Opt-in de la réservation hôtel par l’API. Faux pour tout le monde, y compris
-- les clients déjà en mode réel : ils restent sur l’e-mail à l’hôtel.

alter table public.crm_customers
  add column if not exists hotel_le_api_booking boolean not null default false;

comment on column public.crm_customers.hotel_le_api_booking is
  'Réservation hôtel par l’API, pour ce client seulement. Défaut faux. Ignoré sans le mode réel, et si hotel_demo.';

create or replace function crm_private.protect_customer_agency_flags()
returns trigger
language plpgsql
security definer
set search_path = public, crm_private
as $$
begin
  if auth.role() = 'service_role' or crm_private.is_staff() then
    return new;
  end if;
  new.on_hold := old.on_hold;
  new.is_vip := old.is_vip;
  new.spending_allowance := old.spending_allowance;
  new.hotel_booking_enabled := old.hotel_booking_enabled;
  new.hotel_demo := old.hotel_demo;
  new.hotel_direct_live := old.hotel_direct_live;
  new.hotel_le_api_booking := old.hotel_le_api_booking;
  return new;
end;
$$;
