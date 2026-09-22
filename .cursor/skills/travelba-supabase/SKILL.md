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
| `20260918043000_carnet_visibility_kinds.sql` | kinds `rail/car/cruise`, `visible_to_client`, RLS published-only |
| `20260922100000_company_role_billing.sql` | `company_role` admin|member, `billing_parent_id`, `billing_customer_id`, RLS member trip debits |
| `20260922101000_billing_parent_read.sql` | member peut lire la fiche admin société (payeur) |
| `20260922120000_include_in_ledger.sql` | `include_in_ledger` séjour / carte (grand livre optionnel) |
| `20260922121500_fix_customer_parent_rls.sql` | RLS parent société sans récursion `crm_customers` |
| `20260922140000_booking_total_from_items.sql` | backfill `total_amount` = somme des prix vendus cartes si séjour à 0 |
| `20260922180000_shared_billing_any_traveler.sql` | RLS : tout titulaire voit les débits de ses dossiers, même facturés ailleurs |

Toute évolution = **nouveau fichier** `supabase/migrations/YYYYMMDDHHMMSS_slug.sql` (idempotent : `if not exists`, `drop policy if exists`). Appliquer via MCP `apply_migration` ou SQL Editor. Ne pas éditer une migration déjà poussée en prod.

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

Kinds items : `flight|hotel|transfer|activity|rail|car|cruise|insurance|fee`.
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
