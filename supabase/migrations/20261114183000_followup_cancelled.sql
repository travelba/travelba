-- Élargit le statut des relances pour qu’une annulation humaine
-- ne soit pas reprise par le cron. À appliquer seulement avec l’accord du propriétaire.

alter table public.crm_concierge_followups
  drop constraint if exists crm_concierge_followups_status_check;

alter table public.crm_concierge_followups
  add constraint crm_concierge_followups_status_check
  check (status in ('planned', 'skipped', 'sent', 'cancelled'));
