---
name: travelba-carnet
description: >-
  Travelba carnet (itinerary): save vs publish, hotel nights repeat, IATA +
  city, drag order, selling price, skip empty days, no invented hours, client
  ingest 404, copy l’agence, arrival-city cover, stale cover.webp. Use when editing bookings, timeline, ingest
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
| **Visible dans l’espace** | le client voit ; items + PDFs du dossier passent visibles. L’UI dit ça, pas un second verbe « Publier ». |

Un seul interrupteur séjour (plus de case fichier séparée). Guard serveur `canPublishCarnet` : au moins **une** carte `kind !== "fee"`.

Quotes (`status=quoted`, devis Little Emperors) : dans le dossier, **invisibles** jusqu’à publication / confirmation. Pas d’écran Devis public. Pas d’e-mail auto à la publication.

Accueil `/mon-compte` = prochain séjour, **même** `CarnetItinerary` que le détail.

## Timeline

- Grouper par jour (`groupByDay`). **Hôtel répété chaque nuit** de stay (`stayNightDates` : start inclus, checkout **exclu**).
- Jours **sans aucune** carte : **sautés** (pas de ligne vide entre deux villes).
- Hôtel : **pas d’horloge**. `itemClock` ignore `T00:00:00` (timestamptz minuit ≠ 00h00 check-in).
- Vol : ligne 1 `CDG → RAK` (`flightIata`), ligne 2 villes (`flightCities`).
- Clic carte = détail + **Voir la confirmation** (PDF `source_document_id`).
- Ordre : `sort_order` agent (drag / monter-descendre), défaut **chrono**. PATCH `{ order: [ids] }` sur `/api/admin/bookings/[id]/items`.
- Kinds : `flight` `hotel` `transfer` `activity` `rail` `car` `cruise` `insurance` `fee`. Train / voiture / bateau = cartes métier, pas un jour par escale bateau.

## Prix

- `sanitizeExtractedPrices` : `total_amount` et `item.amount` extraits = **null**.
- **Prix vendu** saisi par l’agent (total dossier). Jamais le net PDF ($858…) sur la carte client.
- Inclus (`details.included`) **seulement si la phrase est écrite**. Pas de petit-déj inventé. Sinon pas de bloc Inclus.
- N’extraire **pas** annulation / barème / conditions : le PDF suffit.

## Cartes

- **Un hôtel** par établissement même si 2 chambres / 2 réf. → `details.rooms[]`.
- Cartes **à la main** autorisées (mêmes types que l’ingest).
- Réimport **même réf.** (vol : réf. + n° + date) = **remplace** la carte, n’ajoute pas un doublon.
- Illisible : on **enregistre** + bandeau **À vérifier** (`details.needs_review`), pas un refus global.
- Check-in / horaires absents = **rien** (pas « 15:00 », pas « non indiqué »).
- Copy client : **l’agence**. Pas de « conciergerie 24/7 », pas de Privilège, pas de cloche.
- Modifier un séjour : WhatsApp `Bonjour, je voudrais modifier {réf} — {destination}.` (`whatsappModifyHref`).

## Visibilité / ingest client

APIs `app/api/client/bookings/ingest` et `from-ingest` = **404** (« L’import se fait uniquement par l’agence. »). Ne pas les réactiver.

RLS : le client ne `select` que `visible_to_client`. Preview admin ≠ URL client.

## Couverture

Photo = **ville d’arrivée**, jamais le hub de départ quand une autre ville existe.

`coverQuery` (`lib/crm/carnet.ts`) ignore `paris|cdg|ory|lbg|bva|france|ile-de-france`. Découpe sur `· | / → -> — –`, puis le premier morceau avant la virgule. La destination gagne sur le titre. `Paris · Marrakech` → Marrakech. Paris seul reste Paris. Dans `covers.ts`, le regex Paris est `paris|provence` : ne pas y remettre `france|cdg` (ils volaient la photo de Paris).

`uniqueCities` (`lib/crm/ingest-merge.ts`) pousse `city_to` et `city` **avant** `city_from`.

Unsplash (`unsplashKeywordMatch`) avant l’IA. Marrakech = `photo-1677837488142-a85ffbffe408` (Jemaa el-Fna). Ajouter l’orthographe `Marrakesh` au même mot-clé ; ne pas lancer une nouvelle image pour ça.

**Piège vu en prod** : `bookingCoverUrl` sert `cover_image_path` (`bookings/{id}/cover.webp`) **avant** Unsplash. Un webp généré quand la requête était encore Paris reste affiché alors que `coverQuery` dit Marrakech. Un `PATCH` de destination ou de titre appelle `scheduleBookingCover(..., { force: true })`, et `needsAiCover` avec `force` est vrai même si un mot-clé matche — ça réécrit le webp. Règle : si un mot-clé Unsplash matche, servir cette URL et **ne pas** forcer l’IA. Le webp périmé peut rester en storage, inutilisé.

`<CoverPhoto>` : `<img>` natif, `onError` → `photo-1488646953014-85cb44e25828`. En Puppeteer, Unsplash peut casser `networkidle0` — skill verify.

## Fichiers séjour

Max **30 fichiers / 25 Mo**. Via `/api/files`. PDFs invisibles tant que non publiés.
