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
PDF / photos / « entraîne l’import » → **`travelba-document-ingest`** (dropzone admin, relecture humaine avant Enregistrer).
Gmail / `crm_email_ingest` / labels Little Emperors, Expedia TAAP, billet-avion, booking-cancellation, `crm`, `reservations-tba` et `cdsgroupe.com` → **`travelba-email-ingest`** (parse → suggestions, création auto du dossier, mise à jour auto sur un match unique).
Ne pas ré-ouvrir le QCM produit : les règles sont déjà ancrées dans les skills.

## Dossier agence (toutes les réservations)

Liste `/admin/reservations` : du plus proche au plus loin (séjour en cours, puis prochains départs, puis passés du plus récent). « Départ, du plus lointain » reste un tri du menu.

Un seul état honnête : **En préparation**, **Visible**, ou **Archivée**. L’écran n’affiche pas de statut commercial (À l’étude, Devis, Confirmée). Le bouton dit **Montrer au client** ; la pastille dit **Visible**. Archiver dit **Archiver**, jamais Supprimer.

L’en-tête (le titre compris) et le bloc Lieu et dates sont en haut et suivent **toutes** les étapes (plusieurs villes, plusieurs dates, sans répéter la même ville, le même séjour ni le même trajet). Le nom du séjour se modifie dans cet en-tête : le texte saisi reste à l’écran, il ne revient pas au titre stocké, et Enregistrer s’allume. On n’affiche pas un seul lieu ni un seul aller-retour figé du dossier, et on ne réécrit pas la destination ni les dates en base pour les aligner.

Carte vol : **villes en titre** (`Rome → Paris`), code aéroport en dessous (`FCO → CDG`). Une étape non montrée est en surbrillance, pas un compteur. Pas de liste nom + e-mail des contacts hôtel sur la carte. Le formulaire d’envoi laisse cocher les destinataires, au-dessus de l’objet, puis le message. Un mail remplit une carte puis vit avec les pièces : pas d’étape e-mail ; les doublons proposés sont repliés (le nombre reste visible) puis s’écartent. Little Emperors : `64570` et `64570SH046795` sont la même carte, le mail met le séjour à jour, et le choix d’une carte n’apparaît que pour une seule carte nouvelle. Même hôtel et mêmes nuits, carte sans référence : on met à jour (`Mondrian Bordeaux` et `Mondrian Bordeaux Les Carmes`), on n’ouvre pas une seconde carte. Train : même code, autre jour = une carte nouvelle ; retirer une étape allume Enregistrer. L’onglet À faire reste visible. Dupliquer copie visas, refus et courriers. Montrer un séjour l’inscrit au grand livre, quel que soit le statut stocké. Le cacher retire le débit ouvert. Une annulation retire les débits. Enregistrer une étape ne la cache pas. Confirmer reste éteint, et le dit, si aucune étape n’est montrée. Une lecture douteuse nomme l’étape et la raison. Détail : skills carnet, e-mail, UI, argent.

## Quel skill charger

| Tâche | Skill |
|-------|--------|
| Clone, stack, conventions, premier agent | `.cursor/skills/travelba-bootstrap/SKILL.md` |
| Lancement / prod Vercel, DNS, webhooks, cron | `.cursor/skills/travelba-go-live/SKILL.md` |
| Schema, RLS, bucket, Auth dashboard, migrations | `.cursor/skills/travelba-supabase/SKILL.md` |
| Invitation, magique, mot de passe, sessions, staff | `.cursor/skills/travelba-auth/SKILL.md` |
| Carnet, timeline, publier, cartes vol/hôtel | `.cursor/skills/travelba-carnet/SKILL.md` |
| **Import PDF/photos** (dropzone admin, relecture puis Enregistrer) | `.cursor/skills/travelba-document-ingest/SKILL.md` |
| **Gmail / `crm_email_ingest`** (labels Little Emperors, Expedia TAAP, billet-avion, booking-cancellation, `crm`, `reservations-tba`, `cdsgroupe.com` → création auto, mise à jour auto sur un match unique) | `.cursor/skills/travelba-email-ingest/SKILL.md` |
| Ledger, encours, Stripe, Revolut | `.cursor/skills/travelba-money/SKILL.md` |
| Cursor Design, Lucide, `/api/files`, copy FR | `.cursor/skills/travelba-ui/SKILL.md` |
| Fiche, passeports, compagnons, facturation | `.cursor/skills/travelba-identity/SKILL.md` |
| Formalité ETA-IL / ESTA / Royaume-Uni, Astra, étapes client | `.cursor/skills/travelba-visa/SKILL.md` |
| Tests, build, verif navigateur, ne pas casser prod | `.cursor/skills/travelba-verify/SKILL.md` |
| MCP Grok Bot, nouvelle option CRM | ce fichier, section « MCP Grok Bot » |

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
| Bienvenue (une fois, après le mot de passe) | `/mon-compte/bienvenue` |
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

## MCP Grok Bot

