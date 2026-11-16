-- Inscription autonome : origine de la fiche, téléphone vérifié, conditions.
-- L’accès Hôtels reste faux tant que le serveur ne le pose pas, en service role.
-- Pas de PAN. Le code SMS reste chez Twilio Verify.

alter table public.crm_customers
  add column if not exists account_origin text not null default 'invited',
  add column if not exists phone_verified_at timestamptz,
  add column if not exists signup_completed_at timestamptz,
  add column if not exists signup_terms_at timestamptz;

alter table public.crm_customers drop constraint if exists crm_customers_account_origin_check;
alter table public.crm_customers
  add constraint crm_customers_account_origin_check
  check (account_origin in ('invited', 'self_service'));

comment on column public.crm_customers.account_origin is
  'invited : fiche de l’agence. self_service : inscrit autonome, hôtels seulement.';
comment on column public.crm_customers.phone_verified_at is
  'Téléphone confirmé par SMS. Vide tant que le code n’est pas le bon.';
comment on column public.crm_customers.signup_terms_at is
  'Majorité et conditions acceptées.';
comment on column public.crm_customers.signup_completed_at is
  'Fin de l’inscription autonome. Les hôtels s’ouvrent à cet instant.';

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
  new.account_origin := old.account_origin;
  new.signup_completed_at := old.signup_completed_at;
  new.signup_terms_at := old.signup_terms_at;
  if new.phone is distinct from old.phone then
    new.phone_verified_at := null;
  else
    new.phone_verified_at := old.phone_verified_at;
  end if;
  return new;
end;
$$;

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
    or new.hotel_direct_live is distinct from old.hotel_direct_live
    or new.hotel_le_api_booking is distinct from old.hotel_le_api_booking
    or new.account_origin is distinct from old.account_origin
    or (
      new.phone_verified_at is distinct from old.phone_verified_at
      and not (new.phone is distinct from old.phone and new.phone_verified_at is null)
    )
    or new.signup_completed_at is distinct from old.signup_completed_at
    or new.signup_terms_at is distinct from old.signup_terms_at
  then
    raise exception 'Cette fiche ne se modifie pas ici.' using errcode = '42501';
  end if;
  return new;
end;
$$;

alter table public.crm_agency_alerts drop constraint if exists crm_agency_alerts_kind_check;
alter table public.crm_agency_alerts
  add constraint crm_agency_alerts_kind_check
  check (kind in (
    'passport_reveal',
    'card_reveal',
    'export',
    'payment',
    'refund',
    'failed_login',
    'role_change',
    'pliant',
    'signup'
  ));
