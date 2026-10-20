-- Phase 2 du Concierge : savoir, devis à approuver, qualité.
-- Fichier seulement. À appliquer avant d’armer un envoi. Aucun message.

create extension if not exists vector;

create table if not exists public.crm_concierge_knowledge (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('service', 'tone', 'conditions', 'faq', 'partner', 'formality', 'example')),
  title text not null,
  body text not null,
  locale text not null default 'fr',
  tags text[] not null default '{}',
  published boolean not null default true,
  embedding vector(64),
  search_text tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(body, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_concierge_knowledge_search_idx
  on public.crm_concierge_knowledge using gin (search_text);

create table if not exists public.crm_concierge_briefs (
  phone text primary key,
  customer_id uuid references public.crm_customers (id) on delete set null,
  destination text,
  start_on date,
  end_on date,
  travellers integer,
  budget text,
  wishes text,
  stage text not null default 'destination' check (
    stage in ('destination', 'dates', 'travellers', 'budget', 'wishes', 'ready')
  ),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_concierge_proposals (
  id uuid primary key default gen_random_uuid(),
  phone text,
  customer_id uuid references public.crm_customers (id) on delete set null,
  booking_id uuid references public.crm_bookings (id) on delete set null,
  kind text not null check (kind in ('quote', 'payment', 'transfer', 'restaurant', 'help')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'edited')),
  draft_body text not null,
  amounts jsonb not null default '{}'::jsonb,
  simulated boolean not null default false,
  decided_by uuid references public.crm_staff (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (customer_id is not null or phone is not null)
);

create index if not exists crm_concierge_proposals_pending_idx
  on public.crm_concierge_proposals (created_at desc)
  where status = 'pending';

create table if not exists public.crm_concierge_quality (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  flag text not null check (flag in ('escalation', 'injection', 'leak_attempt', 'thin', 'complaint')),
  note text not null default '',
  marked_at timestamptz not null default now()
);

-- Relances prévues. status planned : rien n’est envoyé par cette migration.
create table if not exists public.crm_concierge_followups (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  customer_id uuid references public.crm_customers (id) on delete set null,
  kind text not null check (kind in ('silence_session', 'silence_template', 'predeparture', 'checkin', 'feedback')),
  channel text not null check (channel in ('session', 'template')),
  template_key text,
  draft_body text not null,
  due_at timestamptz not null,
  status text not null default 'planned' check (status in ('planned', 'skipped')),
  created_at timestamptz not null default now(),
  unique (phone, kind)
);

create index if not exists crm_concierge_followups_planned_idx
  on public.crm_concierge_followups (due_at)
  where status = 'planned';

alter table public.crm_concierge_knowledge enable row level security;
alter table public.crm_concierge_briefs enable row level security;
alter table public.crm_concierge_proposals enable row level security;
alter table public.crm_concierge_quality enable row level security;
alter table public.crm_concierge_followups enable row level security;

drop policy if exists crm_concierge_knowledge_staff on public.crm_concierge_knowledge;
create policy crm_concierge_knowledge_staff on public.crm_concierge_knowledge
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_concierge_briefs_staff on public.crm_concierge_briefs;
create policy crm_concierge_briefs_staff on public.crm_concierge_briefs
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_concierge_proposals_staff on public.crm_concierge_proposals;
create policy crm_concierge_proposals_staff on public.crm_concierge_proposals
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_concierge_quality_staff on public.crm_concierge_quality;
create policy crm_concierge_quality_staff on public.crm_concierge_quality
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_concierge_followups_staff on public.crm_concierge_followups;
create policy crm_concierge_followups_staff on public.crm_concierge_followups
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

-- Classement cosine. Le webhook classe aussi en mémoire si la fonction n’est pas encore là.
create or replace function public.crm_concierge_match(query vector(64), match_count integer default 4)
returns table (id uuid, kind text, title text, body text, score float)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select k.id, k.kind, k.title, k.body, (1 - (k.embedding <=> query))::float as score
  from public.crm_concierge_knowledge k
  where k.published and k.embedding is not null and k.kind <> 'example'
  order by k.embedding <=> query
  limit greatest(1, least(coalesce(match_count, 4), 8));
$$;

revoke all on function public.crm_concierge_match(vector, integer) from public;
grant execute on function public.crm_concierge_match(vector, integer) to authenticated, service_role;

grant select, insert, update, delete on public.crm_concierge_knowledge to authenticated;
grant select, insert, update, delete on public.crm_concierge_briefs to authenticated;
grant select, insert, update, delete on public.crm_concierge_proposals to authenticated;
grant select, insert, update, delete on public.crm_concierge_quality to authenticated;
grant select, insert, update, delete on public.crm_concierge_followups to authenticated;
grant all on public.crm_concierge_knowledge to service_role;
grant all on public.crm_concierge_briefs to service_role;
grant all on public.crm_concierge_proposals to service_role;
grant all on public.crm_concierge_quality to service_role;
grant all on public.crm_concierge_followups to service_role;
