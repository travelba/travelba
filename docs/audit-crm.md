# Audit de finalisation — CRM Travelba

Date : 2026-09-24. Périmètre : parcours agent (`/admin`), parcours client (`/mon-compte`, `/connexion`, `/auth`), back-end (`lib/crm`, `app/api`), configuration et sécurité, en vue d'une ouverture en production.

## Méthode et limite importante

- **Analyse statique exhaustive** du code (routes, composants, boutons, endpoints, modules `lib/crm`, migrations, RLS) + **inspection lecture seule de la production** (`fsmfozxgujskluxakeoq`) + suite de tests unitaires.
- **QA interactive non réalisée** : le provisioning d'un projet Supabase de **dev** (choisi pour tester chaque bouton avec des données de démo) est **bloqué par une facturation en souffrance** sur l'organisation Supabase (« overdue invoices »). Sans ce projet — et sans identifiants staff/client de test — il est impossible de cliquer les parcours authentifiés sans risquer les données de production. Voir la section « Débloquer la QA interactive ».
- Chaque constat ci-dessous a été **vérifié dans le code** ; les faux positifs détectés en cours d'audit sont listés en fin de document par transparence.

## État de santé (points déjà solides)

- **RLS active sur toutes les tables `crm_*`** (vérifié en prod : aucune table `crm_%` sans RLS). Policies staff + self.
- **Bucket `crm-files` privé** (`public=false` en prod). Accès client uniquement via `GET /api/files` (URL signée 600 s).
- **Tests unitaires : 269/269 au vert** (`npm test`, 46 suites) ; couvrent ingest, carnet, ledger, Revolut match, money, passeport/MRZ, email-match, gmail-parse, files-access, cron-auth, launch-status.
- **Crons protégés** par `Authorization: Bearer CRON_SECRET` (fail-closed si le secret manque).
- **Intégrations en dégradation propre** : Stripe/Revolut/Gmail/Resend renvoient 503 / `skipped` / lien copiable au lieu de planter le reste du CRM.
- **`crm_revolut_transactions` et `crm_integrations`** refusés au rôle `authenticated` (service role only) — pas de fuite de tokens OAuth.

## P0 — Bloquants / configuration avant ouverture

Ce sont surtout des prérequis de configuration (pas des bugs de code), mais ils bloquent l'usage réel.

1. **Resend obligatoire en prod.** Sans `RESEND_API_KEY` + `CONTACT_FROM_EMAIL` vérifié, invitation, lien magique et réinitialisation **ne partent pas** ; les routes renvoient `{ ok: true }` (anti-énumération volontaire) — le client ne reçoit donc rien sans erreur visible. Réf. [app/api/auth/otp/route.ts](app/api/auth/otp/route.ts), [app/api/auth/reset/route.ts](app/api/auth/reset/route.ts), [lib/crm/invite.ts](lib/crm/invite.ts).
2. **`CRON_SECRET` obligatoire en prod.** Sinon Revolut sync + crons Gmail répondent 401 et ne tournent jamais. Réf. [lib/crm/cron-auth.ts](lib/crm/cron-auth.ts), [vercel.json](vercel.json).
3. **`SUPABASE_SERVICE_ROLE_KEY` obligatoire.** Throw à l'init service (webhooks, crons, signature fichiers, bootstrap staff). Réf. [lib/supabase/admin.ts](lib/supabase/admin.ts).
4. **Bootstrap du premier staff.** Si `crm_staff` est vide, le premier utilisateur authentifié devient admin. Réf. [lib/crm/auth.ts](lib/crm/auth.ts) `ensureStaff`. À sécuriser : garantir qu'un compte staff réel existe **et** inscriptions publiques Supabase **OFF** avant toute ouverture.
5. **Décision UI cartes Stripe.** L'UI cartes client est retirée (redirection facturation) mais les endpoints `setup-intent` / `payment-methods` restent exposés ; en prod les clés test sont rejetées et le webhook répond 503. Réf. [lib/crm/stripe.ts](lib/crm/stripe.ts). À trancher : garder fermé (503 assumé) ou fournir clés live + webhook.
6. **Ingest e-mail (déjà livré) — finaliser la config Google.** `GOOGLE_SA_JSON`, `GMAIL_IMPERSONATE`, `GMAIL_LABELS`, `GMAIL_PUBSUB_TOPIC`, `GMAIL_PUSH_TOKEN` + délégation domaine + topic Pub/Sub (bouton « Tester la connexion » dans `/admin/emails`).

