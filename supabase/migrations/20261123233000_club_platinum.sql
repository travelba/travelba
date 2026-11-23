-- Adhésion Platinum du Travel Club TBA. Un an, nominative, sans renouvellement automatique.
-- Posée à la validation d’une demande. L’admin la prolonge à la main.
-- À jouer après 20261123220000_travel_club_referrals.sql.

alter table public.crm_customers
  add column if not exists club_rank text,
  add column if not exists club_started_on date,
  add column if not exists club_ends_on date;

alter table public.crm_customers drop constraint if exists crm_customers_club_rank_check;
alter table public.crm_customers
  add constraint crm_customers_club_rank_check
  check (club_rank is null or club_rank = 'platinum');

comment on column public.crm_customers.club_rank is
  'platinum pour un membre validé du Travel Club TBA. Vide sinon.';
comment on column public.crm_customers.club_started_on is
  'Début de l’adhésion Platinum.';
comment on column public.crm_customers.club_ends_on is
  'Fin de l’adhésion, un an après le début. Le renouvellement est manuel.';

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
    or new.zero_fees is distinct from old.zero_fees
    or new.account_origin is distinct from old.account_origin
    or new.signup_completed_at is distinct from old.signup_completed_at
    or new.signup_terms_at is distinct from old.signup_terms_at
    or new.club_rank is distinct from old.club_rank
    or new.club_started_on is distinct from old.club_started_on
    or new.club_ends_on is distinct from old.club_ends_on
    or (
      new.phone_verified_at is distinct from old.phone_verified_at
      and not (new.phone is distinct from old.phone and new.phone_verified_at is null)
    )
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
  new.zero_fees := old.zero_fees;
  new.account_origin := old.account_origin;
  new.signup_completed_at := old.signup_completed_at;
  new.signup_terms_at := old.signup_terms_at;
  new.club_rank := old.club_rank;
  new.club_started_on := old.club_started_on;
  new.club_ends_on := old.club_ends_on;
  if new.phone is distinct from old.phone then
    new.phone_verified_at := null;
  else
    new.phone_verified_at := old.phone_verified_at;
  end if;
  return new;
end;
$$;
