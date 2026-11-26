-- Scénarios du concierge, pour le simulateur et la revue.
-- Aucune ligne insérée. Aucun dossier client. Rien n’est envoyé.
-- À jouer à la main. L’application répond sans ces tables : les tests lisent le fixture.

create table if not exists public.crm_concierge_scenarios (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  phase text not null check (phase in (
    'avant_depart',
    'aeroport',
    'vol',
    'arrivee',
    'hotel',
    'sejour',
    'retour',
    'ecriture',
    'refus'
  )),
  title text not null,
  locale text not null default 'fr',
  fixture jsonb not null,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_concierge_scenario_turns (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.crm_concierge_scenarios (id) on delete cascade,
  position integer not null check (position >= 1),
  client_text text not null,
  expect jsonb not null default '{}'::jsonb,
  unique (scenario_id, position)
);

create table if not exists public.crm_concierge_scenario_runs (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.crm_concierge_scenarios (id) on delete cascade,
  mode text not null check (mode in ('router', 'model')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean not null default false,
  summary text not null default ''
);

create index if not exists crm_concierge_scenario_runs_scenario_idx
  on public.crm_concierge_scenario_runs (scenario_id, started_at desc);

create table if not exists public.crm_concierge_scenario_scores (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.crm_concierge_scenario_runs (id) on delete cascade,
  position integer not null check (position >= 1),
  criterion text not null,
  ok boolean not null,
  detail text not null default '',
  check (char_length(detail) <= 240)
);

create index if not exists crm_concierge_scenario_scores_run_idx
  on public.crm_concierge_scenario_scores (run_id, position);

alter table public.crm_concierge_scenarios enable row level security;
alter table public.crm_concierge_scenario_turns enable row level security;
alter table public.crm_concierge_scenario_runs enable row level security;
alter table public.crm_concierge_scenario_scores enable row level security;

drop policy if exists crm_concierge_scenarios_staff on public.crm_concierge_scenarios;
create policy crm_concierge_scenarios_staff on public.crm_concierge_scenarios
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_concierge_scenario_turns_staff on public.crm_concierge_scenario_turns;
create policy crm_concierge_scenario_turns_staff on public.crm_concierge_scenario_turns
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_concierge_scenario_runs_staff on public.crm_concierge_scenario_runs;
create policy crm_concierge_scenario_runs_staff on public.crm_concierge_scenario_runs
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_concierge_scenario_scores_staff on public.crm_concierge_scenario_scores;
create policy crm_concierge_scenario_scores_staff on public.crm_concierge_scenario_scores
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

grant select, insert, update, delete on public.crm_concierge_scenarios to authenticated;
grant select, insert, update, delete on public.crm_concierge_scenario_turns to authenticated;
grant select, insert, update, delete on public.crm_concierge_scenario_runs to authenticated;
grant select, insert, update, delete on public.crm_concierge_scenario_scores to authenticated;
grant all on public.crm_concierge_scenarios to service_role;
grant all on public.crm_concierge_scenario_turns to service_role;
grant all on public.crm_concierge_scenario_runs to service_role;
grant all on public.crm_concierge_scenario_scores to service_role;
