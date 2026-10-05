---
name: travelba-carnet
description: >-
  Travelba carnet (itinerary): save vs show to client, hotel nights repeat, cities
  then airport code, drag order, selling price, skip empty days, no invented hours, hotel
  catalog off the booking file (Milano = Milan), client ingest 404, copy l’agence. Use when editing bookings, timeline, ingest
  review, BookingEditor, CarnetItinerary, or visible_to_client.
---

# Travelba — carnet

Cœur produit. Admin = mêmes cartes que le client, densité pro.
La **qualité des cartes** vient de l’import : skill `travelba-document-ingest` (PDF → items honnêtes, fusion, pas de net).
Code : `lib/crm/carnet.ts`, `lib/crm/bookings.ts`, `components/admin/BookingEditor.tsx`,
`components/admin/BookingItemsPanel.tsx`, `components/crm/IngestItemCard.tsx`,
`components/account/CarnetItinerary.tsx`.

## Enregistrer ≠ Montrer au client

Un seul état que l’agence peut croire : **En préparation** (`visible_to_client=false`), **Montré au client**, ou **Archivée**. « Brouillon » n’est pas le nom de « pas encore visible » quand le statut est déjà Confirmée. Le bouton dit **Montrer au client** ou **Mettre à jour**, pas Publier. Archiver dit **Archiver** (la route archive déjà).

| Geste | Effet |
|-------|--------|
| **Enregistrer** | sauve le dossier ; ne le montre pas et ne débite pas un séjour encore caché |
| **Montrer au client** | le client voit ; items + PDFs du dossier passent visibles. Un confirmé entre au grand livre. Un devis montré ne débite pas |

Un seul interrupteur séjour (plus de case fichier séparée). Guard serveur `canPublishCarnet` : au moins **une** carte `kind !== "fee"`.

Quotes (`status=quoted`, devis Little Emperors) : dans le dossier, **invisibles** jusqu’à publication / confirmation. Pas d’écran Devis public. Pas d’e-mail auto à la publication.

Accueil `/mon-compte` = prochain séjour, **même** `CarnetItinerary` que le détail.

## Fiche agence

- En-tête et **Lieu et dates en haut** : villes et dates **de toutes les étapes** (`staffStayFacts`). Le bloc liste une ligne par séjour et une ligne par trajet : le même hôtel aux mêmes dates, ou le même trajet le même jour, n’apparaît qu’une fois (Milano = Milan, Roma = Rome). Un autre hôtel et l’autre sens restent. Les trajets et la ville dans le nom d’hôtel s’écrivent en français (Milan, Rome). Un hôtel à minuit (`T00:00`) n’a pas d’horaire : il passe après les vols du même jour. Le titre suit chaque ville dans l’ordre du voyage (`stayTitleFromItems`) : Paris · Milan · Rome, sans répéter Milano / Milan ni Roma / Rome. Un nom choisi (« 40 ans ») reste. Pas un seul lieu ni un seul départ/retour recopié depuis `crm_bookings`. Ne pas réécrire destination ni les dates pour les faire coller. Le titre, lui, se met à jour quand une étape ajoute une ville.
- Une étape déjà confirmée mais pas encore montrée est **en surbrillance** sur la carte. Pas une bannière qui ne fait que compter.
- Onglet **À faire** toujours visible (chauffeur, VIP Airport, enregistrement), avec le nombre de blocages. Pas de bloc « Avant l’arrivée / Carte hôtel » : la carte Pliant se crée dans l’onglet **Carte**.
- **Écrire à l’hôtel** : sur chaque étape hôtel, le fil du séjour (courriers envoyés, réponses, mails déjà dans les pièces). L’envoi reprend le bureau hôtel (`deliverHotelMail`). Avant d’envoyer, l’agence coche les destinataires (rôle, nom, adresse) et peut en ajouter une. Le message ne part que vers les adresses cochées. Cette liste reste dans le formulaire d’envoi : pas sur la carte, l’aperçu client ni le lien public. Le mail ne devient pas une étape.
- **Carte au pré-enregistrement (B-04)** : jamais de numéro ni de cryptogramme par e-mail, ni PDF ni photo en pièce jointe. `sendHotelRequest` crée un lien `/k/CODE` (`lib/crm/card-link*.ts`, table `crm_card_links`, empreinte du code seulement) : 3 ouvertures, jusqu’à la fermeture de la carte (départ + 3 jours, 48 h au moins). La page n’ouvre rien au chargement ; le bouton `POST /api/k/CODE` compte l’ouverture, journalise dans `crm_card_views` (`viewer = 'hotel'`) puis montre la carte Pliant dans le cadre PCI de Pliant, ou la carte déposée par le client. Un nouvel envoi coupe l’ancien lien. Ces courriers ne sont jamais en copie de contact@travelba.fr (`tokenMailCc`), et la copie gardée au dossier comme les réponses d’hôtel qui le citent perdent le lien (`redactCardLinks`).
- **Courriers hôtel** : chaque lettre préparée (lien, accueil, pré-check-in, et les autres du bureau) est envoyée ou marquée **Pas besoin**. Tant qu’une lettre est ouverte, l’étape dit ce qu’il reste et le séjour le montre dans l’en-tête et dans À faire. Une relance reste un envoi, pas un oubli.
- **Dupliquer** copie cartes, pièces, voyageurs, couverture, **visas, refus et courriers hôtel** (courrier recopié en brouillon, pour ne pas renvoyer). Pas les mails bruts comme étapes.
- Note client : champ `notes_client`, à côté de `notes_internal`.

