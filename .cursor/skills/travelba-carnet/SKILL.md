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

Un seul état que l’agence peut croire : **En préparation** (`visible_to_client=false`), **Visible**, ou **Archivée**. Pas de pastille À l’étude, Devis, Confirmée, En voyage ou Terminée. Le bouton dit **Montrer au client** ou **Mettre à jour**, pas Publier. Archiver dit **Archiver** (la route archive déjà).

| Geste | Effet |
|-------|--------|
| **Enregistrer** | sauve le dossier ; ne le montre pas et ne débite pas un séjour encore caché. Il s’allume dès qu’une étape est retirée, ajoutée, modifiée ou réordonnée. Il ne cache pas l’étape : `client_hidden` vient seulement du geste Cacher |
| **Montrer au client** | le client voit ; items + PDFs du dossier passent visibles. La pastille devient **Visible**. Le séjour entre au grand livre |

Un seul interrupteur séjour (plus de case fichier séparée). Guard serveur `canPublishCarnet` : au moins **une** carte `kind !== "fee"`. Confirmer reste éteint, et le dit, si les étapes sont cachées et qu’il ne reste que des fichiers.

Quotes (`status=quoted`, devis Little Emperors) : dans le dossier, **invisibles** jusqu’à publication / confirmation. Pas d’écran Devis public. Pas d’e-mail auto à la publication.

Accueil `/mon-compte` = prochain séjour, **même** `CarnetItinerary` que le détail.

## Fiche agence

