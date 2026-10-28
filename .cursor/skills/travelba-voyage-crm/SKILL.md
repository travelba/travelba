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
Gmail / `crm_email_ingest` / labels Little Emperors, Expedia TAAP, billet-avion, booking-cancellation, `crm`, `reservations-tba` et `cdsgroupe.com` → **`travelba-email-ingest`** (parse → suggestions, dépôt des pièces au clic, cartes seulement sur un second clic).
Ne pas ré-ouvrir le QCM produit : les règles sont déjà ancrées dans les skills.

## Dossier agence (toutes les réservations)

Liste `/admin/reservations` : du plus proche au plus loin (séjour en cours, puis prochains départs, puis passés du plus récent). « Départ, du plus lointain » reste un tri du menu.

Un seul état honnête : **En préparation**, **Visible**, ou **Archivée**. L’écran n’affiche pas de statut commercial (À l’étude, Devis, Confirmée). Le bouton dit **Montrer au client** ; la pastille dit **Visible**. Archiver dit **Archiver**, jamais Supprimer.

L’en-tête (le titre compris) et le bloc Lieu et dates sont en haut et suivent **toutes** les étapes (plusieurs villes, plusieurs dates, sans répéter la même ville, le même séjour ni le même trajet). Le nom du séjour se modifie dans cet en-tête : le texte saisi reste à l’écran, il ne revient pas au titre stocké, et Enregistrer s’allume. On n’affiche pas un seul lieu ni un seul aller-retour figé du dossier, et on ne réécrit pas la destination ni les dates en base pour les aligner.

Carte vol : **villes en titre** (`Rome → Paris`), code aéroport en dessous (`FCO → CDG`). Une étape non montrée est en surbrillance, pas un compteur. Pas de liste nom + e-mail des contacts hôtel sur la carte. Le formulaire d’envoi laisse cocher les destinataires, au-dessus de l’objet, puis le message. Un mail remplit une carte puis vit avec les pièces : pas d’étape e-mail ; les doublons proposés sont repliés (le nombre reste visible) puis s’écartent. Little Emperors : `64570` et `64570SH046795` sont la même carte, le mail met le séjour à jour, et le choix d’une carte n’apparaît que pour une seule carte nouvelle. Un numéro d’hôtel différent du numéro Little Emperors se rapproche par l’hôtel ou `le_hotel_id`, les dates exactes et le voyageur ; les deux numéros restent sur la carte, et deux séjours possibles laissent la file attendre. Même hôtel et mêmes nuits, carte sans référence : on met à jour (`Mondrian Bordeaux` et `Mondrian Bordeaux Les Carmes`), on n’ouvre pas une seconde carte. Train : même code, autre jour = une carte nouvelle ; retirer une étape allume Enregistrer. L’onglet À faire reste visible. Dupliquer copie visas, refus et courriers. Montrer un séjour l’inscrit au grand livre, quel que soit le statut stocké. Le cacher retire le débit ouvert. Une annulation retire les débits. Enregistrer une étape ne la cache pas. Confirmer reste éteint, et le dit, si aucune étape n’est montrée. Une lecture douteuse nomme l’étape et la raison. Détail : skills carnet, e-mail, UI, argent.

## Quel skill charger

| Tâche | Skill |
|-------|--------|
| Clone, stack, conventions, premier agent | `.cursor/skills/travelba-bootstrap/SKILL.md` |
| Lancement / prod Vercel, DNS, webhooks, cron | `.cursor/skills/travelba-go-live/SKILL.md` |
| Schema, RLS, bucket, Auth dashboard, migrations | `.cursor/skills/travelba-supabase/SKILL.md` |
| Invitation, magique, mot de passe, sessions, staff | `.cursor/skills/travelba-auth/SKILL.md` |
| Carnet, timeline, publier, cartes vol/hôtel | `.cursor/skills/travelba-carnet/SKILL.md` |
| **Import PDF/photos** (dropzone admin, relecture puis Enregistrer) | `.cursor/skills/travelba-document-ingest/SKILL.md` |
| **Gmail / `crm_email_ingest`** (labels Little Emperors, Expedia TAAP, billet-avion, booking-cancellation, `crm`, `reservations-tba`, `cdsgroupe.com` → dépôt des pièces au clic, cartes sur un second clic) | `.cursor/skills/travelba-email-ingest/SKILL.md` |
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

