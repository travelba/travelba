-- Tentative de facture MB3M : une préparation sans numéro ne bloque le clic suivant
-- que tant qu’elle est vraiment en cours. Un échec reste sur la ligne pour être repris.

alter table public.crm_mb3m_pieces
  add column if not exists attempt_status text;

alter table public.crm_mb3m_pieces
  drop constraint if exists crm_mb3m_pieces_attempt_status_check;

alter table public.crm_mb3m_pieces
  add constraint crm_mb3m_pieces_attempt_status_check
  check (attempt_status is null or attempt_status in ('preparing', 'failed'));

alter table public.crm_mb3m_pieces
  add column if not exists attempt_error text;

alter table public.crm_mb3m_pieces
  add column if not exists attempt_started_at timestamptz;

alter table public.crm_mb3m_pieces
  add column if not exists attempt_started_by text;