Lecture du CRM pour Grok Bot : `https://travelba.fr/api/mcp`, jeton `TRAVELBA_MCP_TOKEN` (vide en preview). Chaque option admin nouvelle ajoute **un outil** dans `lib/crm/mcp-registry.ts`, dans le même changement, en réutilisant `lib/crm`. Plafond 40. Pas de MRZ, PAN ni jeton, sauf `lire_carte_pliant`. Pas d’URL signée, sauf `scan_passeport`. Les numéros de pièce restent masqués. Exception : `passeport_voyageur` (lecture seule, APIS) et `scan_passeport` (fichier du passeport, URL Storage 600 s, nom, type mime ; un PDF est signalé) répondent seulement si le jeton est un nom de `TRAVELBA_MCP_PASSPORT_TOKENS`. `lieu_naissance` vient de `place_of_birth`. Pas de champ biométrique. Chaque consultation est journalisée dans `crm_mcp_passport_reads` (`kind` lecture ou scan), sans numéro, sans chemin, sans URL. `creer_carte_pliant` et `lire_carte_pliant` répondent seulement si le jeton est un nom de `TRAVELBA_MCP_CARD_TOKENS` (même forme `nom:jeton`, distinct du jeton général ; un jeton passeport ne suffit pas). La création rattache la carte au dossier (`crm_booking_cards` et `crm_pliant_cards`), plafond saisi, une transaction par défaut, contrôles vides. `lire_carte_pliant` renvoie le PAN, l’expiration et le CVV de cette carte seulement. Rien n’est écrit ni journalisé du numéro. Chaque création et chaque lecture est dans `crm_mcp_card_events` (dossier, identifiant, libellé, plafond, heure). Une écriture n’entre qu’avec la garde produit déjà en place (Revolut unique, mail ambigu qui attend le clic, séjour caché qui ne débite pas). `ajouter_piece` dépose un fichier dans `crm_travel_documents` (coffre `customers/<client>/documents/…`), comme le formulaire Pièces. Le type `eta` reste une autorisation de voyage, distincte du visa. Le pays émetteur n’est pas recopié dans la nationalité. Une formalité (visa ou ETA) liée à un séjour envoie le WhatsApp « formalité prête » au client et au voyageur concerné s’il a un autre numéro (séjour visible, dédoublonnage par destinataire). Une fiche opt-in reçoit le modèle avec bouton. Sans fiche, le modèle sans bouton `formalite_prete_voyageur` (`TWILIO_CONTENT_FORMALITE_PRETE_VOYAGEUR`) part s’il est approuvé ; sinon la raison est « Modèle WhatsApp voyageur pas encore approuvé. » `notifier: false` le coupe. `notifier_piece` le renvoie pour une pièce déjà déposée ; `destinataires` vaut `tous`, `client` ou `voyageur`. `formalites` accepte `reference` ou `dossier_id`. `creer_dossier`, `ajouter_voyageur`, `ajouter_vol` et `ajouter_hotel` construisent un séjour En préparation (caché, aucun débit tant qu’il n’est pas montré, aucune invitation, aucun message). Le passeport suit la fiche ; le numéro n’est pas renvoyé. Une devise hors dossier (THB) reste le prix du document. Sur un vol, `prix` est le prix d’un billet et `prix_total` le total du groupe pour cette carte (unitaire = total / billets). Un aller-retour au même prix vendu n’est compté qu’une fois ; deux prix différents comptent tous les deux. L’heure saisie reste l’heure locale de l’aéroport (`start_at` sans décalage, comme la saisie agence) ; le fuseau (Europe/Paris, Asia/Bangkok) est sur la carte, et `fiche_dossier` affiche ce décalage. `modifier_vol` corrige une carte déjà là, sans message.

## Interdits globaux

- Secrets dans git (seulement `.env.local` / Vercel env)
- URL signed Supabase longue dans le HTML — `/api/files?path=`
- Crédit Revolut ambigu sans confirmation agent (l’auto n’est autorisé que si match unique certain)
- PAN / CVC — références Stripe uniquement
- `npm run seed:demo` sur la prod
- Recréer des clients / voyages fictifs en prod
- Fermer les sessions staff existantes
- Cache Components Next.js
- Inventer des heures, petits-déjs, nets, conditions d’annulation. Little Emperors : tout le bloc Benefits, pas seulement le petit-déjeuner
- Echo PII client (passeport, email, téléphone) dans un PR / log
- Redemander un jeton Pliant à Auth0 (quota du jour). Un seul appel, réutilisé via `acquirePliantToken` / `crm_integrations`. Preview sans identifiants de production. Skill `travelba-visa`
- Poser un blocage à la génération d’une carte Pliant. L’émission vide commerçants, catégories, dates, lieux, pays, devises et modes d’acceptation.

## Fichiers clés

| Rôle | Path |
|------|------|
| Types | `lib/crm/types.ts` |
| Auth staff/client | `lib/crm/auth.ts`, `lib/crm/session.ts` |
| Invitation | `lib/crm/invite.ts` |
| Carnet | `lib/crm/carnet.ts` |
| Import docs | `lib/crm/ingest-booking.ts`, `ingest-parse.ts`, skill `travelba-document-ingest` |
| Mails Gmail | `lib/crm/email-ingest.ts`, `email-match.ts`, `gmail.ts`, skill `travelba-email-ingest` |
| Couvertures | `lib/crm/covers.ts` + skill `travelba-carnet` (arrivée, pas Paris) |
| Identité | `lib/crm/ocr-document.ts` |
| Fichiers | `lib/crm/files.ts` + `app/api/files/route.ts` |
| Argent | `lib/crm/money.ts`, `lib/crm/bookings.ts` (`syncBookingDebit`) |
| MCP Grok Bot | `app/api/mcp/route.ts`, `lib/crm/mcp-registry.ts` |
| Site / WhatsApp | `lib/site.ts` (`whatsappNumber` `33756841315`) |
| Proxy session | `proxy.ts` (pas `middleware.ts`) |
| Schema | `supabase/migrations/` |
