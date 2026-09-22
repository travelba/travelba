---
name: travelba-carnet
description: >-
  Travelba carnet (itinerary): save vs publish, hotel nights repeat, IATA +
  city, drag order, selling price, skip empty days, no invented hours, client
  ingest 404, copy l’agence. Use when editing bookings, timeline, ingest
  review, BookingEditor, CarnetItinerary, or visible_to_client.
---

# Travelba — carnet

Cœur produit. Admin = mêmes cartes que le client, densité pro.
La **qualité des cartes** vient de l’import : skill `travelba-document-ingest` (PDF → items honnêtes, fusion, pas de net).
Code : `lib/crm/carnet.ts`, `lib/crm/bookings.ts`, `components/admin/BookingEditor.tsx`,
`components/admin/BookingItemsPanel.tsx`, `components/crm/IngestItemCard.tsx`,
`components/account/CarnetItinerary.tsx`.

## Enregistrer ≠ Publier

| Geste | Effet |
|-------|--------|
| **Enregistrer** | brouillon, `visible_to_client=false` sur le séjour |
| **Publier** | le client voit ; items + PDFs du dossier passent visibles |

Un seul interrupteur séjour (plus de case fichier séparée). Guard serveur `canPublishCarnet` : au moins **une** carte `kind !== "fee"`.

Quotes (`status=quoted`, devis Little Emperors) : dans le dossier, **invisibles** jusqu’à publication / confirmation. Pas d’écran Devis public. Pas d’e-mail auto à la publication.

Accueil `/mon-compte` = prochain séjour, **même** `CarnetItinerary` que le détail.

## Timeline

- Grouper par jour (`groupByDay`). **Hôtel et location** répétés chaque jour de stay (`stayNightDates` : start inclus, fin **exclue**). Vol = jour de départ.
- Jours **sans aucune** carte : **sautés** (pas de ligne vide entre deux villes).
- Hôtel : **pas d’horloge**. `itemClock` ignore `T00:00:00` (timestamptz minuit ≠ 00h00 check-in). Carte compacte : **nom d’établissement** (`details.hotel_name` / `hotelDisplayName`) en titre, **ville** (`hotelCityLine`) en dessous. Jamais la ville à la place du nom.
- Vol : ligne 1 `CDG → RAK` (`flightIata`), ligne 2 villes (`flightCities`).
- Clic carte = détail + **Voir la confirmation** (PDF `source_document_id`) + **Ajouter à l’agenda** (.ics).
- En-tête itinéraire : **Ajouter tout le séjour** (`GET /api/client/bookings/[reference]/calendrier`). Horaires seulement s’ils existent ; hôtel = journée entière.
- Ordre : `sort_order` agent (drag / monter-descendre), défaut **chrono**. PATCH `{ order: [ids] }` sur `/api/admin/bookings/[id]/items`.
- Kinds : `flight` `hotel` `transfer` `activity` `rail` `car` `cruise` `insurance` `fee`. Train / voiture / bateau = cartes métier, pas un jour par escale bateau.

## Prix

- Prix vendu (`item.amount`) : **uniquement le premier jour** de l’événement (check-in hôtel, départ vol, prise en charge location). Les nuits / jours suivants gardent la carte, sans recompter le montant.
- **Vols** : plusieurs e-tickets du même segment = **une** carte, `details.ticket_count`. `item.amount` = **prix unitaire par billet**. Affichage `5 × 250 €`, total séjour = unitaire × billets. Aller-retour : saisir le prix sur **un** vol.
- Carte vol compacte : **IATA** (`CDG → RAK`) en titre, villes en dessous. Prix **sous** la route en mobile (pas à droite : ça déborde).
- **Montant du séjour** (`booking.total_amount`) = somme des prix vendus des cartes dès qu’un `item.amount > 0` (vols : unitaire × billets). Sinon saisie manuelle / total import.
- `item.amount` extrait = **null** (jamais le net fournisseur sur la carte client).
- Montant PDF → `details.document_amount` (relecture agent). `sanitizeExtractedPrices` **préremplit** `total_amount` = somme **un montant par fichier**. Un extract à 0 ne masque pas cette somme.
- **Enregistrer** un extract `document_status=confirmed` : écrit `booking.total_amount` et passe le dossier en **confirmé** (toujours `visible_to_client=false` jusqu’à Publier) → `syncBookingLedger` poste le débit + frais billeterie.
- Devis (`quote`) : montant proposé, statut `quoted`, **pas** de débit.
- Inclus (`details.included`) **seulement si la phrase est écrite**. Pas de petit-déj inventé. Sinon pas de bloc Inclus.
- N’extraire **pas** annulation / barème / conditions : le PDF suffit.

## Cartes

- **Un hôtel** par établissement même si 2 chambres / 2 réf. → `details.rooms[]`. `title` = nom d’hôtel, pas la ville.
- **Séjour complet** : forfaits, matériel, cours, assurance = cartes à part (`activity` / `insurance`), pas un bloc Inclus de l’hôtel. Activités **une fois** le jour d’arrivée (l’hôtel se répète les nuits).
- Cartes **à la main** autorisées (mêmes types que l’ingest).
- Réimport **même réf.** (vol : réf. + n° + date) = **remplace** la carte, n’ajoute pas un doublon.
- Illisible : on **enregistre** + bandeau **À vérifier** (`details.needs_review`), pas un refus global.
- Check-in / horaires absents = **rien** (pas « 15:00 », pas « non indiqué »).
- Copy client : **l’agence**. Modifier un séjour : WhatsApp `Bonjour, je voudrais modifier {réf} — {destination}.` (`whatsappModifyHref`).
- Conciergerie 24/7 WhatsApp — **pas** de cloche de notif fictive.

## Visibilité / ingest client

APIs `app/api/client/bookings/ingest` et `from-ingest` = **404** (« L’import se fait uniquement par l’agence. »). Ne pas les réactiver.

RLS : le client ne `select` que `visible_to_client`. Preview admin ≠ URL client.

## Couverture

`coverQuery` = **ville d’arrivée** : on ignore Paris / CDG / ORY s’il y a une autre ville (`Paris · Marrakech` → Marrakech). Unsplash (`lib/crm/covers.ts`) puis IA si besoin. `<CoverPhoto>` img natif, repli Unsplash si `/api/files` casse. En Puppeteer, Unsplash peut casser `networkidle0` — skill verify.

## Fichiers séjour

Max **30 fichiers / 25 Mo**. Via `/api/files`. PDFs invisibles tant que non publiés.