- En-tête et **Lieu et dates en haut** : villes et dates **de toutes les étapes** (`staffStayFacts`). Le bloc liste une ligne par séjour et une ligne par trajet : le même hôtel aux mêmes dates, ou le même trajet le même jour, n’apparaît qu’une fois (Milano = Milan, Roma = Rome). Un autre hôtel et l’autre sens restent. Le titre et la destination (`stayTitleFromItems`) ne citent que les villes où l’on séjourne : Milan · Rome, pas Paris. Milano = Milan, Roma = Rome, sans répétition. Le domicile en sort : première ville de départ, ville de retour d’un aller-retour, et ville de la fiche. Un aller simple vers une ville où l’on reste la garde, même si c’est Paris. Une **escale aérienne** n’est pas une ville du titre ni une destination : on arrive et on repart en avion en moins de 24 h (`TRAVELBA_LAYOVER_MAX_HOURS`, défaut 24) sans hôtel, transfert, activité ou autre service sur place. Paris · Amsterdam · Tel Aviv (correspondance KLM) devient Tel Aviv. Un arrêt plus long, ou une nuit d’hôtel (Francfort), reste. L’aller simple garde la dernière ville ; l’aller-retour, la ville où l’on fait demi-tour. Un nom choisi (« 40 ans », « 40 ans à Marrakech ») reste, y compris quand l’hôtel est dans une autre ville (Tahannaout). On le change dans le champ **Nom du séjour** de l’en-tête : le texte saisi ne revient pas au titre stocké, et Enregistrer s’allume. Pas un seul lieu ni un seul départ/retour recopié depuis `crm_bookings`. Ne pas réécrire destination ni les dates pour les faire coller, sauf retirer le domicile ou une escale pure d’une destination qui n’est qu’une liste de villes. Le titre, lui, se met à jour quand une étape ajoute une ville, tant que l’agence n’a pas saisi autre chose. Les cartes vol gardent la correspondance (`Paris → Amsterdam`).
- Une étape déjà confirmée mais pas encore montrée est **en surbrillance** sur la carte. Pas une bannière qui ne fait que compter.
- Onglet **À faire** toujours visible (chauffeur, VIP Airport, enregistrement), avec le nombre de blocages. Pas de bloc « Avant l’arrivée / Carte hôtel » : la carte Pliant se crée dans l’onglet **Carte**.
- **Écrire à l’hôtel** : sur chaque étape hôtel, le fil du séjour (courriers envoyés, réponses, mails déjà dans les pièces). L’envoi reprend le bureau hôtel (`deliverHotelMail`). Avant d’envoyer, l’agence coche les destinataires (rôle, nom, adresse), au-dessus de l’objet, et peut en ajouter une. Le message ne part que vers les adresses cochées. Cette liste reste dans le formulaire d’envoi : pas sur la carte, l’aperçu client ni le lien public. Le mail ne devient pas une étape. Le message libre est le courrier **Autre demande**, après Concierge : même cadre que les autres (salut, client VIP, dates, confirmation), puis la demande au conditionnel et une ligne à compléter. Il est préparé en **Pas besoin**, pour ne pas rester ouvert sur chaque séjour ; l’agence l’ouvre, l’écrit et l’envoie. Chaque envoi porte le prénom et le nom du voyageur principal et le numéro de réservation (confirmation hôtel, sinon référence du dossier). Le modèle ouvre par le nom du destinataire quand une seule adresse est cochée (`Bonjour Alexandra Rossi`, `Dear Alexandra Rossi`), sinon par l’équipe. La première ligne présente l’invité comme l’un de nos clients VIP, avec les dates et la confirmation ; la chambre, les accompagnants, le vol et une attention déjà écrite sur la confirmation n’apparaissent que s’ils sont au dossier. La demande se fait au conditionnel, jamais à l’impératif. Puis le prénom de l’agent qui envoie (`crm_staff.full_name`, le premier prénom) et Travel Business Agency. Une relance tient en une phrase et garde l’objet du fil ; le corps reçoit le nom et le numéro s’ils manquent.
- **Carte au pré-enregistrement (B-04)** : jamais de numéro ni de cryptogramme par e-mail, ni PDF ni photo en pièce jointe. `sendHotelRequest` crée un lien `/k/CODE` (`lib/crm/card-link*.ts`, table `crm_card_links`, empreinte du code seulement) : 3 ouvertures, jusqu’à la fermeture de la carte (départ + 3 jours, 48 h au moins). La page n’ouvre rien au chargement ; le bouton `POST /api/k/CODE` compte l’ouverture, journalise dans `crm_card_views` (`viewer = 'hotel'`) puis montre la carte Pliant dans le cadre PCI de Pliant, ou la carte déposée par le client. Un nouvel envoi coupe l’ancien lien. Ces courriers ne sont jamais en copie de contact@travelba.fr (`tokenMailCc`), et la copie gardée au dossier comme les réponses d’hôtel qui le citent perdent le lien (`redactCardLinks`).
- **Courriers hôtel** : chaque lettre préparée (lien, accueil, pré-check-in, et les autres du bureau) est envoyée ou marquée **Pas besoin**. Tant qu’une lettre est ouverte, l’étape dit ce qu’il reste et le séjour le montre dans l’en-tête et dans À faire. Une relance reste un envoi, pas un oubli.
- **Dupliquer** copie cartes, pièces, voyageurs, couverture, **visas, refus et courriers hôtel** (courrier recopié en brouillon, pour ne pas renvoyer). Pas les mails bruts comme étapes.
- Note client : champ `notes_client`, à côté de `notes_internal`. Le mot `null` n’est pas une note : il ne s’affiche pas et ne s’enregistre pas.

## Timeline

