# Audit — entrer dans un dossier

Date : 20 novembre 2026. Périmètre : ce qui se passe quand quelqu’un ouvre une réservation, côté agence (`/admin`) et côté client (`/mon-compte`), du clic jusqu’aux tables et aux envois. Aucun code applicatif n’a été modifié pour cet audit. Aucune migration, aucune écriture en base, aucun appel externe.

## Sommaire

1. [Synthèse exécutive](#synthèse-exécutive)
2. [Parcours cartographié](#1-parcours-cartographié)
3. [Clics et champs des tâches courantes](#2-clics-et-champs-des-tâches-courantes)
4. [Problèmes](#3-problèmes)
5. [Améliorations priorisées](#4-améliorations-priorisées)
6. [Parcours cible en trois étapes](#5-parcours-cible-en-trois-étapes)
7. [Quick wins](#6-quick-wins-moins-dune-journée)

## Synthèse exécutive

Ouvrir un dossier, c’est un seul écran de 3 012 lignes (`BookingEditor.tsx`) : voyage, client, à faire, argent, historique.
L’état tient en trois mots — Non visible, Visible, Annulé, plus Archivée — mais l’en-tête empile Enregistrer, Montrer, Cacher, Mettre à jour, Annuler, Archiver.
Une étape d’hôtel ou de vol affiche 16 à 20 champs ; un seul est obligatoire, le libellé. Prix vendu, prix du PDF et devise du document se côtoient.
Ajouter une personne absente du foyer oblige à quitter le dossier pour la fiche client, puis à revenir.
Encaisser un virement ne se fait pas sur le dossier : il faut ouvrir Argent ou Revolut, puis confirmer.
La facture s’appelle MB3M, reste une pro forma, et se valide dans un autre logiciel. Le novice ne voit pas quand c’est fini.
Montrer le séjour, juste après une saisie, part en un clic sans liste de ce que le client verra : le compte est débité et le WhatsApp est mis en file.
Le débit est décidé deux fois, par l’application et par un déclencheur Postgres. Étapes et fiche ne sont pas une seule transaction.
Le bon chemin existe : déposer le PDF, relire, créer le dossier caché, montrer ensuite. Il est noyé sous les réglages d’expert.
Cible : trois gestes (qui, quoi, montrer). Le reste — facture, virement, formalité — n’apparaît que lorsqu’il manque quelque chose.

## 1. Parcours cartographié

### 1.1 Routes

| Besoin | Route | Fichier |
|---|---|---|
| Liste agence | `/admin/reservations` | `app/admin/reservations/page.tsx` |
| Création | `/admin/reservations/nouveau` | `app/admin/reservations/nouveau/page.tsx` |
| Fiche agence | `/admin/reservations/[id]` | `app/admin/reservations/[id]/page.tsx` |
| Onglet | `?tab=voyage\|client\|a-faire\|argent\|historique` | `lib/crm/booking-tabs.ts` L1–20 |
| Liste client | `/mon-compte/reservations` | `app/mon-compte/reservations/page.tsx` |
| Détail client | `/mon-compte/reservations/[reference]` | `app/mon-compte/reservations/[reference]/page.tsx` |
| Lien public | `/v/[code]` | `app/v/[code]/page.tsx` |
| Exemple | `/exemple/reservations/[reference]` | `app/exemple/reservations/[reference]/page.tsx` |

Entrer dans un dossier agence : la ligne de `components/admin/BookingsTable.tsx` (lien L114) ou une carte de la semaine sur la même page. Le bouton « + Nouveau dossier » (`app/admin/reservations/page.tsx` L65–68) mène à la dropzone, pas à un formulaire vide.

Anciens onglets (`whatsapp`, `pliant`, `reglement`, `transactions`, `carte`) redirigent vers Client, Voyage ou Argent (`lib/crm/booking-tabs.ts` L36–45). `?hotel=`, `?relance=` et `?repondre=` ouvrent le bureau hôtel puis sont retirés de l’URL au changement d’onglet (L59–68).

Le client n’entre que si `visible_to_client` est vrai et que le dossier n’est pas archivé. Sinon le titre d’onglet reste neutre (`app/mon-compte/reservations/[reference]/page.tsx` L39–43) et la page explique le masquage au lieu d’un 404 (L60–75).

### 1.2 Ce que la page charge

`app/admin/reservations/[id]/page.tsx` L33–85 :

1. `loadAdminBookingGate` — droit staff, réservation, ou 404.
2. `shellAdminBooking` — bloc critique, puis en différé le grand livre, l’enrichissement hôtel, la réparation des téléchargements.
3. Jumeaux du client (`listCustomerTwins`).
4. `BookingEditor` reçoit des promesses : e-mails, activité, WhatsApp, ESTA, Pliant, argent (`BookingEditor.tsx` L1583–1603).

Le premier écran attend donc le bloc critique. Le reste arrive après, d’où les phrases « Le grand livre n’est pas lisible pour le moment » et « La comptabilité du voyage n’est pas lisible » (`BookingEditor.tsx` L2763–2766, L2842).

### 1.3 En-tête, commun à tous les onglets

Fichier : `components/admin/BookingEditor.tsx`, à partir de L1660.

Toujours visible :

- Retour « ← Dossiers ».
- **Nom du séjour** (champ, relié au formulaire `booking-meta`).
- Référence `TB-AAAA-NNNN` (`crm_next_booking_reference`, `supabase/migrations/20260915093000_crm_schema.sql` L250–265) et J−n.
- Dates et villes calculées depuis les étapes (`staffStayFacts`, `lib/crm/staff-stay.ts`), pas un lieu figé du dossier. Tant qu’il n’y a aucune étape, Lieu / Départ / Retour redeviennent saisissables (`BookingEditor.tsx` L2132–2170).
- Pastille d’état (`staffStayLabel`, `lib/crm/staff-stay.ts` L59–66).
- « Me mettre en charge » (`ChargeControl`).
- Pastilles de blocage : passeport, courrier hôtel, montant non montré, coûts à pointer, marge, carte refusée, enregistrement (`staffBlockingChips`, `lib/crm/staff-stay.ts` L72–120). Chaque pastille ouvre À faire ou Argent.
- Compteur « N cartes cachées ».
- Bandeau « Modifications non enregistrées · ⌘S ».
- Barre d’actions, répétée en barre fixe au défilement (L1605–1658 et L1696–1710).

Boutons d’en-tête :

| Bouton | Quand | Effet |
|---|---|---|
| Ajouter le titulaire | Aucun voyageur | `POST …/travelers` avec le titulaire |
| Enregistrer | Grisé tant que rien n’a changé | Sauve la fiche et les étapes, ne montre pas |
| Cartes d’embarquement | S’il y a un vol | Ouvre l’envoi WhatsApp, avec confirmation |
| Montrer au client | Séjour Non visible, rien en attente | Ouvre un récap, puis Confirmer |
| Cacher au client | Séjour Visible, rien en attente | Ouvre un récap, puis Cacher |
| Enregistrer et montrer au client | Non visible **et** modifications en attente | Enregistre **puis montre, sans le récap** |
| Enregistrer et mettre à jour le carnet | Visible **et** modifications en attente | Même chemin, montre à nouveau |
| Mettre à jour le carnet | Visible, étapes encore cachées, rien en attente | Ouvre le récap |
| … | Toujours | Menu secondaire |

Menu « … » (`BookingEditor.tsx` L1505–1568) : Dupliquer, Couverture, Autre version, Photo du lieu, Aperçu de l’espace client, Voir comme le client, Annuler le dossier, Archiver. Pas de « Supprimer ». La route `DELETE` archive (`app/api/admin/bookings/[id]/route.ts` L267–275).

### 1.4 Onglet Voyage (ouvert par défaut)

`lib/crm/booking-tabs.ts` L47 : paramètre absent → `voyage`.

Contenu, dans l’ordre (`BookingEditor.tsx` L2097–2491) :

1. **Lieu et dates** — lecture seule dès qu’une étape existe. Le champ destination du dossier n’est plus édité : les villes viennent des cartes.
2. **Dépôt** — `BookingIngest` en mode `append` (`/api/admin/bookings/ingest` puis `…/from-ingest`). « Joindre une pièce sans la lire » : type Confirmation ou Carte d’embarquement, fichier, bouton Joindre (`POST …/documents`).
3. **Étapes** — `BookingItemsPanel`.
4. Rappel **Argent** (montant, qui paie) : un bouton qui change d’onglet, pas un formulaire.
5. **Pièces** (`ReservationFiles`), courriers, **Restaurants**.

Actions d’une carte (`BookingItemsPanel.tsx` L1084–1239) : Écrire à l’hôtel (hôtel seulement), Vérifié, Modifier, Cacher / Montrer (écrit tout de suite, sans Enregistrer), Retirer (confirmation), déplacer, ordre au clavier. Menu « … » de la carte en plus.

**Ajouter une étape** (`startNew`, L458–464) ouvre un brouillon de type Hôtel, dates proposées depuis le séjour. **Accueil VIP** est un second bouton (L870). Le formulaire est `IngestItemCard` (`components/crm/IngestItemCard.tsx` L167–584). Le bouton du formulaire s’appelle **Appliquer** (L993–999) : il ne poste rien. Le POST part au moment d’Enregistrer, via `flushSteps` → `POST /api/admin/bookings/[id]/items` avec `{ commit: true }` (`BookingItemsPanel.tsx` L640–681).

Champs du formulaire de carte. Obligatoire à l’application : le **libellé** (`prepareStepDraft`, L95–96, message « Titre requis. »). Tout le reste est facultatif, y compris le prix.

Communs à tous les types : type, libellé, référence (ou PNR), début, fin, prix document, devise du document, prix, case « Inclure dans les transactions », fournisseur. Soit **10 champs** avant les champs du métier.

Hôtel en plus : établissement, ville, pension, occupation, chambre (nom + référence + cases voyageurs), inclus. **Environ 16 champs visibles.**

Vol en plus : nombre de billets, n° de vol, opérateur, IATA départ, IATA arrivée, ville départ, ville arrivée, classe, bagages, cases voyageurs. **Environ 20 champs.**

Train, transfert, voiture, activité, bateau, assurance ont leurs propres grilles (L464–583 de `IngestItemCard.tsx`).

Types proposés (`lib/crm/types.ts` L8–44) : Vol, Hôtel, Transfert, Activité, Train, Voiture, Bateau, Assurance, Frais, Chauffeur, VIP Airport, Visa, Enregistrement. La dépense libre et l’accueil VIP sont ailleurs. La contrainte SQL est dans `supabase/migrations/20261019161000_booking_item_kind_accueil_vip.sql` L6–24. Le mot interne `greeter` est réécrit « VIP Airport » à l’écran (`visibleServiceCopy`, `lib/crm/types.ts` L54–56).

### 1.5 Onglet Client

`BookingEditor.tsx` L1966–2604.

- Lecture du client (nom, e-mail, téléphone, WhatsApp, foyer, sociétés) et lien « Ouvrir la fiche ». L’identité ne se modifie pas ici (L2036).
- **Changer de client** : `ChangeBookingClient` → `POST /api/admin/bookings/[id]/client`.
- Notes pour l’agence / pour le client, repliées. Champs du formulaire `booking-meta`. Le mot `null` ne doit pas être enregistré comme note (règle carnet).
- **Sur ce séjour** : mosaïque des voyageurs (`TripPassportPicker`) ou « Ajouter {prénom} (titulaire) ».
- Liste « Ajouter un voyageur… » : personnes lues dans les documents, titulaire, compagnons pas encore sur le séjour. Bouton Ajouter. On ne crée pas une personne nouvelle ici.
- ESTA et ETA Royaume-Uni (`EstaOnBooking`, `UkEtaOnBooking`).
- Fil WhatsApp (`WhatsappThread`).
- Partage du carnet (`TripSharePanel` → `POST …/partage`) si un lien `/v/` existe.
- Journal de connexion du client.

`POST /api/admin/bookings/[id]/travelers` (`route.ts` L10–81) : compagnon du foyer, titulaire, ou prénom+nom lus sur un document. Refus si le couple prénom/nom est déjà sur le séjour. Effet de bord : réconciliation du foyer et recalcul des frais de billeterie (25 € par voyageur dès qu’il y a un vol). Retrait : `DELETE` avec confirmation « Retirer du séjour » (`components/crm/TripPassportPicker.tsx` L257–262). Le retrait ne retire pas le compagnon de la fiche.

### 1.6 Onglet À faire

`BookingEditor.tsx` L2861–3000. Toujours visible, pastille = nombre de blocages.

Blocs, seulement s’il y a quelque chose : tâches venues du mail, passeports manquants (lien fiche), passeports qui expirent, formalités (`VisaSection`) et services (`ExtrasPanel`) s’il y a un vol et un compte, courriers hôtel encore ouverts, liens Little Emperors, annulation Little Emperors, enregistrement en ligne (`OnlineCheckinChecklist`), interrupteurs de services proposés au client (chauffeur, VIP Airport, enregistrement, visa → `ServiceOfferToggles`, colonnes `offer_*` sur `crm_bookings`).

### 1.7 Onglet Argent

Sept blocs (`BookingEditor.tsx` L2175–2857). L’aide d’onglet le dit : « Qui règle, prix, coûts, facture, compte du client et carte Pliant » (`booking-tabs.ts` L28).

1. **Qui règle et comment** (dans le formulaire `booking-meta`, enregistré par Enregistrer) :
   - Qui paie (autre fiche possible : `billing_customer_id`).
   - Société ou Particulier (`payer_kind`, `billing_company_id`).
   - L’agence encaisse **ou** le client règle l’hôtel (`client_settles_stay`).
   - Case « Ajouter le montant global au compte du client » (`include_in_ledger`), masquée si le client règle l’hôtel.
   - Frais d’agence, billeterie et dépenses : « Avec le séjour » ou « À part » (`fees_follow_stay`).
   - Société d’une dépense, si plusieurs sociétés (`StayBillingChoice`).
2. **Résumé** (`ReglementSummary`) : montant, commission, état, n° de facture, checklist.
3. **Prix et lignes vendues** : devise du séjour, commission 10 % / 7,5 % / 5 % / taux du compte (`AgencyFeeRateField`), dépenses (`BookingExpensesPanel`), remise (`BookingDiscountPanel`).
4. **Coûts du voyage** (`TripCostsBlock`) : ventes, coûts, marge, propositions à pointer. Les marges ne sont pas montrées au client.
5. **Facture MB3M** (`InvoiceBlock`) : préparer la pro forma `POST …/mb3m`, avoir seulement si `MB3M_ALLOW_CREDIT_NOTE` vaut `true`, envoi client (`InvoiceSendPanel`).
6. **Compte du client**, replié : même lecture que l’espace client, lien vers `/admin/transactions/client/[id]`. Pas de bouton Créditer ici.
7. **Carte Pliant** (`BookingCards`) : plafond, libellé, titulaire. `?tab=carte` et `?tab=pliant` arrivent ici.

Ce qui bloque une facture (`mb3mInvoiceBlocker`, `lib/crm/mb3m-invoice.ts` L388–427) : accès MB3M absent, séjour pas en euros, dates manquantes ou inversées, raison sociale ou adresse incomplète, aucune dépense au grand livre, activité MB3M non configurée. Le bouton reste désactivé avec la phrase, et « Enregistrez le séjour avant de facturer » si des modifications attendent (`InvoiceBlock.tsx` L73).

### 1.8 Onglet Historique

`ResponsableForm` (créé par, en charge) et `AgencyHistoryPanel` (`BookingEditor.tsx` L3003–3007).

### 1.9 Création

`NewBookingForm` ne fait qu’afficher `BookingIngest` en mode `create` (`components/admin/NewBookingForm.tsx` L9–18).

Deux entrées :

- Déposer PDF / photos → **Lire et remplir** → relecture → **Créer le dossier**.
- **Saisir à la main** : même relecture, carte vide.

Champs de tête (`BookingIngest.tsx` L860–924) : Client (obligatoire en création agence), Titre (obligatoire), Destination, Début, Fin, Montant du séjour (calculé, non saisissable), Devise. Puis les cartes `IngestItemCard` et les voyageurs à rattacher (L1050–1102). Le dossier créé reste Non visible. Redirection vers `/admin/reservations/[id]`.

### 1.10 Côté client

`/mon-compte/reservations/[reference]` charge `ClientStayRest` : tables du soir s’il y en a, encours à payer (Stripe / virement) si un reste est dû, itinéraire `CarnetItinerary`, services, pièces, passeports. Pas de saisie de dossier. L’annulation d’un hôtel Little Emperors n’apparaît que pour le titulaire, si l’annulation est gratuite et relue juste avant l’appel. Le lien public `/v/[code]` reprend la vue publiée, sans le roster hôtel.

### 1.11 Tables et relations

Schéma d’origine : `supabase/migrations/20260915093000_crm_schema.sql` L128–182.

```
crm_customers
  └─ crm_bookings (customer_id, restrict)
       ├─ crm_booking_items (cascade)
       ├─ crm_booking_travelers (cascade) ── companion_id → crm_travel_companions
       ├─ crm_booking_documents (cascade)
       ├─ crm_booking_cards (Pliant)
       ├─ crm_transactions (booking_id, set null)
       ├─ crm_booking_pay_links
       └─ crm_hotel_requests / messages (courriers)
crm_billing_companies ← billing_company_id, payer
crm_customer_balances (vue : crédits − débits posted)
```

Colonnes ajoutées ensuite sur `crm_bookings`, entre autres : `visible_to_client`, `prices_visible`, `billing_customer_id`, `billing_company_id`, `payer_kind`, `include_in_ledger`, `client_settles_stay`, `fees_follow_stay`, `agency_commission`, `agency_fee_rate`, `fee_mode`, `archived_at`, `offer_chauffeur`, `offer_greeter`, `offer_checkin`, `offer_visa`, `items_order_custom`, `remise_type`, `remise_value`, `share_code`. Le détail métier des cartes (PNR, chambres, passagers, prix du PDF, `client_hidden`, `needs_review`) vit dans `crm_booking_items.details` (jsonb), pas dans des colonnes.

Statut stocké (`supabase/migrations/20261007095000_booking_status_four.sql` L9–11) : `draft`, `quoted`, `confirmed`, `cancelled`. `quoted` est encore accepté par la base. L’écran ne le propose plus : un PATCH qui enverrait `quoted` est réécrit `draft` (`route.ts` L63). `travelling` et `completed` ont été migrés vers `confirmed`.

### 1.12 Statuts et transitions

Lecture unique : `dossierFace` (`lib/crm/dossier-status.ts` L23–28).

| Ce que l’agence voit | Colonnes | Geste |
|---|---|---|
| Non visible | `status=draft`, `visible_to_client=false` | Montrer au client |
| Visible | `status=confirmed`, `visible_to_client=true` | Cacher au client |
| Annulé | `status=cancelled`, caché | Rouvrir → Non visible |
| Archivée | `archived_at` renseigné | Réactiver |

Le déclencheur `crm_private.sync_dossier_face` (`supabase/migrations/20261104140000_dossier_trois_statuts.sql` L70–86) force les deux colonnes ensemble : `confirmed` implique montré, le reste (hors annulé) redevient brouillon caché.

Montrer (`setCarnetPublished`, `lib/crm/bookings.ts` L1083–1146) :

- Refuse s’il n’y a aucune carte métier (pas un simple frais, pas une dépense).
- Passe le séjour en Visible.
- Rend visibles les cartes non marquées `client_hidden`, et leurs pièces.
- Ne débite pas un séjour encore caché. Le débit part avec la visibilité (`bookingDebitIntent`, `lib/crm/bookings.ts` L195–210).
- Premier affichage : file WhatsApp `sejour:{id}` (`notifyStayPublished`, `lib/crm/concierge-send.ts` L749) et rappel des pièces manquantes (`route.ts` L244–246). La file attend la photo de couverture et le modèle Twilio.
- Séjour déjà montré : les cartes nouvellement visibles préparent un brouillon WhatsApp `carnet_ajout`, que l’agence envoie à la main.

Cacher retire les débits ouverts. Annuler les retire aussi (`status=cancelled` → intention `clear`). Archiver vide les charges du dossier (`syncBookingLedger`, L1011–1014).

Cacher ou Montrer **une carte** écrit tout de suite `client_hidden` et `visible_to_client`. Ce n’est pas le même geste que Cacher le séjour.

### 1.13 Appels et effets de bord

| Geste | Appel | Effet |
|---|---|---|
| Enregistrer la fiche | `PATCH /api/admin/bookings/[id]` | Colonnes méta, total recalculé, grand livre, dérivés hôtel (`route.ts` L47–264) |
| Enregistrer les étapes | `POST …/items` `{commit:true}` | Une transaction SQL pour créer / modifier / retirer (`items/route.ts` L375) |
| Montrer / cacher | même PATCH, `visible_to_client` | Publication, débit, WhatsApp |
| Annuler / rouvrir | PATCH `{status}` | Visibilité forcée à faux (L64–66) |
| Voyageur | `POST/DELETE …/travelers` | Frais de billeterie recalculés |
| Pièce | `POST/PATCH/DELETE …/documents` | Le DELETE retire aussi le fichier du bucket (`removeBookingDocument`, `lib/crm/booking-document-write.ts` L175–196) |
| Facture | `POST …/mb3m` | Pro forma chez MB3M, PDF dans les pièces. Le grand livre ne change pas (`InvoiceBlock.tsx` L38–39, L167–169) |
| Envoi facture | `GET` puis `POST …/facture` `{confirmer:true}` | E-mail et WhatsApp, RIB, lien Stripe s’il existe. Second envoi bloqué cinq minutes |
| Carte d’embarquement | `POST …/cartes-embarquement` | WhatsApp, un message par PDF, après confirmation |
| Pliant | `POST …/pliant` | Carte virtuelle, pas de PAN à l’écran |
| Courrier hôtel | bureau sur la carte hôtel | N’envoie qu’aux adresses cochées |
| Couverture | `POST/DELETE …/cover` | Photo du dossier |

Le PATCH fiche et le POST des étapes sont deux allers-retours : `persistSteps` puis le PATCH (`BookingEditor.tsx` L945–978). Si le second échoue, les étapes sont déjà écrites (le message le dit, L1040).

Le débit est aussi écrit par le déclencheur `crm_private.sync_booking_debit` (`supabase/migrations/20261007221000_stay_rollup_not_beside_cards.sql` L25–72), réactivé après la migration des trois statuts. Il poste un débit `kind=booking` sans `external_id` quand le séjour est montré, inclus au livre, pas réglé par le client, montant > 0, et qu’aucune carte ne couvre déjà le livre. L’application fait le même travail dans `syncBookingLedger` (débit séjour, frais de billeterie, débits de cartes, commission, remise).

## 2. Clics et champs des tâches courantes

Comptage depuis la liste des dossiers, pour un agent qui connaît déjà le client. Un champ facultatif laissé vide ne compte pas comme une saisie. « Clic » = action de souris ou validation, pas la frappe.

### Créer un dossier

**À la main, client existant, un hôtel.**

| Étape | Clics | Champs saisis |
|---|---|---|
| « + Nouveau dossier » | 1 | |
| « Saisir à la main » | 1 | |
| Choisir le client (ouvrir, chercher, valider) | 2–3 | 1 (le nom) |
| Titre | 0 | 1, obligatoire |
| Libellé de l’étape (type Hôtel déjà choisi) | 0 | 1, obligatoire |
| « Créer le dossier » | 1 | |

**Minimum : 5 à 6 clics, 3 saisies obligatoires.** Destination, dates et prix sont facultatifs à ce stade, mais un dossier sans prix ni dates ne pourra pas être facturé. Si l’agent remplit un hôtel crédible (dates, établissement, ville, prix vendu), on ajoute **4 champs**, toujours 1 clic de création.

**Depuis un PDF.** Déposer (1), Lire et remplir (1), relire, choisir le client si la lecture ne l’a pas reconnu (2–3), Créer (1). **4 à 6 clics**, et **10 à 20 champs déjà remplis** à contrôler (les grilles vol ou hôtel de `IngestItemCard`). Le prix du PDF et le prix vendu sont deux cases.

Le dossier naît Non visible. Le client ne reçoit rien.

### Ajouter un voyageur

| Situation | Clics | Champs |
|---|---|---|
| Titulaire pas encore sur le séjour | 1 (« Ajouter le titulaire », en-tête) | 0 |
| Compagnon déjà sur la fiche | 4 : onglet Client, liste, choix, Ajouter | 0 |
| Personne inconnue | Quitter le dossier, ouvrir la fiche, créer le compagnon (prénom, nom, souvent naissance), revenir, onglet Client, liste, Ajouter | **8 à 12 clics, 2 à 4 champs**, hors du dossier |

On ne peut pas taper « Camille Martin, 12/04/1990 » sur le séjour.

### Ajouter un hôtel ou un vol (dossier déjà ouvert)

| Étape | Clics | Champs |
|---|---|---|
| Onglet Voyage (déjà ouvert) | 0 | |
| « Ajouter une étape » | 1 | type Hôtel et dates proposés |
| Libellé | 0 | 1 obligatoire |
| Prix vendu, établissement ou n° de vol, si on les connaît | 0 | 2 à 8, tous facultatifs |
| Appliquer | 1 | |
| Enregistrer (en-tête) | 1 | |

**Minimum : 3 clics et 1 champ**, pour une carte presque vide. **Chemin utile hôtel : 3 clics et 4 à 6 champs**, mais **16 cases sont sous les yeux**. **Vol utile : 3 clics et 6 à 10 champs**, sur **environ 20 cases**, dont PNR, deux codes IATA, deux villes, prix document, devise, prix, nombre de billets.

Si le séjour est déjà Visible, la carte reste cachée tant qu’on ne clique pas Montrer sur la carte, ou Mettre à jour le carnet. Cela ajoute **1 à 2 clics**, et peut préparer un WhatsApp.

Déposer un PDF sur le dossier ouvert : Déposer, Lire, Ajouter au dossier. **3 clics** plus la relecture. Moins de saisie, même densité de champs à contrôler.

### Enregistrer un paiement

**Il n’y a pas de bouton « Encaisser » sur le dossier.** L’onglet Argent montre le compte, replié (L2813–2822), et un lien vers toutes les transactions.

Chemin réel pour un virement Revolut :

| Étape | Clics |
|---|---|
| Menu Argent (ou Revolut) | 1 |
| Repérer la ligne | 1 |
| Créditer (client déjà reconnu) | 1 |
| Confirmer | 1 |

**4 clics, 0 champ** si le rapprochement est unique. Si le payeur est ambigu : recherche du client en plus (**+2 clics, 1 champ**). Rien n’est crédité sans ce second clic. Un paiement Stripe dont le client est déjà la fiche peut se créditer seul ; l’e-mail seul reste une proposition.

Depuis le dossier, un novice cherche le paiement dans Argent du séjour et ne le trouve pas.

### Sortir une facture

Prérequis, souvent découverts au moment du blocage : séjour en euros, dates, adresse de facturation, séjour déjà montré (sinon aucune ligne au grand livre), modifications enregistrées.

| Étape | Clics | Champs |
|---|---|---|
| Onglet Argent | 1 | |
| Descendre jusqu’à « Facture MB3M » | 0 (scroll) | |
| Préparer | 1 | 0 si les prérequis sont verts |
| Valider / imprimer dans MB3M | hors CRM | |
| « Envoyer la facture et demander le paiement » | 1 | |
| Aperçu, puis Envoyer | 1 | lien Stripe facultatif |

**2 clics pour préparer une pro forma, 2 de plus pour l’envoyer, et un geste dans un autre logiciel pour qu’elle soit une facture.** 0 champ dans le cas idéal. Chaque prérequis manquant renvoie vers la fiche client ou vers l’onglet Voyage, sans liste unique des cases à cocher.

### Changer le statut

Il n’y a pas de liste déroulante. C’est voulu : les anciens libellés (À l’étude, Devis, Confirmée, En voyage, Terminée) ne sont plus à l’écran.

| Intention | Clics | Confirmation | Effet de bord |
|---|---|---|---|
| Montrer, rien en attente, au moins une carte | 2 (bouton, puis Confirmer) | Oui, avec la liste | Visible, débit, WhatsApp en file |
| Montrer alors qu’une modification attend | **1** (« Enregistrer et montrer au client ») | **Non** | Identique |
| Mettre à jour le carnet, rien en attente | 2 | Oui | Cartes encore cachées révélées, brouillon WhatsApp |
| Cacher le séjour | 2 | Oui | Le client ne le voit plus, débits retirés |
| Annuler | 3 (…, Annuler le dossier, confirmer) | Oui | Annulé, débits retirés |
| Rouvrir | 1 | Non | Non visible |
| Archiver | 2 (…, Archiver) puis confirmer dans le dialogue | Oui | Sort de la liste et du livre. Le bouton dit Archiver |
| Cacher une seule carte | 2 (menu de la carte, Cacher) | Non | Écrit tout de suite, sans message |

Le cas le plus courant après une saisie — on vient de modifier, on veut montrer — est celui qui **n’affiche pas** la liste « Le client verra ces éléments » (`BookingEditor.tsx` L1415–1424 et `saveAndShow` L1074–1083). Le chemin calme, sans modification en attente, l’affiche (L1863–1924).

## 3. Problèmes

### 3.1 Pour quelqu’un qui n’est pas à l’aise

**Deux enregistrements.** Appliquer range la carte dans la page. Enregistrer l’écrit. Le bandeau « Modifications non enregistrées » est juste, mais le mot Appliquer ne dit pas qu’il reste un second clic. Un novice croit que c’est fait, change d’onglet, et la barre fixe le lui rappelle trop tard.

**Trop de cases pour une étape.** Un hôtel utile, c’est un nom, des dates, un prix vendu. L’écran ajoute le prix du PDF, sa devise, le fournisseur, la pension, l’occupation, l’inclus, la case transactions, et une chambre vide. Le vol ajoute PNR et IATA, mots de métier aérien absents du vocabulaire d’un nouvel arrivant. Le libellé et le nom d’établissement font double emploi.

**Le prix est dit trois fois.** Prix document, prix (vendu), montant du séjour, puis dans Argent la commission, la remise, les frais de billeterie et « ajouter le montant global ». La phrase sous la case transactions prévient le double comptage (`IngestItemCard.tsx` L305–311) : c’est une règle d’expert écrite comme une aide.

**L’argent n’est pas une suite naturelle.** Qui paie, société ou particulier, l’agence ou le client, le montant global, les frais avec ou à part : quatre interrupteurs avant de voir « le client doit X € ». La facture s’appelle « Facture MB3M » et explique qu’elle se valide en l’imprimant dans MB3M (`InvoiceBlock.tsx` L164–169). MB3M, pro forma, grand livre, encours, activité 22, DIVERS TERRESTRE : le blocage est exact, le vocabulaire ne l’est pas pour un novice.

**Le paiement reçu est ailleurs.** Le dossier montre ce qui est dû. L’encaissement est dans Argent / Revolut / Stripe. Rien sur la fiche ne dit « pour noter un virement reçu, ouvrez Argent ».

**Le voyageur nouveau n’existe pas ici.** La liste ne propose que le foyer et les noms déjà lus. Créer Camille se fait sur une autre page, puis on revient. Le mot « compagnon » (L2021) n’est pas « autre voyageur ».

**Les statuts sont clairs, les boutons ne le sont pas.** Jusqu’à quatre actions d’en-tête en même temps (Enregistrer, Cartes d’embarquement, Enregistrer et montrer, Cacher, et …). « Mettre à jour le carnet » et « Enregistrer et mettre à jour le carnet » diffèrent d’un mot et d’une confirmation. « Annuler » sur le dialogue ferme la fenêtre ; « Annuler le dossier » annule le séjour (`BookingEditor.tsx` L1914–1921). Les deux sont l’un à côté de l’autre.

**Montrer sans récap.** C’est le geste qui envoie le séjour au client et au compte. Il est confirmé seulement quand rien n’a changé. Après une saisie, un seul clic suffit.

**Les informations utiles sont repliées ou renvoyées.** Notes, compte du client, lieu éditable seulement sans étape, identité seulement sur la fiche, passeport manquant seulement dans À faire. La pastille « Passeport Camille » ouvre À faire, qui renvoie encore à la fiche.

**Erreurs peu situées.** « Titre requis. » ne dit pas « nom de l’hôtel ». « Les étapes n’ont pas été enregistrées. Le séjour n’a pas changé. » est honnête mais n’indique pas le champ. Les erreurs Zod deviennent « valeur non conforme » (`lib/crm/booking-issues.ts` L57–58). « L’accès MB3M n’est pas configuré » ne dit pas à qui s’adresser.

**La pièce jointe part pour de bon.** La question dit « son fichier est supprimé » (`BookingEditor.tsx` L2458, L2471) et le code retire le fichier du bucket. Ailleurs, retirer une pièce du coffre est réversible et le fichier reste. Deux gestes voisins, deux conséquences. Un novice ne les distingue pas. Retirer une **étape**, en revanche, garde le fichier (`BookingItemsPanel.tsx` L1307).

**Anglais et sigles laissés à l’écran.** PNR, IATA, MB3M, Pliant, Stripe, VIP Airport, check-in dans les statuts d’enregistrement, `greeter` seulement en base. La voix de l’agence est française partout ailleurs.

### 3.2 Incohérences entre écrans

- Le lieu du dossier se saisit à la création et dans Voyage **tant qu’il n’y a pas d’étape**, puis devient une lecture calculée. Deux sources, une seule visible à la fois.
- Le titre suivi des villes se réécrit tout seul tant que l’agence n’a pas saisi autre chose (`syncBookingTitleFromSteps`, `lib/crm/bookings.ts` L1032–1060). Le champ en-tête peut donc changer après Enregistrer.
- `quoted` existe en base et dans `BOOKING_STATUSES` (`lib/crm/types.ts` L3) mais plus à l’écran. Un devis Little Emperors est un séjour Non visible.
- La contrainte d’origine des types d’étape était plus courte que la liste actuelle. La contrainte à jour est celle de la migration accueil VIP. Un type envoyé hors liste est refusé au POST, avec un message technique si la contrainte parle.
- Cacher une carte est immédiat. Cacher le séjour demande une confirmation. Retirer une carte attend Enregistrer. Trois voisinages, trois rythmes.
- L’aperçu client (menu …) et « Voir comme le client » (nouvel onglet) et le lien public `/v/` sont trois façons de « voir ce que le client voit ».

### 3.3 Fiabilité côté serveur

**Deux moteurs de débit.** Le déclencheur Postgres et `syncBookingLedger` décident tous les deux du débit séjour. Ils partagent les mêmes drapeaux (montré, inclus, pas réglé par le client), et le déclencheur s’efface si une carte couvre déjà le livre. Le risque n’est pas un double montant systématique : c’est une règle dupliquée. Une évolution de l’un (remise, frais, `amount_is_total`, aller-retour compté une fois) peut diverger de l’autre sans test commun.

**Pas une seule transaction métier.** Étapes (`POST …/items`, transaction SQL annoncée L375 de la route) puis fiche et livre (`PATCH`) sont séquentiels. Échec du second : cartes écrites, total ou débit pas à jour, message explicite mais données déjà parties.

**Le jsonb `details` n’est pas contraint.** PNR, chambres, passagers, prix du PDF, drapeau « prix déjà total », `client_hidden` : pas de schéma SQL. Deux chemins (import, saisie, MCP) peuvent écrire des formes différentes. La validation Zod de l’import ne protège pas un PATCH de carte incomplet.

**`quoted` orphelin.** La contrainte l’accepte. L’écran et le PATCH le ramènent à `draft`. Un import ou un outil qui poserait `quoted` sans `visible_to_client` resterait Non visible, ce qui est le bon effet, mais le mot reste une quatrième valeur morte.

**Frais de billeterie sensibles au nombre de voyageurs.** Ajouter ou retirer un voyageur relance le livre (`travelers/route.ts` L79). Un ajout « pour voir » sur un séjour déjà montré change le dû, sans le dire sur le bouton Ajouter.

**Publication et message.** `notifyStayPublished` est après l’écriture (`route.ts` L244), dans `safeConcierge` : un échec d’envoi ne revient pas en arrière sur le Visible. C’est assumé (la file reprend). L’écran dit « Le client voit ce séjour » même si le WhatsApp attend encore la photo. Le bandeau ne distingue pas « visible » et « prévenu ».

**Performance.** `BookingEditor.tsx` fait 3 012 lignes, tout le dossier est un composant client. L’ouverture lance le bloc critique puis six promesses différées (e-mails, activité, WhatsApp, ESTA, Pliant, argent) plus le livre et les hôtels (`page.tsx` L39–84). Le premier onglet Voyage n’a pas besoin du fil WhatsApp ni du solde Pliant. Un dossier chargé d’hôtels et de courriers attend l’enrichissement avant que les cartes soient complètes (`deferredItems`).

**Bugs probables, déjà lisibles dans le code.**

- Montrer en un clic sans récap quand `unsaved` est vrai (L1415–1424).
- Le bouton du dialogue s’appelle Annuler à côté de Annuler le dossier (L1914–1921).
- « Prix document » s’affiche en erreur visuelle si le montant imprimé manque (`IngestItemCard.tsx` L120–121, L196–197) alors que `documentPriceIssues` retourne toujours une liste vide (`booking-issues.ts` L89–95) : la case a l’air obligatoire et ne bloque pas l’enregistrement.
- Rouvrir n’a pas de confirmation, contrairement à Annuler. C’est moins dangereux (on revient à caché) mais le séjour annulé réapparaît dans la liste sans second clic.
- Le retrait d’une pièce supprime le fichier ; le retrait d’une étape le garde. L’inverse de ce qu’un agent pressé devine (on « retire la carte », on croit le PDF en sécurité, et c’est vrai ; on « retire la pièce », et le PDF disparaît).

## 4. Améliorations priorisées

Échelle : impact pour un novice, effort de réalisation, risque de casser un flux déjà juste (débit, WhatsApp, facture).

### 1. Un seul bouton « Montrer », toujours avec le récap

- **Problème.** Deux libellés (« Montrer » / « Enregistrer et montrer ») et le second saute la liste de ce que le client verra (`BookingEditor.tsx` L1415–1424, L1074–1083).
- **Pourquoi c’est gênant.** C’est le geste qui rend le séjour visible, le met au compte et prépare le WhatsApp. Il arrive juste après la saisie, quand on est le moins sûr.
- **Solution.** Quel que soit l’état « non enregistré », le bouton principal ouvre le panneau déjà écrit (L1863–1924) : liste des étapes, mention « vos modifications seront enregistrées », puis un seul « Montrer au client ». Enregistrer reste à côté, sans montrer. « Mettre à jour le carnet » devient la même fenêtre, titre « Le client verra aussi ».
- **Fichiers.** `components/admin/BookingEditor.tsx`, `lib/crm/staff-stay.ts` (`primaryStayButton`, L515–525).
- **Impact** fort. **Effort** faible. **Risque** faible si le panneau existant est réutilisé tel quel.

### 2. Carte en quatre champs, le reste replié

- **Problème.** 16 à 20 champs pour un hôtel ou un vol, un seul obligatoire.
- **Pourquoi.** L’œil ne sait pas par où commencer. PNR, IATA, prix document et devise ressemblent à des obligations.
- **Solution.** Bandeau : Type, Nom, Du / Au, Prix vendu. Lien « Préciser » ouvre référence, fournisseur, chambre, vols (n° , aéroports, classe), prix imprimé. Le prix imprimé ne s’affiche en alerte que s’il sert à quelque chose ; aujourd’hui il ne bloque pas (`booking-issues.ts` L89–95). Libellés : « Référence du billet » à la place de PNR, « Aéroport de départ / d’arrivée » à la place d’IATA, codes en exemple dans le placeholder.
- **Fichiers.** `components/crm/IngestItemCard.tsx` L167–349, `components/admin/BookingItemsPanel.tsx` (brouillon vide L71–80).
- **Impact** fort. **Effort** moyen (le formulaire sert aussi à la relecture PDF : les champs lus restent visibles s’ils sont remplis, repliés s’ils sont vides). **Risque** faible.

### 3. Appliquer écrit, ou disparaît

- **Problème.** Appliquer puis Enregistrer (`BookingItemsPanel.tsx` L993–999 et L640–681).
- **Pourquoi.** On croit avoir sauvé. Le second clic est en haut de page, parfois seulement dans la barre fixe.
- **Solution.** Le bouton de la carte s’appelle « Enregistrer l’étape » et appelle `flushSteps` tout de suite. Le bandeau du séjour ne s’allume plus pour une carte déjà postée. Enregistrer en-tête ne garde que le nom, les notes, qui paie.
- **Fichiers.** `BookingItemsPanel.tsx` `keepDraft` / `flushSteps`, `BookingEditor.tsx` `persistSteps` (L945–958).
- **Impact** fort. **Effort** faible à moyen. **Risque** faible : le POST existe déjà.

### 4. Ajouter un voyageur sans quitter le dossier

- **Problème.** La liste ne crée personne (`BookingEditor.tsx` L2531–2559, `travelers/route.ts` L18–26).
- **Pourquoi.** Pour un groupe, chaque personne nouvelle est un aller-retour fiche / dossier. On abandonne ou on met tout le monde sous le nom du titulaire.
- **Solution.** Sous la liste : « Nouvelle personne » → prénom, nom, date de naissance. Un seul bouton « Ajouter au séjour ». Le serveur crée le compagnon sur la fiche puis la ligne voyageur, et prévient en une phrase si les frais de billeterie changent (« +25 € de frais de billets »).
- **Fichiers.** `BookingEditor.tsx` L2496–2570, `app/api/admin/bookings/[id]/travelers/route.ts`, création compagnon déjà utilisée sur la fiche (`components/admin/CustomerEditor.tsx`).
- **Impact** fort. **Effort** moyen. **Risque** moyen (doublon de personne : réutiliser `sameRecordedTraveler`, déjà appelé L60–64).

### 5. Encaisser depuis le dossier

- **Problème.** Le crédit est dans Argent / Revolut (`components/admin/RevolutInbox.tsx`), pas sur le séjour. Le compte du dossier est replié (`BookingEditor.tsx` L2813).
- **Pourquoi.** « J’ai reçu le virement de ce client » est la question posée en tenant le dossier ouvert.
- **Solution.** Bloc toujours ouvert : « Reçu sur ce séjour » / « Reste à recevoir ». S’il existe un virement ou un paiement Stripe proposé pour ce client, une ligne « 4 200 € de Dupont — Créditer » reprend le même dialogue de confirmation que la file Argent. Aucun crédit sans ce clic. Pas de saisie libre d’un montant inventé.
- **Fichiers.** `BookingEditor.tsx` onglet Argent, `components/admin/RevolutInbox.tsx`, `components/admin/StripeInbox.tsx`, routes de crédit existantes.
- **Impact** fort. **Effort** moyen. **Risque** moyen (argent) : réutiliser le clic déjà gardé, ne pas créer un second chemin qui créditerait sans confirmation.

### 6. Facture dite en français, avec la liste de ce qui manque

- **Problème.** Titre « Facture MB3M », validation « dans MB3M », blocages techniques (`InvoiceBlock.tsx` L164–169, `mb3m-invoice.ts` L388–427).
- **Pourquoi.** On ne sait pas si le bouton prépare, envoie ou comptabilise. Un refus (« activité MB3M », « aucune dépense au grand livre ») ne dit pas le geste suivant.
- **Solution.** Titre « Facture ». Sous-titre : « Prépare une pro forma. Elle devient une facture quand elle est validée dans l’outil comptable. » Au-dessus du bouton, quatre cases : dates, adresse, séjour montré, montant au compte. Chaque case rouge est un lien vers le champ. Le mot MB3M passe en détail secondaire pour qui doit dépanner.
- **Fichiers.** `components/admin/InvoiceBlock.tsx`, `components/admin/InvoiceSendPanel.tsx` L92–98, `lib/crm/mb3m-invoice.ts` `mb3mInvoiceBlocker`.
- **Impact** fort. **Effort** faible pour les libellés et la checklist, moyen si on relie chaque case à un champ. **Risque** faible : on ne change pas l’appel `POST …/mb3m`.

### 7. Argent : une phrase, les interrupteurs repliés

- **Problème.** Quatre réglages avant le montant (`BookingEditor.tsx` L2175–2349).
- **Pourquoi.** Société, particulier, « part de l’encours », « montant global », « frais à part » : on peut décocher le dû sans le vouloir.
- **Solution.** Phrase fixe : « {Nom} doit {montant}. L’agence encaisse. » Lien « Changer qui paie ou ce qui est compté » ouvre les interrupteurs actuels, valeurs par défaut inchangées (agence encaisse, société de la fiche si elle est unique, frais avec le séjour, montant global inclus).
- **Fichiers.** `BookingEditor.tsx` L2175–2350, `lib/crm/payer.ts`.
- **Impact** fort. **Effort** faible. **Risque** moyen : ne pas changer les défauts déjà écrits en base, seulement ce qui est ouvert.

### 8. Un seul moteur pour le débit du séjour

- **Problème.** Déclencheur `sync_booking_debit` et `syncBookingLedger` (`lib/crm/bookings.ts` L1005–1024, migration `20261007221000_stay_rollup_not_beside_cards.sql`).
- **Pourquoi c’est gênant pour un novice.** Rien à l’écran, jusqu’au jour où le compte ne correspond pas au prix affiché. Là, personne ne sait lequel des deux a raison.
- **Solution.** Laisser l’application décider (elle connaît déjà cartes, frais, remise, aller-retour). Le déclencheur ne fait plus qu’interdire un débit orphelin à la suppression du dossier, ou il est retiré après vérification que chaque cas du déclencheur a un test côté `bookingDebitIntent`. Pas les deux en écriture.
- **Fichiers.** `lib/crm/bookings.ts`, `supabase/migrations/` (nouvelle migration, hors de cet audit), tests livre existants.
- **Impact** fort sur la fiabilité. **Effort** moyen. **Risque** fort : à faire avec les tests de débit déjà en place, pas en même temps qu’un changement d’écran.

### 9. Enregistrer le séjour en un seul passage

- **Problème.** `persistSteps` puis PATCH (`BookingEditor.tsx` L972–978). Deux commits.
- **Pourquoi.** Une erreur au second temps laisse des cartes sans le prix ou le payeur que l’on vient de choisir. Le message le dit ; la page, elle, est à moitié sauvée.
- **Solution.** Une route « sauver le dossier » qui écrit étapes, méta et livre dans une transaction, et répond soit tout, soit rien. Le bouton Enregistrer et le bouton Montrer l’appellent.
- **Fichiers.** `app/api/admin/bookings/[id]/route.ts`, `app/api/admin/bookings/[id]/items/route.ts` (`applyStayCommit`), `lib/crm/stay-commit.ts`.
- **Impact** fort sur la fiabilité. **Effort** moyen. **Risque** moyen.

### 10. Alléger l’ouverture du dossier

- **Problème.** Tout le `BookingEditor` arrive d’un bloc, avec six chargements différés même sur l’onglet Voyage (`page.tsx` L55–84, `BookingEditor.tsx` L1583–1603).
- **Pourquoi.** La page met du temps à devenir sûre. Les phrases « pas lisible pour le moment » ressemblent à une panne.
- **Solution.** Le serveur de l’onglet Voyage ne charge que étapes, pièces et en-tête. Client, À faire, Argent et Historique se chargent au premier clic sur l’onglet (l’URL `?tab=` le permet déjà). Remplacer « n’est pas lisible » par un squelette tant que la promesse n’est pas là.
- **Fichiers.** `app/admin/reservations/[id]/page.tsx`, `lib/crm/admin-booking-load.ts`, `lib/crm/admin-booking-shell.ts`, `BookingEditor.tsx`.
- **Impact** moyen (confort, confiance). **Effort** moyen. **Risque** faible si l’URL d’onglet reste la source.

### Hors du top 10, à garder en vue

- Retrait de pièce : même règle que le coffre (fichier conservé, restauration) **ou** une phrase plus dure (« Le PDF sera effacé, sans retour »). Aujourd’hui la phrase et le code sont alignés entre eux (`booking-document-write.ts` L175–196) et désalignés du retrait d’étape.
- Création : ajouter le titulaire tout seul au moment de « Créer le dossier », puisqu’un bouton le redemande dès l’ouverture si la liste est vide (`BookingEditor.tsx` L1697–1705).
- Renommer le bouton « Annuler » du dialogue en « Revenir ».
- Ne pas réécrire le titre tout seul une fois le dossier ouvert : proposer « Reprendre les villes » au lieu de changer le champ sous la main (`syncBookingTitleFromSteps`).

## 5. Parcours cible en trois étapes

Pour un séjour nouveau, un agent qui ne connaît pas l’outil.

**1. Qui.** Un champ : le client. S’il existe, on le choisit. S’il n’existe pas, prénom, nom, téléphone — la fiche se crée sans invitation. Le titulaire est voyageur, sans bouton « Ajouter le titulaire ».

**2. Quoi.** Soit on dépose les confirmations, soit on dit une ligne par prestation : Hôtel, « Cheval Blanc », du 12 au 15 juin, 4 800 €. Vol : « Air France Paris → Rome », 3 juin, 1 200 €. Rien d’autre n’est demandé. La lecture PDF remplit ces quatre cases et range le reste en « Préciser », déjà rempli, à ouvrir seulement si une pastille « À vérifier » est là.

**3. Montrer.** Un écran récap : voyageurs, étapes, prix, « le client verra ceci et sera prévenu ». Un bouton. Avant ce clic, le dossier est simplement « en préparation » (le mot Non visible peut rester, à côté de la phrase « le client ne voit rien »).

Après ces trois étapes, seulement si on en a besoin :

- Noter un virement : sur le même écran, la ligne proposée, un clic Créditer.
- Facture : le bouton n’apparaît en plein que lorsque les quatre cases (dates, adresse, montré, montant) sont vertes. Sinon il dit laquelle manque.
- Passeport, formalité, hôtel à écrire, carte de paiement hôtel : l’onglet À faire, une ligne = un geste.

L’historique, la commission, la société, « le client règle l’hôtel », la devise du PDF, Pliant, MB3M : présents, fermés, pour le second passage ou pour l’expert.

## 6. Quick wins (moins d’une journée)

Chacun tient dans des libellés, un repli ou le branchement d’un panneau déjà écrit. Aucun ne change le schéma.

1. **Récap avant chaque « montrer ».** Brancher `saveAndShow` sur `setConfirm("publish")` au lieu de publier direct. Fichiers : `BookingEditor.tsx` L1415–1424. Le panneau L1863 existe.
2. **« Revenir » à la place d’« Annuler »** sur les dialogues de confirmation (`BookingEditor.tsx` L1916–1921). Évite d’annuler le séjour en voulant fermer la fenêtre.
3. **Renommer Appliquer en « Ajouter au séjour »** et une ligne sous le bouton : « Puis Enregistrer, en haut, pour le garder. » En attendant le quick win n° 3 de fond (écriture immédiate). Fichier : `BookingItemsPanel.tsx` L993–999.
4. **Replier par défaut** prix document, devise du document, fournisseur, pension, occupation, inclus, case transactions, dès qu’ils sont vides. Les laisser ouverts s’ils viennent d’un PDF. Fichier : `IngestItemCard.tsx`.
5. **Libellés.** PNR → « Référence du billet ». IATA départ / arrivée → « Aéroport de départ / d’arrivée ». Titre du bloc facture → « Facture », MB3M en phrase secondaire. Fichiers : `IngestItemCard.tsx` L174, L330–334, `InvoiceBlock.tsx` L164–169.
6. **Phrase d’argent en tête d’onglet.** « {client} · {montant} · pas encore montré » ou « au compte du client », au-dessus des interrupteurs, sans les déplacer. Fichier : `BookingEditor.tsx` L2175.
7. **Titulaire automatique** à la création du dossier, dans `from-ingest`, pour ne plus afficher « Ajouter le titulaire » sur un dossier vide. Fichiers : route `app/api/admin/bookings/from-ingest/route.ts`, garde déjà présente côté voyageurs.
8. **Pastille passeport → fiche, ancre voyageurs**, plutôt qu’À faire qui renvoie encore une fois. `staffBlockingChips` (`lib/crm/staff-stay.ts` L93–95) peut porter un lien direct.
9. **Squelette à la place de « n’est pas lisible pour le moment »** sur les blocs Argent encore en promesse (`BookingEditor.tsx` L2763–2766, L2842).
10. **Avertissement frais de billets** sur le bouton Ajouter un voyageur, si le séjour a déjà un vol et est montré : « Ajouter une personne ajoute 25 € de frais. » Le calcul existe (`refreshTicketingFee` dans `travelers/route.ts` L79).

## Fichiers cités

- `app/admin/reservations/page.tsx`
- `app/admin/reservations/nouveau/page.tsx`
- `app/admin/reservations/[id]/page.tsx`
- `app/mon-compte/reservations/[reference]/page.tsx`
- `app/v/[code]/page.tsx`
- `app/api/admin/bookings/[id]/route.ts`
- `app/api/admin/bookings/[id]/items/route.ts`
- `app/api/admin/bookings/[id]/travelers/route.ts`
- `app/api/admin/bookings/[id]/documents/route.ts`
- `components/admin/BookingEditor.tsx`
- `components/admin/BookingItemsPanel.tsx`
- `components/admin/NewBookingForm.tsx`
- `components/admin/InvoiceBlock.tsx`
- `components/admin/InvoiceSendPanel.tsx`
- `components/admin/BookingsTable.tsx`
- `components/crm/BookingIngest.tsx`
- `components/crm/IngestItemCard.tsx`
- `components/crm/TripPassportPicker.tsx`
- `lib/crm/booking-tabs.ts`
- `lib/crm/staff-stay.ts`
- `lib/crm/dossier-status.ts`
- `lib/crm/bookings.ts`
- `lib/crm/carnet.ts`
- `lib/crm/booking-issues.ts`
- `lib/crm/booking-document-write.ts`
- `lib/crm/mb3m-invoice.ts`
- `lib/crm/concierge-send.ts`
- `lib/crm/types.ts`
- `supabase/migrations/20260915093000_crm_schema.sql`
- `supabase/migrations/20261007095000_booking_status_four.sql`
- `supabase/migrations/20261007221000_stay_rollup_not_beside_cards.sql`
- `supabase/migrations/20261019161000_booking_item_kind_accueil_vip.sql`
- `supabase/migrations/20261104140000_dossier_trois_statuts.sql`