## Timeline

- Grouper par jour (`groupByDay`). **Hôtel et location** répétés chaque jour de stay (`stayNightDates` : start inclus, fin **exclue**). Vol = jour de départ.
- Jours **sans aucune** carte : **sautés** (pas de ligne vide entre deux villes).
- Hôtel : **pas d’horloge**. `itemClock` ignore `T00:00:00` (timestamptz minuit ≠ 00h00 check-in). Carte compacte : **nom d’établissement** (`details.hotel_name` / `hotelDisplayName`) en titre, **ville** (`hotelCityLine`) en dessous. Jamais la ville à la place du nom.
- Vol : titre = **villes** (`Rome → Paris`, `flightCities`), dessous le **code** (`FCO → CDG`, `flightIata`). N° de vol, classe, horaire et référence restent dans le détail. Même règle sur le carnet client et la fiche agence.
- Clic carte = détail + **Voir la confirmation** (PDF `source_document_id`) + **Ajouter à l’agenda**.
- **Téléphone** : le bouton crée un événement, pas un abonnement. iPhone → fichier `.ics` d’un seul vol (l’app Calendrier propose de l’ajouter). Android → Google Agenda, événement prêt à enregistrer. Bureau → le même fichier. Pas de lien `webcal`.
- En-tête itinéraire : **Ajouter tout le séjour** (`GET /api/client/bookings/[reference]/calendrier`). Horaires seulement s’ils existent ; hôtel = journée entière. Sur téléphone, ce sont des événements ajoutés, pas un flux.
- Ordre : `sort_order` agent (déplacer la carte, sans flèches), défaut **chrono**. PATCH `{ order: [ids] }` sur `/api/admin/bookings/[id]/items`.
- Kinds : `flight` `hotel` `transfer` `activity` `rail` `car` `cruise` `insurance` `fee`. Train / voiture / bateau = cartes métier, pas un jour par escale bateau.
- **Dépense libre** (`expense`) : hors timeline, hors calendrier, hors publication du carnet. Sur `/mon-compte/reservations/[reference]`, section **Dépenses** (libellé + montant), sous le montant du séjour. Elle vit aussi dans les transactions (skill `travelba-money`).

## Prix

