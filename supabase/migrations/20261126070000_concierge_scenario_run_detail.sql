-- Détail d’un passage du simulateur : le lot, et le texte des tours déjà notés.
-- À jouer à la main, après 20261126004500_concierge_scenarios.sql.
-- Aucun dossier client. Rien n’est envoyé. L’écran reste vide tant que les tables manquent.

alter table public.crm_concierge_scenario_runs
  add column if not exists batch_id uuid,
  add column if not exists turns jsonb not null default '[]'::jsonb;

create index if not exists crm_concierge_scenario_runs_batch_idx
  on public.crm_concierge_scenario_runs (batch_id, started_at desc);
