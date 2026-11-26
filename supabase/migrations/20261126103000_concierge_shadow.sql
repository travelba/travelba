-- Ombre du concierge. La réponse est calculée, jamais envoyée.
-- Pas de passeport, pas de date de naissance, pas de MRZ.
-- À jouer à la main. L’application répond sans cette table.

create table if not exists public.crm_concierge_shadow (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid,
  message_id uuid,
  engine text not null default 'shadow',
  model text,
  reply text not null default '',
  handoff text,
  tools jsonb not null default '[]'::jsonb,
  request_summary text,
  latency_ms integer,
  tokens jsonb,
  blocked boolean not null default false,
  web_provider text,
  created_at timestamptz not null default now(),
  constraint crm_concierge_shadow_reply_len check (char_length(reply) <= 2000),
  constraint crm_concierge_shadow_summary_len check (request_summary is null or char_length(request_summary) <= 500)
);

comment on table public.crm_concierge_shadow is
  'Réponse calculée en ombre. Aucun envoi Twilio. Pas de passeport, pas de date de naissance, pas de MRZ.';

create index if not exists crm_concierge_shadow_customer_idx
  on public.crm_concierge_shadow (customer_id, created_at desc);

alter table public.crm_concierge_shadow enable row level security;

revoke all on public.crm_concierge_shadow from anon;
grant select on public.crm_concierge_shadow to authenticated;
grant all on public.crm_concierge_shadow to service_role;

drop policy if exists crm_concierge_shadow_staff on public.crm_concierge_shadow;
create policy crm_concierge_shadow_staff on public.crm_concierge_shadow
  for select to authenticated
  using (crm_private.is_staff());
