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
- En-tête : retour Réservations, **Nom du séjour** (champ : toutes les villes du voyage, sans répéter la même ; un nom choisi reste ; modifier le texte l’y laisse et allume Enregistrer), référence, dates et villes lues sur les étapes, voyageurs, statut. Chips de ce qui manque (passeport, courriers hôtel encore ouverts, montant non montré). Onglets sur une ligne, dans cet ordre : **Client** (la même fiche que `/admin/clients` : foyer, identité, coordonnées ; les voyageurs de ce séjour en dessous ; journal Activité en bas), **WhatsApp** (fil du client, déplié), **Le voyage**, **À faire** (compteur), **Carte** (émission), **Règlement** (synthèse, qui règle et comment, prix et lignes vendues, coûts du voyage, facture MB3M, puis compte du client replié). Les chips de l’en-tête « N coûts à pointer » et « Marge à corriger » ouvrent Règlement, les autres À faire. **Interface client** est à droite, en champagne, pastille pêche quand il est ouvert. **Envoyer par WhatsApp** dans cet écran envoie le lien, par la même route que le dossier. Les autres gestes de l’aperçu restent locaux. Pliant et Transactions ne sont plus des onglets : `?tab=pliant` ouvre Carte, `?tab=argent` et `?tab=transactions` ouvrent Règlement. L’onglet Carte affiche toujours le solde du compte Pliant de l’agence, même sans carte émise. Indisponible si la lecture échoue. C’est le disponible du compte, pas le plafond d’une carte. Sur Carte, les visuels forment une mosaïque : chaque carte émise et chaque carte liée (hôtel, registre) a son visuel, côte à côte. Une carte déjà émise n’est pas répétée en liste en dessous.
- Lieu et dates **en haut** : une ligne par séjour et une ligne par trajet. Le même hôtel aux mêmes dates, ou le même trajet le même jour, n’apparaît qu’une fois (Milano = Milan, Roma = Rome). Un autre hôtel et l’autre sens restent. Pas un seul champ Lieu + un seul départ/retour quand des étapes existent. Ne pas réécrire `destination` / dates du dossier pour coller à l’affichage.
- Cartes datées. Vol : villes en titre, code aéroport dessous, n° de vol, classe, horaire et référence dans le détail. Le document lié reste replié : un clic sur la ligne le déroule en vignette, même format que Pièces jointes, avec Retirer. Étape pas encore montrée : surbrillance, pas une bannière qui ne fait que compter. Retirer, modifier, ajouter, réordonner ou montrer une étape attend le bouton Enregistrer du séjour : il s’allume, et le bandeau « Modifications non enregistrées » apparaît. Un Enregistrer qui reste gris après ce geste est un bug. Le montant du séjour suit le prix saisi sur la carte tout de suite, avant cet enregistrement.
- Pas de roster hôtel (rôle, nom, e-mail) sur la carte. Un libellé court (le nom de l’hôtel) suffit. Le formulaire d’envoi (fil et courrier) coche les destinataires au-dessus de l’objet, puis le message.
- Règlement : sur Le voyage, une ligne (qui paie, montant, grand livre) qui ouvre l’onglet. Six blocs, toujours dans cet ordre et sur la même largeur (`order-1` à `order-6` dans le panneau ; un bloc sans `order-*` remonte en premier, c’est un bug) : **Synthèse** (`ReglementSummary` : montant, payeur · grand livre, état À pointer / Pointé / Comptabilisé, vendu / coûts / marge, checklist payeur, prix, grand livre, coûts, facture), **Qui règle et comment** (le seul bloc du formulaire `booking-meta` : **Qui paie** — picker de client, qui n’est plus sur l’onglet Client —, Part de l’encours Société / Particulier, Encaissement L’agence encaisse / Le client règle l’hôtel, Frais Avec le séjour / À part, en segmented controls `Segmented` ; Enregistrer applique), **Prix et lignes vendues** (montant, Devise `form="booking-meta"`, dépenses et commission en autosave), **Coûts du voyage** (`TripCostsBlock`), **Facture MB3M** (`InvoiceBlock`), **Compte du client** (`<details>` replié, lien Toutes les transactions). Les mails ne sont pas des lignes d’étape.
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

Admin (`AdminNav`, modèle dans `lib/crm/admin-nav.ts`) : sidebar en groupes repliables (état `localStorage`) — **Activité** (Tableau de bord) · **Clients** (Clients, Pièces à échéance [badge]) · **Dossiers** (Réservations, Formalités `/admin/formalites`, Services à confirmer `/admin/services`) · **Argent** (Transactions, Revolut, Stripe, Pliant) · **Boîtes de réception** (E-mails [badge], Little Emperors [badge]) · **Outils** (Messages types WhatsApp, E-mails au client, Diagnostic Gmail, Aperçu espace client hors prod) · **Équipe** (admins).
Le tableau de bord est le briefing : pastilles À faire, activité clients (connexions à l’espace sur sept jours, hors comptes agence ; le nom mène à la fiche, le geste ouvre la journée), courriers d’hôtel (trois plus récents, Voir plus / Voir moins ; pastille Réponse reçue ou En attente de réponse ; pour un lien de paiement, pastille Paiement Pliant effectué avec montant et date, ou Pas de paiement Pliant — seulement si la lecture a réussi), rangée Argent (encours + comptes), semaine (En voyage, Aujourd’hui et demain, Sous 7 jours). Formalités et Services ne sont plus des ancres de l’accueil.
Un seul CTA **Nouveau dossier** → `/admin/reservations/nouveau`. L’avatar ouvre le menu utilisateur (nom, rôle, WhatsApp agence, Déconnexion) : pas de « Sortir » épars.
Téléphone (< 1024) : en-tête 56 px (logo, titre court, loupe → recherche en overlay, avatar) et barre basse fixe **Accueil / Clients / Dossiers / Argent / Plus** (Plus = E-mails + Little Emperors) ; « Plus » ouvre une feuille basse (Boîtes, Outils, Équipe, utilisateur).
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
