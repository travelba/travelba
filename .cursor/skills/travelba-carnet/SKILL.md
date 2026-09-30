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
- Ordre : `sort_order` agent (déplacer la carte, sans flèches), défaut **chrono**. PATCH `{ order: [ids] }` sur `/api/admin/bookings/[id]/items`.
- Kinds : `flight` `hotel` `transfer` `activity` `rail` `car` `cruise` `insurance` `fee`. Train / voiture / bateau = cartes métier, pas un jour par escale bateau.
- **Dépense libre** (`expense`) : hors timeline, hors calendrier, hors publication du carnet. Sur `/mon-compte/reservations/[reference]`, section **Dépenses** (libellé + montant), sous le montant du séjour. Elle vit aussi dans les transactions (skill `travelba-money`).
