---
name: travelba-voyage-crm
description: >-
  Index Travelba CRM (agence de voyage FR). Use at the start of any Travelba
  task: admin /admin, client /mon-compte, carnet, auth, Stripe, Revolut,
  Supabase, production launch, or new feature. Routes the agent to the right
  specialized skill instead of guessing product rules.
---

# Travelba — carte CRM

Produit : back-office `/admin` + espace client `/mon-compte`. UI française.
Site public : `https://travelba.fr`. Compte : Travel Business Agency (TBA).

Lire **ce fichier en premier**, puis **un seul** skill spécialisé ci-dessous.
PDF / photos / « entraîne l’import » → **`travelba-document-ingest`** (qualité carnet = qualité import).
Ne pas ré-ouvrir le QCM produit : les règles sont déjà ancrées dans les skills.

## Quel skill charger

| Tâche | Skill |
|-------|--------|
| Clone, stack, conventions, premier agent | `.cursor/skills/travelba-bootstrap/SKILL.md` |
| Lancement / prod Vercel, DNS, webhooks, cron | `.cursor/skills/travelba-go-live/SKILL.md` |
| Schema, RLS, bucket, Auth dashboard, migrations | `.cursor/skills/travelba-supabase/SKILL.md` |
| Invitation, magique, mot de passe, sessions, staff | `.cursor/skills/travelba-auth/SKILL.md` |
| Carnet, timeline, publier, cartes vol/hôtel | `.cursor/skills/travelba-carnet/SKILL.md` |
| **Import PDF/photos** (qualité / fiabilité des cartes) | `.cursor/skills/travelba-document-ingest/SKILL.md` |
| Ledger, encours, Stripe, Revolut | `.cursor/skills/travelba-money/SKILL.md` |
| Stitch, Lucide, `/api/files`, copy FR | `.cursor/skills/travelba-ui/SKILL.md` |
| Fiche, passeports, compagnons, facturation | `.cursor/skills/travelba-identity/SKILL.md` |
| Tests, build, verif navigateur, ne pas casser prod | `.cursor/skills/travelba-verify/SKILL.md` |

Règle always-on : `.cursor/rules/travelba-core.mdc`.

## Routes

| Besoin | Où |
|--------|-----|
| Accueil client (prochain séjour) | `/mon-compte` |
| Liste / détail carnet | `/mon-compte/reservations`, `/mon-compte/reservations/[reference]` |
| Vous / Pièces / Voyageurs / Facturation | `/mon-compte/profil…` |
| Transactions + demander un relevé | `/mon-compte/transactions` |
| Connexion mot de passe + magique | `/connexion` |
| Définir mot de passe | `/connexion/mot-de-passe` |
| Admin | `/admin` → clients, réservations, transactions, Revolut |
| Login staff | `/admin/login` |

Pas de `/demo`. `proxy.ts` redirige `/demo` → `/connexion`.
`/mon-compte/profil/paiement` redirige vers Facturation (pas d’UI cartes).

## Modèle

`crm_customers` → `crm_bookings` / `crm_booking_items` / `crm_booking_documents` / `crm_booking_travelers` / `crm_travel_companions` / `crm_travel_documents` / `crm_transactions` / `crm_payment_methods`

Encours = vue `crm_customer_balances` (crédits − débits `posted`). Positif = avoir, négatif = reste à payer. Afficher le signe brut.

IDs prod :

- Supabase `fsmfozxgujskluxakeoq`
- Vercel projet `prj_NAEfKYyndp7T68G2wKOguSCgtPUr`, team `team_bTvGnpMBL2dVrz8vXQ6vb3eZ`

## Interdits globaux

- Secrets dans git (seulement `.env.local` / Vercel env)
- URL signed Supabase longue dans le HTML — `/api/files?path=`
- Crédit Revolut sans rapprochement agent
- PAN / CVC — références Stripe uniquement
- `npm run seed:demo` sur la prod
- Recréer des clients / voyages fictifs en prod
- Fermer les sessions staff existantes
- Cache Components Next.js
- Inventer des heures, petits-déjs, nets, conditions d’annulation
- Echo PII client (passeport, email, téléphone) dans un PR / log
- Merger ou déployer la prod sans demande explicite

## Remarques figées

- Photo de séjour = **ville d’arrivée**. Paris / CDG n’est pas la photo s’il y a une autre ville. Un `cover.webp` déjà stocké peut encore montrer Paris : skill `travelba-carnet`.
- « Pièce d’identité manquante » = le voyageur du **billet** n’est pas relié au coffre. Le passeport peut être dans Mon compte. Un prénom de billet plus court que la fiche (`Benjamin` / `Benjamin, Elie, David`) est la **même** personne. Skill `travelba-identity`.
- Le client voit le carnet seulement si **Visible dans l’espace**. Enregistrer laisse le brouillon masqué.
- Stitch : composition et tokens seulement. Pas le copy fictif (Privilège, cloche, 24/7, points club, VIP, Planning, Trésorerie). Skill `travelba-ui`.
- `npm test` = `npx tsx --test lib/crm/*.test.ts`.

## Fichiers clés

| Rôle | Path |
|------|------|
| Types | `lib/crm/types.ts` |
| Auth staff/client | `lib/crm/auth.ts`, `lib/crm/session.ts` |
| Invitation | `lib/crm/invite.ts` |
| Carnet | `lib/crm/carnet.ts` |
| Import docs | `lib/crm/ingest-booking.ts`, `ingest-parse.ts`, skill `travelba-document-ingest` |
| Couvertures | `lib/crm/covers.ts` + `lib/crm/cover-generate.ts` + `coverQuery` dans `lib/crm/carnet.ts` |
| Identité | `lib/crm/ocr-document.ts`, `lib/crm/person-name.ts`, `lib/crm/trip-documents.ts`, `lib/crm/traveler-link.ts` |
| Fichiers | `lib/crm/files.ts` + `app/api/files/route.ts` |
| Argent | `lib/crm/money.ts`, `lib/crm/bookings.ts` (`syncBookingDebit`) |
| Site / WhatsApp | `lib/site.ts` (`whatsappNumber` `33756841315`) |
| Proxy session | `proxy.ts` (pas `middleware.ts`) |
| Schema | `supabase/migrations/` |
