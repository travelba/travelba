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
- **Dépense libre** (`expense`) : hors timeline, hors calendrier, hors publication. Elle vit dans les transactions (skill `travelba-money`).

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

La photo = **la ville / station d’arrivée**, jamais le hub de départ.

- `coverQuery` (`lib/crm/carnet.ts`) : premier token qui n’est **pas** Paris / CDG / ORY / LBG / BVA / France. `Paris · Marrakech` → Marrakech. `CDG → RAK` → RAK. `Avoriaz - Haute Savoie` → Avoriaz.
- **Interdit** : photo de Paris sur un séjour Avoriaz. Le vol part souvent de CDG — ce n’est pas la destination. Avoriaz n’est pas Zermatt. Marrakech n’est pas une photo générique du Maroc. Panama n’est pas Miami.
- Catalogue (`lib/crm/cover-catalog.ts`) : jeton d’arrivée entier. **Une seule ville** : photo de ce lieu, sinon le pays. Provence sans photo de ville → France. Florence → Italie. Venise garde sa photo. Pays sans photo vérifiée : fond marine, pas une image d’un autre pays.
- **Plusieurs destinations** (`stayArrivalPlaces`, hôtels d’abord, sinon l’arrivée de vol, sinon le libellé). Deux villes qui ont **chacune** leur photo : diagonale des deux, et le titre liste les deux villes si le nom saisi n’en cite qu’une. New York et Miami Beach → les deux photos, titre « New York · Miami Beach ». Une ville sans photo propre : photo du **pays**. Marrakech et Essaouira → Maroc. Un nom choisi (« 40 ans ») n’est pas remplacé.
- **Plusieurs pays** : les deux premières photos de pays, coupées en diagonale (`bookingCoverPlan` mode `split`). Un pays sans photo vérifiée ne fabrique pas la seconde moitié.
- **Ville sans photo** : photo du **pays**, toujours. Le pays vient du catalogue de la ville, sinon des autres jetons du libellé et du titre (`Ville · Pays` et `Ville, Pays`). `Inconnue · Portugal` et un hôtel dont la ville est inconnue avec ce libellé → Portugal. Fond marine seulement si ce pays n’a pas de photo vérifiée (Belgique). Paris / CDG / France ne fabriquent pas un second pays. Une ville qui a sa photo la garde : Antibes, Lamego, Venise, Marrakech, Avoriaz. Test : `unsplashKeywordMatch`.
- Import agence seulement : `cover_image_path` (`POST/DELETE /api/admin/bookings/[id]/cover`, WebP 1600×900). L’URL porte `?v=` = `updated_at`. Sinon le catalogue gagne.
- **Chaque photo** ajoutée au catalogue, ville ou pays, est une photo réelle **puis** retouchée avant le commit. Un recadrage brut n’est pas une couverture : il sort du thème. Retouche `gpt-image-1` (`coverRetouchPrompt`) : magazine, lumière dorée, lieu reconnaissable, gens lointains. Pas d’invention depuis le nom. Lamego : l’escalier des Remédios, retouché, pas le JPEG d’origine. Catalogue : `/api/covers/{id}` (fichier `public/covers` ou bucket `covers/catalog`). Échec après un retry : ne pas enregistrer l’original — photo de pays déjà retouchée, sinon fond marine. Pas Unsplash brut. Import : retouche puis enregistrement direct, cache `covers/retouched/{sourceId}`. **Autre version** régénère le fichier partagé du catalogue, ou la couverture du dossier. Crédit masqué. Les fichiers déjà retouchés ne sont pas relancés tout seuls. Pas de retouche au chargement client.
- **Importer une photo** : recherche de la ville d’arrivée (photos libres, paysage) puis sélection, ou fichier local. CC BY → `cover_credit` sous la photo. Le client ne cherche pas.
- `<BookingHero>` + `<CoverPhoto>` img natif. Si l’import casse, repli sur la photo du lieu, puis du pays, puis le fond marine. Puppeteer : `domcontentloaded` — skill verify.

## Fichiers séjour

Max **30 fichiers / 25 Mo**. Via `/api/files`. PDFs invisibles tant que non publiés.
