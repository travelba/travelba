---
name: travelba-supabase
description: >-
  Travelba Supabase: crm_* schema, RLS published-only, private crm-files
  bucket, Auth dashboard, migrations. Use when writing SQL, fixing RLS,
  storage, Auth settings, or applying schema to fsmfozxgujskluxakeoq.
---

# Travelba — Supabase

Projet unique : **`fsmfozxgujskluxakeoq`**. Clients via `@/lib/supabase/server` (cookies) et `createServiceClient()` (service role, `server-only`).

Avant d’écrire du SQL : lister les tables (`crm_*`), lire la **dernière** migration, ne pas recréer `crm_schema.sql`.

## Migrations (ordre)

| Fichier | Rôle |
|---------|------|
| `20260915093000_crm_schema.sql` | tables, RLS, vue encours, RPC référence |
| `20260915154500_crm_demo_client_aura.sql` | **Marie Dupont démo — ne pas jouer en prod / ne pas « reset »** |
| `20260916113000_customer_sex.sql` | sexe fiche |
| `20260917070307_travel_document_identity.sql` | champs identité docs |
| `20260917070936_customer_billing.sql` | tél 2, Flying Blue, facturation société |
| `20260917173300_travel_document_booking.sql` | pièce liée au voyage / traveler |
| `20260917184000_travel_document_passport_fields.sql` | lieu naissance, autorité, personal_number |
| `20260923143000_spouse_usage_name.sql` | `usage_name` (nom d'épouse) client, accompagnateur, pièce |
| `20260918043000_carnet_visibility_kinds.sql` | kinds `rail/car/cruise`, `visible_to_client`, RLS published-only |
| `20260922100000_company_role_billing.sql` | `company_role` admin|member, `billing_parent_id`, `billing_customer_id`, RLS member trip debits |
| `20260922101000_billing_parent_read.sql` | member peut lire la fiche admin société (payeur) |
| `20260922120000_include_in_ledger.sql` | `include_in_ledger` séjour / carte (grand livre optionnel) |
| `20260922121500_fix_customer_parent_rls.sql` | RLS parent société sans récursion `crm_customers` |
| `20260922140000_booking_total_from_items.sql` | backfill `total_amount` = somme des prix vendus cartes si séjour à 0 |
| `20260922150000_item_booking_debits.sql` | plusieurs débits cartes par dossier (plus un unique stays-only) |
| `20260923180000_booking_item_kind_expense.sql` | kind `expense` — dépense libre, hors itinéraire |
| `20260925120000_billing_companies.sql` | `crm_billing_companies` + `billing_company_id` (attribution, encours inchangé) |
| `20260928140000_booking_agency_commission.sql` | `crm_bookings.agency_commission` (10 % du séjour, opt-in) |
| `20260930220000_booking_payer_kind.sql` | `crm_bookings.payer_kind` company \| personal |
| `20260930235000_transaction_payer_kind.sql` | `crm_transactions.payer_kind` — part du règlement, solde inchangé |
| `20260930233000_booking_fees_follow_stay.sql` | `fees_follow_stay` : frais sur la même facture, ou l’autre mention |
| `20260928150000_booking_reference_service_role.sql` | `crm_next_booking_reference` security definer (cron Gmail / service_role) |
| `20260930161000_pliant_token_claim.sql` | `crm_claim_integration_refresh` : un seul jeton Auth0 Pliant à la fois, service_role |
| `20261004153000_crm_booking_cards.sql` | `crm_booking_cards` : plusieurs cartes Pliant libres par dossier |
| `20261004170000_entry_links_expiry.sql` | liens courts : `expires_at`, `used_at`, `revoked_at`, `open_count`, `channel` ; méthode `desk` ; grant `crm_card_views` |
| `20261004171000_customer_column_grants.sql` | `crm_customers` : grants `update` par colonne pour `authenticated` ; RPC référence service_role seulement — **déployer le code avant** |
| `20261004172000_rate_limits.sql` | `crm_rate_limits` + `crm_rate_limit_hit` (fenêtre fixe), service_role |
| `20261004180000_indexes.sql` | index FK et colonnes filtrées (`customer_id`, `booking_id`, `(kind, start_at)`, `status`, téléphones) — à appliquer en prod après fusion |
| `20261004190000_pliant_customer_id.sql` | `crm_pliant_transactions.customer_id` (compte imputé par le rapprochement Pliant) |
| `20261005090000_desk_links.sql` | lien desk (`channel = desk`, `created_by_staff_id`) et `crm_customer_logins.staff_id` — remplace le code maître `ADMIN_CLIENT_CODE` ; additive, avant le déploiement |

Toute évolution = **nouveau fichier** `supabase/migrations/YYYYMMDDHHMMSS_slug.sql` (idempotent : `if not exists`, `drop policy if exists`). Appliquer via MCP `apply_migration` ou SQL Editor. Ne pas éditer une migration déjà poussée en prod.

**Horodatage unique.** `node scripts/check-migrations.mjs` (inclus dans `npm run check`) refuse un nom hors `YYYYMMDDHHMMSS_slug.sql` et deux fichiers de même version. Six paires historiques déjà appliquées sont tolérées dans sa liste blanche ; ne pas les renommer, ne pas en ajouter.

**Seeds dans `supabase/seed.sql`, jamais dans `migrations/`.** `20260915154500_crm_demo_client_aura.sql` est l’exception héritée (fiche démo, déjà en prod, commentaire d’avertissement en tête) : tout `db push` / `db reset` la rejouerait. Un jeu de données local va dans `supabase/seed.sql` ou `scripts/seed-demo.mjs`.

**Objets hors dépôt.** La prod porte des objets qu’aucune migration ne crée : `crm_private.has_staff_permission(text)`, `crm_private.next_booking_reference()`, tables `crm_mtrip_publications`, `crm_full_credits`, trigger `sync_booking_debit`. Avant de toucher une policy, un trigger ou une fonction, vérifier l’état réel (`select * from pg_trigger`, `pg_policies`, `pg_proc` via MCP `execute_sql`) et ramener l’objet dans une migration plutôt que de le modifier à la main.

Helper privé : schema `crm_private` (`is_staff()`, `customer_id()`). Ne pas exposer au Data API.

## Tables cœur

- `crm_staff` — `auth_user_id` unique, role `admin` \| `agent`
- `crm_customers` — email unique, `auth_user_id` nullable jusqu’à l’invite
- `crm_travel_companions` / `crm_travel_documents`
- `crm_bookings` + `crm_booking_items` + `crm_booking_documents` + `crm_booking_travelers`
- `crm_transactions` + vue `crm_customer_balances` (`security_invoker = true`)
- `crm_payment_methods` — ids Stripe seulement
- `crm_revolut_transactions` + `crm_integrations` — **revoke** `anon`/`authenticated`, `service_role` only
- `crm_booking_seq` + RPC `crm_next_booking_reference()`

Kinds items : `flight|hotel|transfer|activity|rail|car|cruise|insurance|fee|chauffeur|greeter|visa|expense`. `expense` = dépense libre (grand livre, hors itinéraire).
Si la contrainte `crm_booking_items_kind_check` n’a pas encore `rail/car/cruise`, les ajouter (carnet).

Visibilité carnet : `crm_bookings.visible_to_client` et `crm_booking_items.visible_to_client` (défaut **false** à la création). RLS client = `visible_to_client` **et** booking du customer. Quotes / brouillons invisibles.

## RLS — règles

- Toute table `public.crm_*` : RLS on.
- Staff : `for all using (crm_private.is_staff()) with check (...)`.
- Client : `select` sur **ses** lignes. Bookings/items/docs : **published-only**.
- Transactions client : `status = 'posted'`.
- UPDATE a besoin d’un SELECT policy (sinon 0 row silencieux).
- `user_metadata` **interdit** pour l’authz. Rôles dans `app_metadata.crm_role` **et** table `crm_staff` (source de vérité).
- Vue encours : déjà `security_invoker = true`. Toute nouvelle vue : pareil, ou hors `public`.
- Fonctions `security definer` : `search_path = public` (ou `crm_private`), grant ciblé, pas `public` execute large.
- **Jamais** `select` sur `crm_customers` dans une policy de `crm_customers` (récursion → liste clients vide). Helper `crm_private.billing_parent_id()`.
- `crm_customers` : `update` accordé **colonne par colonne** au rôle `authenticated` (`20261004171000_customer_column_grants.sql`). Toute future `add column` sur `crm_customers` qu’un client ou le staff doit modifier via RLS exige un `grant update (col) on public.crm_customers to authenticated;` explicite dans la même migration, sinon l’écriture échoue (`permission denied`). Les colonnes sensibles (`email`, `iban`, `company_role`, `billing_parent_id`, `on_hold`, `is_vip`, `whatsapp_opt_*`, `auth_user_id`, `stripe_customer_id`) ne s’écrivent qu’avec le service role après `requireStaff` / `requireCustomer`.

SQL : paramètres liés uniquement. Pas de concat d’email/id dans une string SQL.

## Storage

- Bucket **`crm-files`**, **privé**.
- Chemins : `customers/{id}/…`, `bookings/{id}/…` (cover `bookings/{id}/cover.webp`).
- Upload : `uploadCrmFile` (service role). Lecture navigateur : `GET /api/files?path=` → signed 600s.
- Policies storage : le navigateur ne lit **pas** le bucket directement. Ne pas passer le bucket en public « pour débugger ».
- Upsert fichier = INSERT + SELECT + UPDATE storage.

## Auth dashboard (prod + local)

Skill `travelba-go-live` pour l’allowlist. Rappel :

- Signup public OFF
- Timeouts session OFF
- Redirect `/auth/callback`

Premier staff : si `crm_staff` vide, `ensureStaff` insert. Ensuite : insérer explicitement les agents (ne pas compter sur le bootstrap).

## Seed

`scripts/seed-demo.mjs` + migration Aura = **dev only**. Prod : données réelles, staff conservé.