## P1 — Incohérences et bugs (front + back)

1. **Suppression silencieuse d'une carte.** `removeItem` n'inspecte pas `res.ok` : un échec DELETE ressemble à un succès (contrairement à reorder/save qui vérifient). Réf. [components/admin/BookingItemsPanel.tsx](components/admin/BookingItemsPanel.tsx) l.180-188.
2. **Actions destructives sans confirmation**, incohérent avec `DeleteCustomerButton`/`DeleteBookingButton` (double clic) : retirer une carte, une dépense, un voyageur, un accompagnateur, une pièce d'identité, annuler un extra, refuser un virement Revolut / un e-mail, et surtout **décocher « Visible dans l'espace »** qui **dépublie le carnet client sans confirmation**. Réf. [components/admin/BookingEditor.tsx](components/admin/BookingEditor.tsx), [components/admin/BookingExpensesPanel.tsx](components/admin/BookingExpensesPanel.tsx), [components/admin/CustomerEditor.tsx](components/admin/CustomerEditor.tsx), [components/crm/PersonPassportCard.tsx](components/crm/PersonPassportCard.tsx), [components/crm/ExtrasPanel.tsx](components/crm/ExtrasPanel.tsx), [components/account/CompanionsManager.tsx](components/account/CompanionsManager.tsx), [components/account/DocumentsManager.tsx](components/account/DocumentsManager.tsx).
3. **PATCH accompagnateur sans retour d'erreur.** Échec réseau non signalé à l'agent. Réf. [components/admin/CustomerEditor.tsx](components/admin/CustomerEditor.tsx).
4. **Copy à corriger.** « Email agent » (anglicisme) sur [app/admin/login/page.tsx](app/admin/login/page.tsx) ; « Grand livre » (jargon comptable) côté client sur [app/mon-compte/transactions/page.tsx](app/mon-compte/transactions/page.tsx).
5. **Libellé vs action.** « + Nouvelle réservation » (accueil/nav) mène à la **liste** `/admin/reservations`, pas à une création directe ; le KPI « Pièces à échéance » mène à `/admin/clients` **sans filtre expirations**. Réf. [app/admin/page.tsx](app/admin/page.tsx), [components/admin/AdminNav.tsx](components/admin/AdminNav.tsx).
6. **`loading.tsx` manquants** : `/admin/emails` et `/admin/login` (héritent d'un skeleton générique ou rien). Mineur.
7. **Accessibilité.** `<select>` de filtre statut sans `aria-label`. Réf. [components/admin/BookingsTable.tsx](components/admin/BookingsTable.tsx) (le filtre de `ClientsTable` en a un — à harmoniser).
8. **Code mort.** Composant jamais importé [components/account/AccountSignOut.tsx](components/account/AccountSignOut.tsx).
9. **Diagnostic Gmail** affiche les noms de variables d'env en clair (acceptable côté staff, mais à considérer). Réf. [components/admin/GmailDiagnostic.tsx](components/admin/GmailDiagnostic.tsx).

## P2 — Améliorations

1. **Tests d'intégration manquants** pour les modules critiques non couverts : `revolut.ts` (OAuth/sync/webhook), `gmail.ts`, `email-ingest.ts`, `ingest-booking.ts`, `auth.ts` (bootstrap), `invite.ts`.
2. **Renommer les tokens legacy `--aura-*` / `.aura-card`** : les valeurs sont correctes (`--aura-blue = #0b192c`, identique à `--admin-navy` Sovereign Horizon), mais le nommage contredit la règle « pas Aura » et prête à confusion. Réf. [app/globals.css](app/globals.css) + usages (`CarnetItinerary`, `ExtrasPanel`, `ServiceOfferCard`, page carnet, connexion). Aucun impact visuel.
3. **Composant `ConfirmButton` réutilisable** pour unifier les confirmations (voir P1-2).
4. **Policies storage `crm-files`** (défense en profondeur) — l'accès est déjà verrouillé via `/api/files` + service role, mais des policies explicites ajoutent une ceinture.
5. **`.env.example`** : documenter `VERCEL_ENV` (garde clés live Stripe), la note AI Gateway, et les variables de démo (`CRM_DEMO_*`).
6. **Endpoints exposés mais non utilisés par l'UI** (lecture RSC) : `GET` admin clients/bookings/transactions/revolut, `POST /api/admin/email-ingest/simulate` (dev). À documenter ou retirer.
7. **Message « itinéraire en préparation »** quand un carnet publié n'a pas encore d'items (aujourd'hui rendu `null`). Réf. [components/account/CarnetItinerary.tsx](components/account/CarnetItinerary.tsx).

## Faux positifs écartés (transparence)

- **Formulaire de contact « faux succès »** : FAUX. L'API renvoie `delivered:false` et le front gère un statut `undelivered` avec repli e-mail direct. Réf. [components/ContactForm.tsx](components/ContactForm.tsx), [app/api/contact/route.ts](app/api/contact/route.ts).
- **Mur téléphone masque Pièces/Voyageurs** : FAUX. Les sous-pages `/mon-compte/profil/*` (documents = Pièces, compagnons = Voyageurs) sont **exemptées** du mur (`!pathname.startsWith("/mon-compte/profil")`). Réf. [components/account/AccountChrome.tsx](components/account/AccountChrome.tsx).
- **Tokens « Aura » = violation design** : NUANCE. Nommage legacy uniquement ; couleurs correctes (marine Sovereign Horizon). Déplacé en P2.
- **Bucket public / RLS manquante** : FAUX. Bucket privé + RLS sur toutes les tables `crm_*` (vérifié en prod).

## Checklist go-live consolidée

- Variables Vercel Production (toutes sauf `NEXT_PUBLIC_*` server-only) : Supabase trio, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`, Resend + `CONTACT_FROM_EMAIL`/`CONTACT_TO_EMAIL`, `OPENAI_API_KEY`, Stripe (si UI cartes ouverte), Revolut prod (`REVOLUT_SANDBOX=0`), Gmail ingest.
- Supabase Auth : Site URL `https://travelba.fr`, allowlist `…/auth/callback` (+ localhost), inscriptions publiques OFF, sessions sans timeout.
- Domaine Resend authentifié (SPF/DKIM), expéditeur `contact@travelba.fr`.
- Stripe live + webhook `…/api/webhooks/stripe` (si applicable), Revolut OAuth via `/admin/revolut` + cron 15 min, Gmail watch-renew.
- Smoke sans seed, sans publier un vrai carnet ; garder les logins `crm_staff`.

## Plan de remédiation proposé (par lots, après validation)

- **Lot A — P0 config/process** : garde-fous bootstrap staff (refuser l'auto-admin si non prévu), documentation/scripts de vérification d'env, décision UI cartes. (Surtout config côté agence + petits garde-fous code.)
- **Lot B — P1 front** : `ConfirmButton` + confirmations sur toutes les actions destructives et la dépublication ; correction `removeItem` (contrôle `res.ok` + message) ; feedback d'erreur accompagnateur ; copy FR (« Email agent », « Grand livre ») ; `aria-label` filtre statut ; `loading.tsx` manquants.
- **Lot C — P1/P2 back & nettoyage** : retrait du code mort, cohérence libellés/nav (KPI filtré, création directe), documentation/retrait endpoints inutilisés.
- **Lot D — P2 robustesse** : tests d'intégration Revolut/Gmail/ingest/auth, renommage tokens `--aura-*`, policies storage, `.env.example` complété, message carnet vide.

Chaque lot = une PR testée (`npm test`, `npx tsc --noEmit`, `npm run build`) + re-vérification du parcours impacté.

## Débloquer la QA interactive (recommandé)

Pour tester réellement chaque bouton des deux parcours avec des données de démo, deux options :

1. **Régler la facturation Supabase en souffrance**, puis je provisionne le projet de dev, applique les migrations, crée le bucket, `seed:demo`, et j'exécute la QA agent + client (390 px et 1280 px) avec captures.
2. **Fournir un environnement de staging** + identifiants agent et client de test.

Sans l'un des deux, la QA reste statique + lecture seule (le présent rapport).