Lecture du CRM pour Grok Bot : `https://travelba.fr/api/mcp`, jeton `TRAVELBA_MCP_TOKEN` (vide en preview). Chaque option admin nouvelle ajoute **un outil** dans `lib/crm/mcp-registry.ts`, dans le même changement, en réutilisant `lib/crm`. Plafond 53. `enregistrement_en_ligne` lit et met à jour le statut d’enregistrement de chaque vol (à faire, ouvert, en cours, fait, cartes reçues, envoyées). Sans statut, c’est une lecture : le bot vérifie avant de proposer. `envoyer_releve` envoie le relevé comme le bouton admin (PDF, WhatsApp, `TWILIO_CONTENT_RELEVE` hors 24 h, journal y compris l’échec). Canal `whatsapp` ; l’e-mail n’est pas ouvert. L’auteur est le jeton. Un second envoi réussi en cinq minutes est refusé, sauf `force`. La réponse donne le SID Twilio et le statut. Pas de MRZ, PAN ni jeton, sauf `lire_carte_pliant`. Pas d’URL signée, sauf `scan_passeport`. Les numéros de pièce restent masqués. Exception : `passeport_voyageur` (lecture seule, APIS) et `scan_passeport` (fichier du passeport, URL Storage 600 s, nom, type mime ; un PDF est signalé) répondent seulement si le jeton est un nom de `TRAVELBA_MCP_PASSPORT_TOKENS`, donc depuis l’espace MCP `travelba-passeports`. Le refus de l’espace `travelba` (jeton général) est voulu : on n’élargit pas cet accès. `lieu_naissance` vient de `place_of_birth`. Pas de champ biométrique. Chaque consultation est journalisée dans `crm_mcp_passport_reads` (`kind` lecture ou scan), sans numéro, sans chemin, sans URL. `creer_carte_pliant`, `lire_carte_pliant` et `bloquer_carte_pliant` répondent seulement si le jeton est un nom de `TRAVELBA_MCP_CARD_TOKENS` (même forme `nom:jeton`, distinct du jeton général ; un jeton passeport ne suffit pas). La création rattache la carte au dossier (`crm_booking_cards` et `crm_pliant_cards`), plafond saisi, contrôles vides. `transactions` vaut 1 par défaut (`PLIANT_SINGLE_USE`, le nombre n’est pas envoyé). Au-delà, `PLIANT_VIRTUAL` avec `maxTransactionCount`, le plafond total et le montant par transaction. Chaque débit de la carte se rapproche du dossier. `lire_carte_pliant` renvoie le PAN, l’expiration et le CVV de cette carte seulement. Rien n’est écrit ni journalisé du numéro. Chaque création, chaque lecture et chaque gel est dans `crm_mcp_card_events` (dossier, identifiant, libellé, plafond, heure ; `blocage` ou `deblocage`). `bloquer_carte_pliant` gèle chez Pliant (`POST /cards/{id}/lock`, `debloquer` pour `unlock`) et écrit `locked` ou `active` sur le dossier. Le libellé et l’objet Pliant portent le client, l’hôtel ou le fournisseur et la référence. Le titulaire reste la personne. `fiche_dossier` montre `cartes_pliant` avec le statut. Chaque vol porte `enregistrement` (statut, ouverture, par, alerte). Chaque carte de `fiche_dossier` porte `carte_id` (l’identifiant pour `modifier_vol`, `modifier_hotel` et `enregistrement_en_ligne`). Chaque voyageur porte `voyageur_id`. Chaque ligne de `comptabilite_voyage` porte `carte_id` quand la vente est rattachée à une carte. Une écriture n’entre qu’avec la garde produit déjà en place (Revolut unique, mail ambigu qui attend le clic, séjour caché qui ne débite pas). `ajouter_piece` dépose un fichier dans `crm_travel_documents` (coffre `customers/<client>/documents/…`), comme le formulaire Pièces. Le type `carte_embarquement` dépose un PDF sur le dossier (`crm_booking_documents`, type `carte d'embarquement`), le même que le bouton Cartes d’embarquement. Aucun WhatsApp. `requalifier_piece(document_id, type)` change le type d’une pièce déjà liée à ce dossier ; `carte_embarquement` garde le même identifiant, sans recopier le fichier. Le type `eta` reste une autorisation de voyage, distincte du visa. Le pays émetteur n’est pas recopié dans la nationalité. Une formalité (visa ou ETA) liée à un séjour envoie le WhatsApp « formalité prête » au client et au voyageur concerné s’il a un autre numéro (séjour visible, dédoublonnage par destinataire). Une fiche opt-in reçoit le modèle avec bouton. Sans fiche, le modèle sans bouton `formalite_prete_voyageur` (`TWILIO_CONTENT_FORMALITE_PRETE_VOYAGEUR`) part s’il est approuvé ; sinon la raison est « Modèle WhatsApp voyageur pas encore approuvé. » `notifier: false` le coupe. `notifier_piece` le renvoie pour une pièce déjà déposée ; `destinataires` vaut `tous`, `client` ou `voyageur`. `notifier_carte_embarquement` envoie au client du dossier le PDF déjà déposé de type carte d’embarquement (`document_id`), en-tête Document du modèle `carte_embarquement`. Un PDF à plusieurs pages part en un message par passager (le bébé reste sur la page de l’adulte). Si la lecture échoue : `prenom`, `vol`, `trajet`, `date_heure`, `siege` ou `passagers`. Rien n’est inventé. Un passager déjà prévenu ne repart pas. Sans modèle approuvé, l’outil refuse et nomme le modèle à soumettre (nom, corps, variables, en-tête Document). `formalites` accepte `reference` ou `dossier_id`. `creer_dossier`, `ajouter_voyageur`, `ajouter_vol`, `ajouter_hotel` (photos https, adresse, heures seulement si elles sont connues) et `ajouter_accueil_vip` construisent un séjour En préparation (caché, aucun débit tant qu’il n’est pas montré, aucune invitation, aucun message). `ajouter_accueil_vip` refuse une étape sans vol du dossier : l’aéroport et l’heure viennent du vol d’arrivée ou de départ, et suivent ce vol. Un aller-retour se relie à deux vols. Le prix est facultatif. Le passeport suit la fiche ; le numéro n’est pas renvoyé. Une devise hors dossier (THB) reste le prix du document. Sur un vol, `prix` est le prix d’un billet : le séjour le multiplie par le nombre de billets. `prix_total` est le total du groupe, gardé au centime (`details.amount_is_total`) : il n’est pas divisé, et ce total sert au grand livre et à l’affichage. Le nombre de billets n’est pas obligatoire. Une carte déjà enregistrée sans ce drapeau reste unitaire × billets : on ne réécrit pas les dossiers. Un aller-retour au même prix vendu n’est compté qu’une fois ; deux prix différents, même à un centime, comptent tous les deux. Les frais de billeterie retirés ne reviennent pas dans le total. L’heure saisie reste l’heure locale de l’aéroport (`start_at` sans décalage, comme la saisie agence) ; le fuseau (Europe/Paris, Asia/Bangkok) est sur la carte, et `fiche_dossier` affiche ce décalage. `modifier_vol` corrige une carte déjà là (`voyageur_ids` rattache les passagers et ne change pas le prix), sans message. `prix_total` sans `devise` garde la devise de la carte (euro par défaut), pas la devise du document fournisseur. `reservation_little_emperors` lit une réservation Little Emperors (référence, ou nom et hôtel, dates facultatives), y compris déjà rattachée : référence, statut, hôtel, dates, chambres, régime, voyageurs, prix net, prix public, avantages, conditions, confirmations hôtel, dossier lié. `modifier_hotel` corrige une carte hôtel (`carte_id`). Le prix de vente ne change que si `prix` est indiqué, y compris égal au coût net, sans marge. Un coût net en devise (MAD) garde son équivalent en euros ; aucun taux n’est inventé. `reference_le` remplit la carte depuis la réservation, sans changer le prix de vente. Quand `depart_iata` et `arrivee_iata` sont tous les deux connus, l’avertissement sur les codes IATA non imprimés est retiré. `effacer_avertissement` retire toute lecture douteuse. Le client reste une personne. `raison_sociale`, `siret`, `tva` et l’adresse créent ou mettent à jour `crm_billing_companies` (même SIRET : pas de doublon ; la première société est recopiée sur la fiche). `creer_dossier` facture la société du client par défaut (l’unique société, ou la première s’il y en a plusieurs ; `societe_id` en choisit une). `particulier: true` laisse le séjour particulier. Sans société sur la fiche, le séjour reste particulier. `facturer_societe` sans société est une erreur. Un vol à 0 € est accepté. `sans_frais`, ou un vol à 0 € sans autre vol payant, pose `fee_mode=ticketing_off` : les frais de billeterie ne reviennent pas et leur débit est annulé. `retirer_carte` retire une carte et met le grand livre à jour. `definir_visibilite_carte` montre ou cache une seule carte (`visible`, omis : la visibilité ne change pas). `inclure_transactions` coche ou décoche « Inclure dans les transactions » : le débit est créé, rétabli ou annulé sur la même ligne, au total exact si `amount_is_total`. Aucun envoi, aucun `publier_carnet`. Sur un carnet déjà montré, un brouillon WhatsApp est préparé (un seul message si plusieurs ajouts) ; l’agence l’envoie en un clic. `preparer_message_carnet` prépare ce brouillon à la main, sans l’envoyer. Le séjour caché ne débite pas. Le geste est dans `crm_audit_events`. `ajouter_voyageur` reconnaît le premier prénom et le nom (naissance ou usage) avec la date de naissance : une autre date, ou un prénom qui n’est pas le début, crée un accompagnant. Jamais le seul nom de famille, et jamais la mise à jour d’un autre voyageur sans `compagnon_id`. `modifier_voyageur` modifie le voyageur déjà sur le dossier, par `voyageur_id` (celui de `fiche_dossier`, pas `compagnon_id`) : téléphone, e-mail de contact, naissance, fidélité. L’e-mail du titulaire reste `mettre_a_jour_client`. Aucun message, aucun numéro de passeport. `mettre_a_jour_dossier` pose `societe_id` ou `particulier` sur un dossier déjà ouvert. `titre` change le nom. `couverture` (`catalogue`, un lieu, ou un identifiant `photo-…`) retire une photo importée et laisse la photo du catalogue de ce séjour. Une URL https ou une image JPEG, PNG ou WebP en base64 (5 Mo maximum) dépose la couverture ; le crédit vaut « Image générée par IA » s’il n’est pas indiqué. `creer_dossier` sans `titre` nomme le séjour par la destination, pas par l’hôtel. `supprimer_societe_id` sur `mettre_a_jour_client` retire une société vide qui n’est pas utilisée. `compagnon_id` rattache ce compagnon. `retirer_voyageur` retire un voyageur du séjour et des cartes. `fusionner_compagnon` reprend les séjours d’un doublon sans pièce. `fiche_dossier` et `chercher_dossiers` montrent `societe` et `paye_par` à côté du contact. `modifier_titulaire` met à jour la fiche du titulaire et son passeport : prénoms, nom, nom de passeport, nom d’usage, naissance, lieu, sexe, nationalité, délivrance, adresse personnelle. Mêmes champs que l’accompagnateur, plus le livret et le domicile. Le numéro n’est pas lu ni renvoyé. `pays_passeport` choisit le livret et n’est pas la nationalité. `definir_role_societe` pose admin, membre ou particulier, comme la fiche agence (le membre a un admin société payeur). `inviter_client` crée l’accès et envoie l’invitation par le même flux que la fiche (e-mail, puis WhatsApp si le message part : le canal du lien suit). Rien ne part sans cet appel. Un accès déjà invité ou prêt n’est pas renvoyé. Les autres outils n’invitent pas et n’envoient pas de message.

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
