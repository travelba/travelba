---
name: travelba-ui
description: >-
  Travelba UI: Cursor Design Mode, Sovereign Horizon tokens, French copy, Lucide icons, CoverPhoto
  img, short /api/files URLs, loading skeletons, l’agence voice. Use when
  changing layout, styling, client chrome, admin chrome, or design tokens.
---

# Travelba — UI

## Design

Les retouches visuelles se font dans **Cursor Design Mode**, sur l’app qui tourne (`https://travelba.fr` ou `npm run dev`). Fenêtre Agents → navigateur → `Cmd+Shift+D`. Cliquer l’élément, décrire le changement. L’agent édite le code.

Le code (tokens, composants) est la source. Stitch (`docs/design/stitch/atelier`) est une archive, plus l’endroit où l’on modifie un écran.

Thème **Sovereign Horizon** : marine `#0B192C` (`--admin-navy`), champagne `#C5A880` (`--admin-gold`).

**Interdit** : feuille Stitch « Travelba CRM », Aura Voyages émeraude, Material Symbols CDN.

Espace client : colonne ~480px (`AccountChrome`). En-tête : marque, barre de recherche (ville, hôtel, référence du séjour), WhatsApp, avatar. Admin : sidebar `AdminNav`.

## Typo / icons / images

- Fonts `app/layout.tsx` : Plus Jakarta + Inter preload ; Space Grotesk `preload: false`.
- Icons : `components/crm/icons.tsx` (Lucide, **noms historiques** `flight`, `hotel`, `chat`…). Ajouter un mapping, pas un import Material.
- Couvertures : `components/crm/BookingHero.tsx` + `CoverPhoto.tsx` = `<img>` natif (`referrerPolicy=no-referrer`). Pas de `next/image` sur Unsplash. Repli : photo du lieu, puis fond marine.
- Fichiers : `src="/api/files?path=..."` uniquement. Jamais coller une signed URL Supabase dans le DOM (expire + fuite).

## Fiche réservation (admin)

Même langage sur **toutes** les réservations, pas un dossier d’exemple.

