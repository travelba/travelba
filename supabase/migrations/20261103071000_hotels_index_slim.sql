-- Allègement mesuré le 2026-11-03 sur fsmfozxgujskluxakeoq (base 484 Mo).
-- public.hotels : 2 985 lignes, 292 Mo dont 9 Mo de tas, 75 Mo d’index, 208 Mo de TOAST.
-- n_dead_tup = 0, n_tup_upd = 0, stats_reset null : ce n’est pas de la fragmentation.
-- VACUUM FULL ne rendrait pas le JSON vivant et verrouillerait le catalogue.
-- Il n’est pas lancé ici (VACUUM ne peut pas tourner dans une migration).
--
-- Le TOAST est le texte éditorial, pas un doublon (1 seul hôtel partage
-- nom + ville + pays). Colonnes les plus lourdes, taille stockée :
--   long_description_sections  55 Mo   (sections body_fr / body_en)
--   faq_content_kit            32 Mo
--   concierge_questions        17 Mo
--   signature_experiences      12 Mo
--   faq_content                10 Mo
--   google_reviews              8 Mo
--   points_of_interest          8 Mo
--   gallery_images              5 Mo
-- Déplacer ces colonnes ne réduit pas la base : le TOAST suit les données,
-- et le site public les lit par PostgREST. On ne les déplace pas et on ne
-- les vide pas.
--
-- Index GIN jsonb_path_ops jamais lus (idx_scan = 0) alors que hotels_pkey
-- a été lu 2,1 millions de fois et hotels_affiliations_gin 176 753 fois.
-- pg_stat_statements ne montre aucune recherche @> sur ces colonnes.
-- Les retirer rend environ 73 Mo tout de suite, sans perte de donnée.
-- On garde les index uniques, le GIN des affiliations (lu), et les index
-- partiels de relecture éditoriale (pending), même à 0 lecture : ils sont
-- le chemin d’un traitement, pas un index de contenu mort.

drop index if exists public.hotels_faq_content_kit_gin;
drop index if exists public.hotels_concierge_questions_gin;
drop index if exists public.hotels_faq_content_gin;
drop index if exists public.hotels_gallery_images_gin;
drop index if exists public.hotels_points_of_interest_gin;
drop index if exists public.hotels_amenities_gin;
drop index if exists public.hotels_policies_gin;
drop index if exists public.hotels_awards_gin;
drop index if exists public.hotels_transports_gin;
drop index if exists public.hotel_rooms_amenities_gin;

-- hotel_rooms_hotel_id_idx est couvert par hotel_rooms_display_order_idx
-- et hotel_rooms_hotel_slug_unique (préfixe hotel_id), qui ont les lectures.
drop index if exists public.hotel_rooms_hotel_id_idx;

-- crm_audit_events_ingest_idx (3,5 Mo, 0 lecture) : aucun select ne filtre
-- email_ingest_id. La ligne d’e-mail n’est pas supprimée, donc pas de cascade.
drop index if exists public.crm_audit_events_ingest_idx;

-- Filtres réellement émis (pg_stat_statements, même jour) :
--   is_published + city            ~97 000 appels, l’index (is_published, region, city)
--                                  ne sert pas une ville sans région
--   is_published + department      ~5 000 appels, pas d’index
--   name ILIKE                     ~34 000 appels, le btree ne sert pas un ILIKE
-- Les trois index ajoutés sont étroits (noms et villes, pas le JSON).

-- public.hotels et public.hotel_rooms vivent hors des migrations de ce dépôt.
-- Un rejeu local sans ces tables ignore les index du catalogue au lieu d’échouer.
do $$
begin
  if to_regclass('public.hotels') is null then
    return;
  end if;
  execute $i$create index if not exists hotels_published_city_idx
    on public.hotels (city)
    where is_published$i$;
  execute $i$create index if not exists hotels_published_department_idx
    on public.hotels (department)
    where is_published and department is not null$i$;
  execute $i$create index if not exists hotels_name_trgm
    on public.hotels
    using gin (name extensions.gin_trgm_ops)$i$;
end;
$$;

-- Fils hôtel : booking_id, request_id et message_id sont les filtres du bureau
-- et de la boîte. La table est petite aujourd’hui (le plan choisit un seq scan) ;
-- ces index restent valides quand le fil grossit. direction = out sert
-- l’index des envois (loadSentMailIndex).

create index if not exists crm_hotel_thread_messages_booking_idx
  on public.crm_hotel_thread_messages (booking_id, received_at);

create index if not exists crm_hotel_thread_messages_request_idx
  on public.crm_hotel_thread_messages (request_id, received_at)
  where request_id is not null;

create index if not exists crm_hotel_thread_messages_message_idx
  on public.crm_hotel_thread_messages (message_id)
  where message_id is not null;

create index if not exists crm_hotel_thread_messages_out_idx
  on public.crm_hotel_thread_messages (received_at desc)
  where direction = 'out';

-- Activité : le fil client lit created_at, recherches_hotels lit action.
-- L’index (customer_id, created_at) ne couvre ni l’un ni l’autre sans client.

create index if not exists crm_customer_activity_created_idx
  on public.crm_customer_activity (created_at desc);

create index if not exists crm_customer_activity_action_created_idx
  on public.crm_customer_activity (action, created_at desc);

-- La purge nocturne filtre l’audit par created_at. Les index existants
-- commencent par source, acteur ou entité.

create index if not exists crm_audit_events_created_idx
  on public.crm_audit_events (created_at);
