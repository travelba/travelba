-- Rétention des journaux opérationnels. Rien ne part dans cette migration :
-- pg_cron appelle la fonction à 03:15 UTC, seulement après que ce fichier a été joué.
--
-- Durées (mesurées le 2026-11-03 : aucune ligne n’a encore l’âge, la première
-- nuit ne retire donc rien) :
--   crm_audit_events            12 mois, puis suppression
--   crm_email_ingest            6 mois, corps vidé, ligne gardée
--   crm_customer_activity       12 mois, sauf le suivi Hôtels
--   suivi Hôtels (mêmes gestes) 24 mois, puis suppression
--
-- La ligne d’e-mail reste : gmail_message_id est la clé d’idempotence
-- (ignoreDuplicates). La supprimer ferait revenir le mail dans la file.
-- Les statuts encore actionnables (received, parsed, matched, error) gardent
-- leur corps, quel que soit l’âge.
--
-- Jamais touchés : dossiers, factures, clients, paiements, grand livre,
-- offres et demandes de recherche hôtel (crm_hotel_search_offers,
-- crm_hotel_search_requests : une demande peut devenir une carte),
-- crm_sent_mail (reconnaître une réponse), journal chaîné crm_agency_journal,
-- lectures passeport et événements carte.

create or replace function public.crm_purge_operational_logs()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  audit_cut timestamptz := now() - interval '12 months';
  email_cut timestamptz := now() - interval '6 months';
  activity_cut timestamptz := now() - interval '12 months';
  hotel_cut timestamptz := now() - interval '24 months';
  -- Même liste que HOTEL_ACTIVITY_ACTIONS (lib/crm/hotel-activity.ts).
  hotel_actions text[] := array[
    'hotel_search',
    'hotel_suggest',
    'hotel_view',
    'hotel_room',
    'hotel_sort',
    'hotel_page',
    'hotel_filter',
    'hotel_request',
    'hotel_error'
  ];
  batch int := 2000;
  rounds int;
  n int;
  n_audit int := 0;
  n_email int := 0;
  n_activity int := 0;
  n_hotel int := 0;
begin
  -- Une nuit retire au plus 40 000 lignes par journal. Le surplus attend la suivante.
  -- 3 min : un plafond trop court annulerait toute la transaction, donc le rattrapage.
  perform set_config('statement_timeout', '3min', true);

  for rounds in 1..20 loop
    delete from public.crm_audit_events
    where id in (
      select id
      from public.crm_audit_events
      where created_at < audit_cut
      order by created_at
      limit batch
    );
    get diagnostics n = row_count;
    n_audit := n_audit + n;
    exit when n = 0;
  end loop;

  for rounds in 1..20 loop
    update public.crm_email_ingest
    set
      body_html = null,
      body_text = null,
      extract = null,
      field_quotes = '[]'::jsonb,
      attachments = '[]'::jsonb,
      candidates = '[]'::jsonb,
      warnings = '[]'::jsonb
    where id in (
      select id
      from public.crm_email_ingest
      where status in ('attached', 'refused', 'ignored', 'grouped')
        and coalesce(received_at, created_at) < email_cut
        and (
          body_html is not null
          or body_text is not null
          or extract is not null
          or field_quotes is distinct from '[]'::jsonb
          or attachments is distinct from '[]'::jsonb
          or candidates is distinct from '[]'::jsonb
          or warnings is distinct from '[]'::jsonb
        )
      order by coalesce(received_at, created_at)
      limit batch
    );
    get diagnostics n = row_count;
    n_email := n_email + n;
    exit when n = 0;
  end loop;

  for rounds in 1..20 loop
    delete from public.crm_customer_activity
    where id in (
      select id
      from public.crm_customer_activity
      where created_at < activity_cut
        and not (
          action = any (hotel_actions)
          or (
            action = 'view'
            and regexp_replace(split_part(coalesce(path, ''), '?', 1), '/+$', '') = '/mon-compte/hotels'
          )
        )
      order by created_at
      limit batch
    );
    get diagnostics n = row_count;
    n_activity := n_activity + n;
    exit when n = 0;
  end loop;

  for rounds in 1..20 loop
    delete from public.crm_customer_activity
    where id in (
      select id
      from public.crm_customer_activity
      where created_at < hotel_cut
        and (
          action = any (hotel_actions)
          or (
            action = 'view'
            and regexp_replace(split_part(coalesce(path, ''), '?', 1), '/+$', '') = '/mon-compte/hotels'
          )
        )
      order by created_at
      limit batch
    );
    get diagnostics n = row_count;
    n_hotel := n_hotel + n;
    exit when n = 0;
  end loop;

  return jsonb_build_object(
    'audit_supprimes', n_audit,
    'emails_allegés', n_email,
    'activite_supprimee', n_activity,
    'suivi_hotels_supprime', n_hotel,
    'coupe_audit', audit_cut,
    'coupe_email', email_cut,
    'coupe_activite', activity_cut,
    'coupe_hotels', hotel_cut
  );
end;
$$;

comment on function public.crm_purge_operational_logs() is
  'Purge nocturne : audit 12 mois, corps des e-mails terminés 6 mois (ligne gardée), activité 12 mois, suivi Hôtels 24 mois. Pas de donnée métier.';

revoke all on function public.crm_purge_operational_logs() from public, anon, authenticated;
grant execute on function public.crm_purge_operational_logs() to service_role;

-- pg_cron est préchargé en production mais l’extension n’était pas créée
-- au 2026-11-03. Supabase pose les objets dans le schéma cron et demande
-- schema = pg_catalog. Une instance sans le fichier d’extension (rejeu local)
-- garde la fonction et n’échoue pas. Une autre erreur (mauvais schéma) remonte.
do $$
declare
  existing bigint;
begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception
    when undefined_file then
      raise notice 'pg_cron absent de cette instance : fonction posée, cron non programmé.';
      return;
  end;

  select jobid into existing
  from cron.job
  where jobname = 'crm-log-retention';
  if existing is not null then
    perform cron.unschedule(existing);
  end if;

  perform cron.schedule(
    'crm-log-retention',
    '15 3 * * *',
    $cron$select public.crm_purge_operational_logs()$cron$
  );
end;
$$;