- Prix vendu (`item.amount`) : **uniquement le premier jour** de l’événement (check-in hôtel, départ vol, prise en charge location). Les nuits / jours suivants gardent la carte, sans recompter le montant.
- **Vols** : plusieurs e-tickets du même segment = **une** carte, `details.ticket_count`. `item.amount` = **prix du billet pour l’aller-retour** (× passagers). Affichage `2 × 800 €`. Aller simple : ce prix est celui du seul vol. Ne pas additionner l’aller et le retour.
- Carte vol compacte : **villes** en titre, code aéroport en dessous. Prix **sous** la route en mobile (pas à droite : ça déborde).
- **Montant du séjour affiché** = somme des prix vendus des cartes, plus les frais d’agence et les dépenses libres. `booking.total_amount` reste la somme des cartes (skill `travelba-money`).
- `item.amount` extrait = **null** (jamais le net fournisseur sur la carte client).
- Montant PDF → `details.document_amount` (relecture agent). `sanitizeExtractedPrices` **préremplit** `total_amount` = somme **un montant par fichier**. Un extract à 0 ne masque pas cette somme.
- **Enregistrer** un extract `document_status=confirmed` : écrit `booking.total_amount` et passe le dossier en **confirmé**, toujours `visible_to_client=false`. Le débit part seulement au geste **Montrer au client**. Un devis montré ne débite pas.
- Devis (`quote`) : montant proposé, statut `quoted`, **pas** de débit.
- Inclus (`details.included`) **seulement si la phrase est écrite**. Pas de petit-déj inventé. Sinon pas de bloc Inclus. Little Emperors : **toutes** les lignes du bloc « Little Emperors Benefits » / « LE Benefits » (surclassement, petit-déjeuner, crédit, early check-in, late check-out, nuit offerte), en français — pas seulement le petit-déjeuner. Skill `travelba-document-ingest`.
- N’extraire **pas** annulation / barème / conditions : le PDF suffit.

## Cartes

- **Un hôtel** par établissement même si 2 chambres / 2 réf. → `details.rooms[]`. `title` = nom d’hôtel, pas la ville.
- Cartes **à la main** autorisées (mêmes types que l’ingest).
- Réimport **même réf.** (vol : réf. + n° + date) = **remplace** la carte, n’ajoute pas un doublon.
- Illisible : on **enregistre** + bandeau **À vérifier** (`details.needs_review`), pas un refus global.
- Check-in / horaires absents = **rien** (pas « 15:00 », pas « non indiqué »).
- **Contacts d’hôtel** : le catalogue Little Emperors (`crm_hotel_contacts`) peut exister ailleurs. **Sur la fiche réservation**, pas de liste rôle · nom · e-mail. Le nom de l’hôtel suffit. **Interface client** (`/mon-compte`, aperçu Interface client, lien public `/v/`, exemple) : aucun roster. `withoutHotelRoster` retire `hotel_contacts` et les e-mails ou téléphones qui n’existent que dans cette liste, avant le rendu. Milano = Milan. Pas d’écriture dossier par dossier.
- Rapprochement `matchHotelDirectory` : nom identique, ou mêmes mots une fois la ville retirée. Milano = Milan, Londres = London, Venise = Venice (`CITY_ALIASES` dans `lib/crm/hotel-catalog.ts`). Nouvelle graphie = une ligne d’alias + un test `hotel-catalog.test.ts`. Deux hôtels possibles : aucun. Hôtel absent du catalogue : pas de contact inventé.
- Copy client : **l’agence**. Modifier un séjour : WhatsApp `Bonjour, je voudrais modifier {réf} — {destination}.` (`whatsappModifyHref`).
- Conciergerie 24/7 WhatsApp — **pas** de cloche de notif fictive.

## Visibilité / ingest client

APIs `app/api/client/bookings/ingest` et `from-ingest` = **404** (« L’import se fait uniquement par l’agence. »). Ne pas les réactiver.

RLS : le client ne `select` que `visible_to_client`. Preview admin ≠ URL client.

## Couverture

La photo = **la ville / station d’arrivée**, jamais le hub de départ.