- État : pastille **En préparation**, **Visible** ou **Archivée**. Pas de liste de statuts commerciaux. Bouton principal **Montrer au client** ou **Mettre à jour**. **Archiver**, pas Supprimer.
- En-tête : retour **← Dossiers**, **Nom du séjour** (champ : toutes les villes du voyage, sans répéter la même ; un nom choisi reste ; modifier le texte l’y laisse et allume Enregistrer), référence, dates et villes lues sur les étapes, voyageurs, statut. Chips de ce qui manque (passeport, courriers hôtel encore ouverts, montant non montré). Boutons, toujours dans cet ordre : **Enregistrer** (éteint tant que rien n’a changé) · **Cartes d’embarquement** (seulement si le dossier a un vol : le panneau s’ouvre, l’envoi attend une confirmation, le PDF part en document) · le **geste principal**, qui ne disparaît jamais : **Montrer au client** (En préparation), **Mettre à jour le carnet** (Visible avec une étape ou une pièce encore cachée), sinon **Cacher au client** en contour ; chacun passe par la confirmation · menu **…** (Dupliquer, Couverture / Autre version / Photo du lieu, Aperçu de l’espace client, Voir comme le client, Archiver). **Quatre onglets** (`lib/crm/booking-tabs.ts`, `?tab=`), dans cet ordre : **Voyage** (défaut : lieu et dates, étapes avec le bureau Courriers hôtel, une seule zone de dépôt — « Joindre une pièce sans la lire » est un repli de cette zone —, ligne Argent, Pièces, Courriers), **Client** (picker du client du dossier + résumé en lecture — e-mail, téléphone et WhatsApp, foyer, sociétés — avec **Ouvrir la fiche** ; le `CustomerEditor` complet vit seulement sur `/admin/clients/[id]` ; Notes ; **Sur ce séjour** voyageurs et passeports, ESTA / ETA ; fil WhatsApp ; partage du carnet ; journal Activité), **À faire** (compteur : formalités, enregistrement en ligne, services, à faire du mail, passeports manquants, Little Emperors), **Argent**. Les chips de l’en-tête « N coûts à pointer » et « Marge à corriger » ouvrent Argent, les autres À faire. Anciens onglets, tous alias : `?tab=whatsapp` → Client, `?tab=interface` → Voyage (l’aperçu client est dans le menu …), `?tab=carte`, `pliant`, `reglement`, `transactions` → Argent. Le bloc Carte Pliant affiche toujours le solde du compte Pliant de l’agence, même sans carte émise. Indisponible si la lecture échoue. C’est le disponible du compte, pas le plafond d’une carte. Les visuels forment une mosaïque : chaque carte émise et chaque carte liée (hôtel, registre) a son visuel, côte à côte. Une carte déjà émise n’est pas répétée en liste en dessous. Dans la liste des étapes, le bouton de la carte ouverte est **Appliquer** (la carte revient dans la liste avec la pastille **Pas encore enregistré**) ; **Enregistrer**, en haut, écrit tout. **Envoyer par WhatsApp** dans l’aperçu envoie le lien, par la même route que le dossier. Les autres gestes de l’aperçu restent locaux.
- Lieu et dates **en haut** : une ligne par séjour et une ligne par trajet. Le même hôtel aux mêmes dates, ou le même trajet le même jour, n’apparaît qu’une fois (Milano = Milan, Roma = Rome). Un autre hôtel et l’autre sens restent. Pas un seul champ Lieu + un seul départ/retour quand des étapes existent. Ne pas réécrire `destination` / dates du dossier pour coller à l’affichage.
- Cartes datées. Vol : villes en titre, code aéroport dessous, n° de vol, classe, horaire et référence dans le détail. Le document lié reste replié : un clic sur la ligne le déroule en vignette, même format que Pièces jointes, avec Retirer. Étape pas encore montrée : surbrillance, pas une bannière qui ne fait que compter. Retirer, modifier, ajouter, réordonner ou montrer une étape attend le bouton Enregistrer du séjour : il s’allume, et le bandeau « Modifications non enregistrées » apparaît. Un Enregistrer qui reste gris après ce geste est un bug. Le montant du séjour suit le prix saisi sur la carte tout de suite, avant cet enregistrement.
- Pas de roster hôtel (rôle, nom, e-mail) sur la carte. Un libellé court (le nom de l’hôtel) suffit. Le formulaire d’envoi (fil et courrier) coche les destinataires au-dessus de l’objet, puis le message.
- Argent : sur Voyage, une ligne (qui paie, montant, grand livre) qui ouvre l’onglet. Sept blocs, toujours dans cet ordre et sur la même largeur (`order-1` à `order-7` dans le panneau ; un bloc sans `order-*` remonte en premier, c’est un bug) : **Synthèse** (`ReglementSummary` : montant, payeur · grand livre, état À pointer / Pointé / Comptabilisé, vendu / coûts / marge, checklist payeur, prix, grand livre, coûts, facture), **Qui règle et comment** (le seul bloc du formulaire `booking-meta` : **Qui paie** — picker de client, qui n’est plus sur l’onglet Client —, Part de l’encours Société / Particulier, Encaissement L’agence encaisse / Le client règle l’hôtel, Frais Avec le séjour / À part, en segmented controls `Segmented` ; Enregistrer applique), **Prix et lignes vendues** (montant, Devise `form="booking-meta"`, dépenses et commission en autosave), **Coûts du voyage** (`TripCostsBlock`), **Facture MB3M** (`InvoiceBlock`), **Compte du client** (`<details>` replié, lien Toutes les transactions), **Carte Pliant** (solde du compte, cartes émises et liées, émission). Les mails ne sont pas des lignes d’étape.
- Doublons proposés : repliés sur toutes les fiches. Fermé, le bandeau dit qu’il y en a et combien. Ouvert, les cartes grisées et **Écarter**. Le fichier reste dans le dossier.

## Copy

- Français uniquement dans `/admin` et `/mon-compte`.
- Voix : **l’agence** (WhatsApp 24/7, `siteConfig.whatsappNumber` `33756841315`).
- Modifier une résa : `Bonjour, je voudrais modifier {réf} — {destination}.`
- Pas de cloche / badge notif fantôme. Le point or sur l’avatar n’est pas une inbox.
- Dates `formatDateFr` / `DateFrInput` (`lib/crm/money.ts`, `components/crm/fields.tsx`). Heure `HHhMM` via `itemClock` (vide si minuit).
- Encours : afficher +/− réel.

## Nav figée

