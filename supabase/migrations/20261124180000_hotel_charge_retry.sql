-- Reprise du paiement hôtel : délai entre deux essais, alerte une seule fois.
-- À jouer après 20261124120000_hotel_auto.sql. Pas de numéro de carte.

alter table public.crm_hotel_charge_jobs
  add column if not exists next_attempt_at timestamptz,
  add column if not exists alerted_at timestamptz;

create index if not exists crm_hotel_charge_jobs_due_idx
  on public.crm_hotel_charge_jobs (status, next_attempt_at);