- Grouper par jour (`groupByDay`). **Hôtel et location** répétés chaque jour de stay (`stayNightDates` : start inclus, fin **exclue**). Vol = jour de départ.
- Jours **sans aucune** carte : **sautés** (pas de ligne vide entre deux villes).
- Hôtel : **pas d’horloge**. `itemClock` ignore `T00:00:00` (timestamptz minuit ≠ 00h00 check-in). Carte compacte : **nom d’établissement** (`details.hotel_name` / `hotelDisplayName`) en titre, **ville** (`hotelCityLine`) en dessous. Jamais la ville à la place du nom.
- Vol : titre = **villes** (`Rome → Paris`, `flightCities`), dessous le **code** (`FCO → CDG`, `flightIata`). Si une seule ville est lue, la continuité du même billet complète l’autre côté : le libellé reste « origine → destination ». Seychelles = SEZ, Dubaï = DXB, Emirates ou Qatar vers Paris = CDG : l’avertissement IATA disparaît. Il reste si le code ne se déduit pas. N° de vol, classe, horaire et référence restent dans le détail. Même règle sur le carnet client et la fiche agence.
- Clic carte = détail + **Voir la confirmation** (PDF `source_document_id`) + **Ajouter à l’agenda**.
- **Téléphone** : le bouton crée un événement, pas un abonnement. Le fichier sort d’une route https (`.ics`) : `Content-Type: text/calendar; charset=utf-8` et `Content-Disposition` avec un nom `.ics`. iPhone Safari : `inline`, Calendrier propose de l’ajouter. Écran d’accueil (PWA) : la même URL s’ouvre hors de l’app, sinon le webview affiche le texte brut. Android : Google Agenda, événement prêt. Bureau : téléchargement. Pas de lien `webcal`. Vol : heure locale de l’aéroport (`TZID` + `VTIMEZONE`, les chiffres ne bougent pas). Hôtel : journée entière.
- En-tête itinéraire : **Ajouter tout le séjour** (`GET /api/client/bookings/[reference]/calendrier`). Horaires seulement s’ils existent ; hôtel = journée entière. Sur téléphone, ce sont des événements ajoutés, pas un flux.
- Ordre : défaut **chrono** (`stepChronoKey` : heure réelle ; minuit sur un hôtel = fin de journée). Une carte nouvelle se glisse à sa date. Un glisser-déposer qui ne suit plus les dates pose `items_order_custom` : les cartes déjà rangées ne bougent plus, la suivante s’insère devant la première plus tardive. Dépenses hors de cette liste.
- Kinds : `flight` `hotel` `transfer` `activity` `rail` `car` `cruise` `insurance` `fee` `accueil_vip`. Train / voiture / bateau = cartes métier, pas un jour par escale bateau. **Accueil VIP** est une étape du séjour, toujours collée à un vol du dossier (arrivée après le vol, départ juste avant). L’aéroport et l’heure viennent de ce vol. Un aller-retour a deux jours. Le texte « Informations à transmettre au client » reste visible sur la carte. Le VIP Airport demandé par le client reste `greeter`, hors timeline.
- **Dépense libre** (`expense`) : hors timeline, hors calendrier, hors publication du carnet. Sur `/mon-compte/reservations/[reference]`, section **Dépenses** (libellé + montant), sous le montant du séjour. Elle vit aussi dans les transactions (skill `travelba-money`).

## Prix

- Prix vendu (`item.amount`) : **uniquement le premier jour** de l’événement (check-in hôtel, départ vol, prise en charge location). Les nuits / jours suivants gardent la carte, sans recompter le montant.
- **Vols** : plusieurs e-tickets du même segment = **une** carte, `details.ticket_count`. `item.amount` = **prix unitaire du billet** (× `ticket_count`). Affichage `2 × 800 €`. Un total saisi (`details.amount_is_total`) reste le montant du groupe, au centime : le nombre de billets ne le multiplie pas et l’affichage ne montre pas « N × ». Les cartes déjà là, sans ce drapeau, restent unitaire × billets. Aller-retour au même prix vendu : compté une fois. Deux prix différents (deux allers simples) : les deux entrent dans le séjour. Un seul des deux vols a un prix : ce prix est celui du billet, compté une fois. Sur la carte, sous le trajet, le prénom et le nom du billet (`details.passengers`). On les coche dans le foyer à la relecture. Le train suit la même ligne.
- Carte vol compacte : **villes** en titre, code aéroport en dessous. Prix **sous** la route en mobile (pas à droite : ça déborde).
- **Montant du séjour affiché** = somme des prix vendus des cartes, plus les frais d’agence et les dépenses libres. `booking.total_amount` reste la somme des cartes (skill `travelba-money`).
- `item.amount` extrait = **null** (jamais le net fournisseur sur la carte client).
- Montant PDF → `details.document_amount` (relecture agent). `sanitizeExtractedPrices` **préremplit** `total_amount` = somme **un montant par fichier**. Un extract à 0 ne masque pas cette somme.
- **Enregistrer** un extract `document_status=confirmed` : écrit `booking.total_amount` et peut passer le dossier en `confirmed`, toujours `visible_to_client=false`. Le débit part seulement au geste **Montrer au client**.
- Devis (`quote`) : montant proposé, statut stocké `quoted`, caché tant qu’il n’est pas montré. Montré, il débite comme les autres.
- Inclus (`details.included`) **seulement si la phrase est écrite**. Pas de petit-déj inventé. Sinon pas de bloc Inclus. Little Emperors : **toutes** les lignes du bloc « Little Emperors Benefits » / « LE Benefits » (surclassement, petit-déjeuner, crédit, early check-in, late check-out, nuit offerte), en français — pas seulement le petit-déjeuner. Skill `travelba-document-ingest`.
- N’extraire **pas** annulation / barème / conditions : le PDF suffit.

