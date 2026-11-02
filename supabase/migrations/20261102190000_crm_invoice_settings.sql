-- Réglage de la facture client : RIB de repli et délai d’échéance.
-- Le RIB Revolut du compte euros Main prime quand il est unique.
-- Le lien Stripe est propre au dossier. Rien n’est inventé ici.

create table if not exists public.crm_invoice_settings (
  id int primary key,
  iban text,
  bic text,
  account_holder text,
  due_days int,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint crm_invoice_settings_singleton check (id = 1),
  constraint crm_invoice_settings_due_days check (due_days is null or (due_days >= 0 and due_days <= 365))
);

insert into public.crm_invoice_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.crm_booking_pay_links (
  booking_id uuid primary key references public.crm_bookings (id) on delete cascade,
  stripe_pay_url text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table public.crm_invoice_settings enable row level security;
alter table public.crm_booking_pay_links enable row level security;

revoke all on public.crm_invoice_settings from anon, authenticated;
revoke all on public.crm_booking_pay_links from anon, authenticated;
grant all on public.crm_invoice_settings to service_role;
grant all on public.crm_booking_pay_links to service_role;

comment on table public.crm_invoice_settings is
  'RIB de repli et délai d’échéance de la facture client. Le compte Revolut Main prime.';
comment on table public.crm_booking_pay_links is
  'Lien de paiement Stripe déjà émis pour un dossier. Aucun lien n’est créé ici.';
