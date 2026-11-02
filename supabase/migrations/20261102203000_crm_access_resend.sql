-- Renvoi des accès client par WhatsApp.
-- Le jeton en clair ne vit que dans le message. Ici, seulement son empreinte SHA-256.
-- 30 jours, usage unique, révocable. Un nouvel envoi révoque le précédent.
-- Additive : à appliquer avant le déploiement du code.

create table if not exists public.crm_access_resend_tokens (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by_staff_id uuid references public.crm_staff (id) on delete set null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.crm_access_resend_tokens is
  'Jetons de renvoi d’accès (/acces/…). Empreinte seulement, jamais le lien. Service role.';

create index if not exists crm_access_resend_tokens_customer_idx
  on public.crm_access_resend_tokens (customer_id, created_at desc);

alter table public.crm_access_resend_tokens enable row level security;

revoke all on public.crm_access_resend_tokens from anon, authenticated, public;
grant all on public.crm_access_resend_tokens to service_role;