## Cartes

- **Un hôtel** par établissement même si 2 chambres / 2 réf. → `details.rooms[]`. `title` = nom d’hôtel, pas la ville.
- Annulation client : sur `/mon-compte`, le titulaire voit « Annuler cette réservation » seulement si Little Emperors dit `is_cancellable` et que la politique est gratuite avant `cancellation_deadline`. Le clic relit la réservation juste avant le DELETE. Sinon « Contactez votre conseiller. » L’aperçu, le lien public et un compagnon n’annulent pas. Aucun frais : un doute refuse.
- Carte hôtel Little Emperors : galerie, d’abord toutes les photos de la catégorie réservée (`images_gallery`). La casse et le mot Room ne changent pas la catégorie. King, Twin, Queen et Double la distinguent : Terrace Queen n’est pas Terrace King, Deluxe Room n’est pas un Deluxe Marina Bay King. Une autre catégorie, même absente de la liste des chambres, ne s’affiche pas. Les espaces de l’hôtel viennent ensuite, ou seuls s’il n’y a aucune photo de cette catégorie (façade et hall avant la piscine). Heures d’arrivée et de départ seulement si `short_info` les donne. Adresse, conditions, nuits et voyageurs viennent de la réservation déjà stockée. Les avantages Little Emperors sont un bloc « Vos avantages exclusifs » : icône, libellé court, réserve en petit. Aucun coût, aucune marge, aucune commission sur la carte. Une carte saisie à la main sans ces champs reste comme avant. `ajouter_hotel` accepte `photos`, `adresse`, `heure_arrivee`, `heure_depart`.
- Cartes **à la main** autorisées (mêmes types que l’ingest).
- Réimport **même réf.** (vol : réf. + n° + date) = **remplace** la carte, n’ajoute pas un doublon.
- Illisible : on **enregistre**. Le bandeau nomme l’étape et ce qui est douteux (`details.needs_review`, phrase `details.review_reason`, sinon le fichier option ou le nom qui est la ville). Pas un refus global, pas une phrase qui ne dit que « lecture douteuse ».
- Check-in / horaires absents = **rien** (pas « 15:00 », pas « non indiqué »).
- **Contacts d’hôtel** : le catalogue Little Emperors (`crm_hotel_contacts`) peut exister ailleurs. **Sur la fiche réservation**, pas de liste rôle · nom · e-mail. Le nom de l’hôtel suffit. **Interface client** (`/mon-compte`, aperçu Interface client, lien public `/v/`, exemple) : aucun roster. `withoutHotelRoster` retire `hotel_contacts` et les e-mails ou téléphones qui n’existent que dans cette liste, avant le rendu. Milano = Milan. Pas d’écriture dossier par dossier.
- Rapprochement `matchHotelDirectory` : nom identique, ou mêmes mots une fois la ville retirée. Milano = Milan, Londres = London, Venise = Venice (`CITY_ALIASES` dans `lib/crm/hotel-catalog.ts`). Nouvelle graphie = une ligne d’alias + un test `hotel-catalog.test.ts`. Deux hôtels possibles : aucun. Hôtel absent du catalogue : pas de contact inventé.
- Copy client : **l’agence**. Les phrases qui nomment le séjour (`stayDestinationPhrase`, même liste que le titre) citent chaque ville où l’on reste, avec la préposition : « à Tel Aviv et aux Seychelles », « en Italie », « au Maroc », « aux Maldives ». Jamais le départ ni une escale. Modifier un séjour : WhatsApp `Bonjour, je voudrais modifier {réf} — {destinations}.` (`whatsappModifyHref`).
- Conciergerie 24/7 WhatsApp — **pas** de cloche de notif fictive.

