-- Demandes d'inscription, invitations nominatives, parrainage.
-- Additive. RLS : aucune lecture anon, aucune lecture client de la file.
-- Une personne sans fiche validée n'a pas de ligne crm_customers : /mon-compte reste fermé.
-- Les colonnes du 14/11 (account_origin, phone_verified_at, signup_terms_at, signup_completed_at)
-- existent déjà en production. On les garantit ici. signup_completed_at n'est pas posé :
-- ce tampon ouvrait les hôtels. account_origin reste « invited » : l'accès passe par l'invitation.
-- À jouer à la main. Ne pas appliquer depuis une preview.

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
  'invited : fiche ouverte par l’agence (invitation). self_service : réservé à l’inscription hôtels autonome, non utilisé par la file.';
comment on column public.crm_customers.signup_terms_at is
  'Conditions et confidentialité acceptées. Posé à la validation, en service role.';
comment on column public.crm_customers.phone_verified_at is
  'Téléphone confirmé par SMS. Vide si le flag SMS est éteint.';
comment on column public.crm_customers.signup_completed_at is
  'Non posé par la file d’inscription. Le laisser vide : il ouvrait l’accès Hôtels.';

create table if not exists public.crm_signup_requests (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'brouillon',
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  birth_date date not null,
  travel_preferences text,
  heard_about text not null,
  referral_raw text,
  referral_code text,
  terms_accepted_at timestamptz not null,
  privacy_accepted_at timestamptz not null,
  email_verified_at timestamptz,
  phone_verified_at timestamptz,
  email_token_hash text,
  email_token_expires_at timestamptz,
  sms_code_hash text,
  sms_code_expires_at timestamptz,
  sms_attempts integer not null default 0,
  view_token_hash text unique,
  invitation_id uuid,
  invited_by_staff boolean not null default false,
  customer_id uuid references public.crm_customers (id) on delete set null,
  link_mode text,
  refusal_reason text,
  refusal_notified boolean not null default false,
  complement_message text,
  complement_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_signup_requests_status_check
    check (status in ('brouillon', 'en_attente', 'a_completer', 'validee', 'refusee')),
  constraint crm_signup_requests_link_mode_check
    check (link_mode is null or link_mode in ('rattacher', 'creer'))
);

comment on table public.crm_signup_requests is
  'Demande d’inscription. Aucun accès client tant que le statut n’est pas validee, et la validation crée ou rattache une fiche puis réutilise l’invitation.';

create index if not exists crm_signup_requests_status_idx
  on public.crm_signup_requests (status, created_at desc);
create index if not exists crm_signup_requests_email_idx
  on public.crm_signup_requests (email);
create unique index if not exists crm_signup_requests_email_token_idx
  on public.crm_signup_requests (email_token_hash)
  where email_token_hash is not null;

create table if not exists public.crm_signup_invitations (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  first_name text not null,
  last_name text not null,
  phone text not null,
  email text,
  customer_id uuid references public.crm_customers (id) on delete set null,
  status text not null default 'envoyee',
  expires_at timestamptz not null,
  opened_at timestamptz,
  submitted_at timestamptz,
  created_by uuid,
  channel text not null default 'wa_me',
  sent_at timestamptz,
  provider_message_id text,
  created_at timestamptz not null default now(),
  constraint crm_signup_invitations_status_check
    check (status in ('envoyee', 'ouverte', 'demande_deposee', 'expiree')),
  constraint crm_signup_invitations_channel_check
    check (channel in ('whatsapp_cloud', 'wa_me'))
);

comment on table public.crm_signup_invitations is
  'Invitation nominative. Le jeton en clair n’est pas stocké, seulement son empreinte. Usage unique, date d’expiration.';

alter table public.crm_signup_requests
  drop constraint if exists crm_signup_requests_invitation_id_fkey;
alter table public.crm_signup_requests
  add constraint crm_signup_requests_invitation_id_fkey
  foreign key (invitation_id) references public.crm_signup_invitations (id) on delete set null;