- `coverQuery` (`lib/crm/carnet.ts`) : premier token qui n’est **pas** Paris / CDG / ORY / LBG / BVA / France. `Paris · Marrakech` → Marrakech. `CDG → RAK` → RAK. `Avoriaz - Haute Savoie` → Avoriaz.
- **Interdit** : photo de Paris sur un séjour Avoriaz. Le vol part souvent de CDG — ce n’est pas la destination. Avoriaz n’est pas Zermatt. Marrakech n’est pas une photo générique du Maroc. Panama n’est pas Miami.
- Catalogue (`lib/crm/cover-catalog.ts`) : jeton d’arrivée entier. **Une seule ville** : photo de ce lieu, sinon le pays. Provence sans photo de ville → France. Florence → Italie. Venise garde sa photo.
- **Plusieurs destinations** (`stayArrivalPlaces`, hôtels d’abord, sinon l’arrivée de vol, sinon le libellé). Deux villes qui ont **chacune** leur photo : diagonale des deux, et le titre liste les deux villes si le nom saisi n’en cite qu’une. New York et Miami Beach → les deux photos, titre « New York · Miami Beach ». Une ville sans photo propre : photo du **pays**. Marrakech et Essaouira → Maroc. Un nom choisi (« 40 ans ») n’est pas remplacé.
- **Plusieurs pays** : les deux premières photos de pays, coupées en diagonale (`bookingCoverPlan` mode `split`). Un pays sans photo vérifiée ne fabrique pas la seconde moitié.
- **Ville sans photo** : photo du **pays**, toujours. Le pays vient du catalogue de la ville, sinon des autres jetons du libellé et du titre (`Ville · Pays` et `Ville, Pays`). `Inconnue · Portugal` et un hôtel dont la ville est inconnue avec ce libellé → Portugal. Paris / CDG / France ne fabriquent pas un second pays. Une ville qui a sa photo la garde : Antibes, Lamego, Venise, Marrakech, Avoriaz. Test : `unsplashKeywordMatch`.
- **Résidence sans photo** : la ville catalogue la plus proche. Aghouatim, Tahannaout, Ourika → photo de **Marrakech** (pas le Maroc générique). Le Maroc seulement si aucune ville proche n’est nommée. On lit aussi l’adresse et la ville d’hôtel (`coverPhotoInText`).
- **Lieu écrit hors catalogue** : `GET /api/covers/match` géocode le libellé (Nominatim, au moment de l’affichage). Ordre : ville du catalogue citée, ville photographiée du même pays à moins de 180 km, photo du pays, ville photographiée à moins de 500 km, sinon la plus proche au monde. Dinant (Belgique, pays sans photo) → Amsterdam. Aghouatim déjà connu ne déclenche pas d’appel. Fond marine seulement s’il n’y a aucun lieu écrit, ou si ce n’est pas un lieu (`Xyzzy`, « 40 ans »).
- Import agence seulement : `cover_image_path` (`POST/DELETE /api/admin/bookings/[id]/cover`, WebP 1600×900). L’URL porte `?v=` = `updated_at`. Sinon le catalogue gagne.
- **Chaque photo** ajoutée au catalogue, ville ou pays, est une photo réelle **puis** retouchée avant le commit. Un recadrage brut n’est pas une couverture : il sort du thème. Retouche `gpt-image-1` (`coverRetouchPrompt`) : magazine, lumière dorée, lieu reconnaissable, gens lointains. Pas d’invention depuis le nom. Lamego : l’escalier des Remédios, retouché, pas le JPEG d’origine. Catalogue : `/api/covers/{id}` (fichier `public/covers` ou bucket `covers/catalog`). Échec après un retry : ne pas enregistrer l’original — photo de pays déjà retouchée, sinon fond marine. Pas Unsplash brut. Import : retouche puis enregistrement direct, cache `covers/retouched/{sourceId}`. **Autre version** régénère le fichier partagé du catalogue, ou la couverture du dossier. Crédit masqué. Les fichiers déjà retouchés ne sont pas relancés tout seuls. Pas de retouche au chargement client.
- **Importer une photo** : recherche de la ville d’arrivée (photos libres, paysage) puis sélection, ou fichier local. CC BY → `cover_credit` sous la photo. Le client ne cherche pas.
- `<BookingHero>` + `<CoverPhoto>` img natif. Si l’import casse, repli sur la photo du lieu, puis du pays, puis le fond marine. Puppeteer : `domcontentloaded` — skill verify.

## Fichiers séjour

Max **30 fichiers / 25 Mo**. Via `/api/files`. PDFs invisibles tant que non publiés.
