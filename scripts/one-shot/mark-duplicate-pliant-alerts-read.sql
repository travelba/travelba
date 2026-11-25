-- NOT APPLIED. Ce fichier n’est pas une migration.
-- Ne pas l’exécuter depuis l’application, ni le déposer dans supabase/migrations.
-- À lancer à la main, une fois, seulement si l’agence veut ranger le journal.
--
-- Le cron Little Emperors a réécrit la même alerte Pliant toutes les 30 minutes
-- (environ 12 000 lignes, une vingtaine de textes). On garde la plus ancienne
-- de chaque texte et on marque les doublons comme lus. Rien n’est supprimé.

with ranked as (
  select
    id,
    row_number() over (partition by summary order by created_at asc, id asc) as n
  from public.crm_agency_alerts
  where kind = 'pliant'
    and read_at is null
)
update public.crm_agency_alerts as alert
set read_at = now()
from ranked
where alert.id = ranked.id
  and ranked.n > 1;