## Visibilité / ingest client

APIs `app/api/client/bookings/ingest` et `from-ingest` = **404** (« L’import se fait uniquement par l’agence. »). Ne pas les réactiver.

RLS : le client ne `select` que `visible_to_client`. Preview admin ≠ URL client.

## Couverture

La photo = **les villes où l’on séjourne**, jamais le domicile ni le hub de départ. Paris · Tel Aviv · Seychelles (retour à CDG) : Tel Aviv et les Seychelles, pas la tour Eiffel.

- `coverQuery` (`lib/crm/carnet.ts`) : premier token qui n’est **pas** Paris / CDG / ORY / LBG / BVA / France. `Paris · Marrakech` → Marrakech. `CDG → RAK` → RAK. `Avoriaz - Haute Savoie` → Avoriaz.
- **Interdit** : photo de Paris sur un séjour Avoriaz ou Bordeaux. Le vol part souvent de CDG — ce n’est pas la destination. Bordeaux n’est pas la tour Eiffel. Avoriaz n’est pas Zermatt. Marrakech n’est pas une photo générique du Maroc. Panama n’est pas Miami.
- Catalogue (`lib/crm/cover-catalog.ts`) : jeton d’arrivée entier. **Une seule ville** : photo de ce lieu. Sans photo propre, image générée de **cette** ville (`photo-city-bordeaux`), pas la photo du pays. Bordeaux n’est pas Paris. Florence n’est pas Rome. Provence n’est pas la tour Eiffel. Venise garde sa photo. Le pays (France, Italie) garde sa photo seulement quand le lieu est le pays.
- **Plusieurs destinations** (`stayArrivalPlaces`, hôtels d’abord, sinon l’arrivée de vol, sinon le libellé). Chaque ville a sa photo (catalogue ou image générée). Deux images différentes : diagonale, et le titre liste les deux villes si le nom saisi n’en cite qu’une. New York et Miami Beach → les deux photos, titre « New York · Miami Beach ». Marrakech et Essaouira → les deux, pas le Maroc générique. Avoriaz et Morzine partagent la même photo de station : une seule image. Un nom choisi (« 40 ans ») n’est pas remplacé.
- **Plusieurs pays** : les deux premières photos de pays, coupées en diagonale (`bookingCoverPlan` mode `split`). Un pays sans photo vérifiée ne fabrique pas la seconde moitié.
- **Ville sans photo** : image générée de cette ville (`gpt-image-1`, `coverGeneratePrompt`), identifiant `photo-city-{lieu}`. `npm run covers:generate` (ou `npx tsx scripts/generate-city-covers.ts Lyon`) ne crée que les fichiers absents de `public/covers`. Une clé refusée arrête le lot. Le premier affichage peut encore remplir le cache (`GET /api/covers/{id}` → `covers/catalog/{id}.webp` ou `public/covers`). Échec : fond marine, jamais la photo d’une autre ville. Une ville inconnue dans le libellé (`Inconnue · Portugal`) garde la photo du pays. Paris / CDG / France ne fabriquent pas un second pays. Une ville qui a sa photo la garde : Antibes, Lamego, Venise, Marrakech, Avoriaz. Test : `unsplashKeywordMatch`.
- **Résidence sans photo** : la ville catalogue la plus proche. Aghouatim, Tahannaout, Ourika → photo de **Marrakech** (pas le Maroc générique). Le Maroc seulement si aucune ville proche n’est nommée. On lit aussi l’adresse et la ville d’hôtel (`coverPhotoInText`).
- **Lieu écrit hors catalogue** : `GET /api/covers/match` géocode le libellé (Nominatim, au moment de l’affichage). Ordre : ville du catalogue citée, ville photographiée du même pays à moins de 180 km, photo du pays, ville photographiée à moins de 500 km, sinon la plus proche au monde. Dinant (Belgique, pays sans photo) → Amsterdam. Aghouatim déjà connu ne déclenche pas d’appel. Fond marine seulement s’il n’y a aucun lieu écrit, ou si ce n’est pas un lieu (`Xyzzy`, « 40 ans »).
- Import agence seulement : `cover_image_path` (`POST/DELETE /api/admin/bookings/[id]/cover`, WebP 1600×900). L’URL porte `?v=` = `updated_at`. Sinon le catalogue gagne.
- WhatsApp au moment où l’on montre le séjour : le message reste en file (`sejour:{id}`) tant que la photo du lieu n’est pas un fichier (génération `ensureCityCover` au cron s’il le faut) et que `TWILIO_CONTENT_SEJOUR` est posé. Le cron reprend la file. Huit essais sans photo, ou une clé refusée : le texte part. Un envoi déjà `sent` ne repart pas. Pas d’image inventée.
- Une prestation qui devient visible sur un séjour **déjà** montré prépare un brouillon (`crm_concierge_followups`, `carnet_ajout`) : « vos vols ont été ajoutés à votre carnet » et le lien. Plusieurs ajouts rapprochés réécrivent le même brouillon. Pas de prix net, pas de commission, pas de fournisseur. L’agence l’envoie en un clic. Rien ne part seul, ni par la file des messages. `definir_visibilite_carte` et `preparer_message_carnet` n’envoient rien.
- Carte d’embarquement : le bouton **Cartes d’embarquement** du dossier (à côté d’Enregistrer) envoie le PDF de type `carte d'embarquement` en en-tête Document WhatsApp. Un message par PDF (WhatsApp n’accepte qu’un document). Confirmation obligatoire. Rien ne part à la publication d’une pièce. Journal sans numéro de passeport. Modèles `carte_embarquement`, `cartes_embarquement`, `enregistrement_aeroport`.
- **Chaque photo** ajoutée au catalogue, ville ou pays, est une photo réelle **puis** retouchée avant le commit. Un recadrage brut n’est pas une couverture : il sort du thème. Retouche `gpt-image-1` (`coverRetouchPrompt`) : magazine, lumière dorée, lieu reconnaissable, gens lointains. Pas d’invention depuis le nom. Lamego : l’escalier des Remédios, retouché, pas le JPEG d’origine. Catalogue : `/api/covers/{id}` (fichier `public/covers` ou bucket `covers/catalog`). Échec après un retry : ne pas enregistrer l’original — photo de pays déjà retouchée, sinon fond marine. Pas Unsplash brut. Import : retouche puis enregistrement direct, cache `covers/retouched/{sourceId}`. **Autre version** régénère le fichier partagé du catalogue, ou la couverture du dossier. Crédit masqué. Les fichiers déjà retouchés ne sont pas relancés tout seuls. Pas de retouche au chargement client.
- **Importer une photo** : recherche de la ville d’arrivée (photos libres, paysage) puis sélection, ou fichier local. CC BY → `cover_credit` sous la photo. Le client ne cherche pas.
- `<BookingHero>` + `<CoverPhoto>` img natif. Si l’import casse, repli sur la photo du lieu, puis du pays, puis le fond marine. Puppeteer : `domcontentloaded` — skill verify.

## Fichiers séjour

Max **30 fichiers / 25 Mo**. Via `/api/files`. PDFs invisibles tant que non publiés.