Client bas / header : **Accueil / Réservations / Transactions / Mon compte**.  
Profil : **Vous / Pièces / Voyageurs / Facturation**. Pas « Cartes », pas WhatsApp champ.

Admin (`AdminNav`, modèle dans `lib/crm/admin-nav.ts`) : **cinq entrées** puis **Réglages**, chacune un groupe repliable (état `localStorage`) dont les sous-entrées sont ses vues ou ses onglets — **Accueil** · **Dossiers** (Dossiers, Formalités, Services à confirmer) · **Clients** (Clients, Pièces à échéance [badge]) · **Boîte de réception** `/admin/boite` (onglets Fournisseurs [badge e-mails + Little Emperors], Hôtels [badge réponses], WhatsApp [badge non lus]) · **Argent** `/admin/argent` (onglets À encaisser [badge Revolut + Stripe], À pointer [badge coûts], Grand livre, Comptes) · **Réglages** `/admin/reglages` (admins : Mise en service, Équipe, Modèles WhatsApp, E-mails au client, Savoir du Concierge, Accès Hôtels, Diagnostic Gmail, Aperçu espace client hors prod ; agents : Modèles WhatsApp et E-mails au client). Une icône par entrée, toutes différentes. **Le libellé du menu est le H1 de la page** ; une page à onglets porte le titre du groupe (`AdminNavGroup.title`). Les anciens chemins (`/admin/outils/*`, `/admin/emails`, `/admin/revolut`…) redirigent.
Les compteurs viennent de `adminBadges()` (`lib/crm/admin-badges.ts`), une fois par requête : `revolut`, `stripe`, `emails`, `le`, `pieces`, `whatsapp`, `hotels` (courriers où l’hôtel a écrit en dernier), `costs` (sorties Pliant et débits Revolut pas pointés).
L’Accueil (`/admin`, H1 « Accueil ») est le briefing, dans cet ordre : **À faire aujourd’hui** (`adminTodoLines`, toutes les files : WhatsApp, e-mails, Little Emperors, réponses d’hôtel, paiements à encaisser, coûts à pointer, formalités, services, départs demain, pièces ; chaque pastille ouvre la vue filtrée) · courriers d’hôtel à traiter · **La semaine** (En voyage, Aujourd’hui et demain, Sous 7 jours) · **Argent** en une rangée (Reste à encaisser + soldes Revolut / Stripe / Pliant, « Tout voir » vers Argent) · **Activité clients** replié par défaut. « Mise en service » vit dans Réglages, pas sur l’Accueil.
Un seul CTA **Nouveau dossier** → `/admin/reservations/nouveau` (sidebar desktop, bouton « + » dans l’en-tête téléphone). L’avatar ouvre le menu utilisateur (nom, rôle, Réglages, WhatsApp agence, Déconnexion) : pas de « Sortir » épars.
Téléphone (< 1024) : en-tête 56 px (logo, titre court, « + » Nouveau dossier, loupe → recherche en overlay, avatar) et barre basse fixe **Accueil / Dossiers / Clients / Boîte / Argent** (badges Boîte et Argent). Pas de feuille « Plus » : Réglages est dans le menu utilisateur.
`aria-current="page"` sur l’entrée active ; `/admin/recherche` allume l’omnibar. Rapprochement : popup recherche client (`CustomerPickDialog`), pas un select natif.

## Perf perçue

- `loading.tsx` à côté de chaque `page.tsx` liste/détail CRM.
- Toute attente (enregistrer, envoyer, lire, publier, supprimer) affiche `BusyBar` : pourcentage réel si on l’a (envoi de fichier), sinon barre animée. Pas seulement le libellé du bouton.
- Actions carnet dans le **header** éditeur (pas de barre `fixed`/`sticky` qui recouvre l’ingest).
- Une action que l’agent doit cliquer (lancer une formalité, confirmer, envoyer) est dans ce header, à côté d’Enregistrer. Jamais sous les cartes du séjour. Si l’utilisateur dit qu’il ne voit pas le bouton, on le déplace. On ne lui demande pas de descendre dans la page.
- `next/font` : ne pas preloader trop de familles (Space Grotesk déjà off).

## Accessibilité minimale

Boutons icon-only : `aria-label` FR. Formulaires : `Field` label visible, pas placeholder seul.

## Vérif visuelle

Changer un écran ⇒ skill `travelba-verify` (desktop + mobile 390px pour le client). Ne pas se fier à un seul screenshot.
