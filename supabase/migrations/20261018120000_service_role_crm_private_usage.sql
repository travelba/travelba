-- service_role lit le CRM (MCP, cron) mais n'avait pas USAGE sur crm_private.
-- Les index omnibar appellent crm_private.fold_search, fonction SQL IMMUTABLE :
-- le plan l'inline et exige le schéma. Sans USAGE, PostgREST renvoie 42501
-- (permission denied for schema crm_private) et la lecture société / cartes échoue.
-- EXECUTE sur fold_search et fold_letters est déjà accordé. Pas d'anon, pas de public.

grant usage on schema crm_private to service_role;
