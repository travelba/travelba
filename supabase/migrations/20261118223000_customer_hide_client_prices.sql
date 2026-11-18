-- Masquer prix et transactions dans l’espace client. Défaut faux : rien ne change
-- pour les fiches déjà là. L’agence seule l’écrit (service role). Pas de grant
-- update pour authenticated : le client ne peut pas rouvrir ses montants.

alter table public.crm_customers
  add column if not exists hide_client_prices boolean not null default false;

comment on column public.crm_customers.hide_client_prices is
  'Espace client, carnet, aperçu et partages : aucun prix ni transaction. Défaut faux. L’agence seule l’écrit.';

create or replace function public.crm_customers_self_column_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;
  if crm_private.is_staff() then
    return new;
  end if;
  if new.email is distinct from old.email
    or new.auth_user_id is distinct from old.auth_user_id
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.company_role is distinct from old.company_role
    or new.billing_parent_id is distinct from old.billing_parent_id
    or new.iban is distinct from old.iban
    or new.on_hold is distinct from old.on_hold
    or new.is_vip is distinct from old.is_vip
    or new.whatsapp_opt_in_at is distinct from old.whatsapp_opt_in_at
    or new.whatsapp_opt_out_at is distinct from old.whatsapp_opt_out_at
    or new.spending_allowance is distinct from old.spending_allowance
    or new.hotel_booking_enabled is distinct from old.hotel_booking_enabled
    or new.hotel_demo is distinct from old.hotel_demo
    or new.hide_client_prices is distinct from old.hide_client_prices
  then
    raise exception 'Cette fiche ne se modifie pas ici.' using errcode = '42501';
  end if;
  return new;
end;
$$;

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
  new.hide_client_prices := old.hide_client_prices;
  return new;
end;
$$;