create table if not exists public.crm_referral_codes (
  customer_id uuid primary key references public.crm_customers (id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

comment on table public.crm_referral_codes is
  'Code personnel d’un client validé. Visible dans Mon compte. Aucune récompense automatique.';

create table if not exists public.crm_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_customer_id uuid not null references public.crm_customers (id) on delete cascade,
  request_id uuid references public.crm_signup_requests (id) on delete set null,
  referred_customer_id uuid references public.crm_customers (id) on delete set null,
  code text not null,
  status text not null default 'en_attente',
  reward_note text,
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  constraint crm_referrals_status_check check (status in ('en_attente', 'valide'))
);

comment on table public.crm_referrals is
  'Lien parrain-filleul. La récompense est une note saisie par l’admin. Aucun mouvement d’argent.';

create index if not exists crm_referrals_referrer_idx
  on public.crm_referrals (referrer_customer_id, status);

create table if not exists public.crm_signup_settings (
  id integer primary key,
  auto_validate_invited boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint crm_signup_settings_singleton check (id = 1)
);

insert into public.crm_signup_settings (id, auto_validate_invited)
values (1, false)
on conflict (id) do nothing;

comment on table public.crm_signup_settings is
  'auto_validate_invited faux : une invitation admin reste dans la file. Vrai : sans fiche déjà existante, la demande invitée est validée.';

alter table public.crm_signup_requests enable row level security;
alter table public.crm_signup_invitations enable row level security;
alter table public.crm_referral_codes enable row level security;
alter table public.crm_referrals enable row level security;
alter table public.crm_signup_settings enable row level security;

revoke all on table public.crm_signup_requests from public, anon, authenticated;
revoke all on table public.crm_signup_invitations from public, anon, authenticated;
revoke all on table public.crm_referral_codes from public, anon, authenticated;
revoke all on table public.crm_referrals from public, anon, authenticated;
revoke all on table public.crm_signup_settings from public, anon, authenticated;

grant select on table public.crm_signup_requests to authenticated;
grant select on table public.crm_signup_invitations to authenticated;
grant select on table public.crm_referral_codes to authenticated;
grant select on table public.crm_referrals to authenticated;
grant select on table public.crm_signup_settings to authenticated;
grant all on table public.crm_signup_requests to service_role;
grant all on table public.crm_signup_invitations to service_role;
grant all on table public.crm_referral_codes to service_role;
grant all on table public.crm_referrals to service_role;
grant all on table public.crm_signup_settings to service_role;

drop policy if exists crm_signup_requests_staff on public.crm_signup_requests;
create policy crm_signup_requests_staff on public.crm_signup_requests
  for select to authenticated
  using (crm_private.is_staff());

drop policy if exists crm_signup_invitations_staff on public.crm_signup_invitations;
create policy crm_signup_invitations_staff on public.crm_signup_invitations
  for select to authenticated
  using (crm_private.is_staff());

drop policy if exists crm_referrals_staff on public.crm_referrals;
create policy crm_referrals_staff on public.crm_referrals
  for select to authenticated
  using (crm_private.is_staff());

drop policy if exists crm_signup_settings_staff on public.crm_signup_settings;
create policy crm_signup_settings_staff on public.crm_signup_settings
  for select to authenticated
  using (crm_private.is_staff());

drop policy if exists crm_referral_codes_self on public.crm_referral_codes;
create policy crm_referral_codes_self on public.crm_referral_codes
  for select to authenticated
  using (customer_id = crm_private.customer_id());

drop policy if exists crm_referral_codes_staff on public.crm_referral_codes;
create policy crm_referral_codes_staff on public.crm_referral_codes
  for select to authenticated
  using (crm_private.is_staff());

drop trigger if exists crm_signup_requests_updated on public.crm_signup_requests;
create trigger crm_signup_requests_updated
  before update on public.crm_signup_requests
  for each row execute function public.crm_set_updated_at();

-- La garde client reprend les colonnes déjà protégées, plus le tampon d’inscription.
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
  if new.phone is distinct from old.phone then
    new.phone_verified_at := null;
  else
    new.phone_verified_at := old.phone_verified_at;
  end if;
  return new;
end;
$$;

create or replace function public.crm_signup_customer_hits(p_email text, p_phone text)
returns table (
  id uuid,
  email text,
  phone text,
  first_name text,
  last_name text,
  auth_user_id uuid,
  birth_date date
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.email, c.phone, c.first_name, c.last_name, c.auth_user_id, c.birth_date
  from public.crm_customers c
  where (
      p_email <> ''
      and lower(coalesce(c.email, '')) = lower(p_email)
    )
    or (
      length(right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9)) = 9
      and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 9)
        = right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9)
    )
  limit 8;
$$;

comment on function public.crm_signup_customer_hits(text, text) is
  'Fiches dont l’e-mail ou les neuf derniers chiffres du téléphone correspondent. Service role. Aucun rattachement automatique.';

revoke all on function public.crm_signup_customer_hits(text, text) from public, anon, authenticated;
grant execute on function public.crm_signup_customer_hits(text, text) to service_role;

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
