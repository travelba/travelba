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

Espace client : colonne ~480px (`AccountChrome`). Admin : sidebar `AdminNav`.

## Typo / icons / images

- Fonts `app/layout.tsx` : Plus Jakarta + Inter preload ; Space Grotesk `preload: false`.
- Icons : `components/crm/icons.tsx` (Lucide, **noms historiques** `flight`, `hotel`, `chat`…). Ajouter un mapping, pas un import Material.
- Couvertures : `components/crm/BookingHero.tsx` + `CoverPhoto.tsx` = `<img>` natif (`referrerPolicy=no-referrer`). Pas de `next/image` sur Unsplash. Repli : photo du lieu, puis fond marine.
- Fichiers : `src="/api/files?path=..."` uniquement. Jamais coller une signed URL Supabase dans le DOM (expire + fuite).

## Fiche réservation (admin)

Même langage sur **toutes** les réservations, pas un dossier d’exemple.

- État : pastille **En préparation**, **Montré au client** ou **Archivée**. Bouton principal **Montrer au client** ou **Mettre à jour**. **Archiver**, pas Supprimer.
- En-tête : retour Réservations, titre (toutes les villes du voyage, sans répéter la même), référence, dates et villes lues sur les étapes, voyageurs, statut. Un nom choisi (« 40 ans ») reste. Chips de ce qui manque (passeport, courriers hôtel encore ouverts, montant non montré). Onglets sur une ligne ; À faire reste, avec le compte.
- Lieu et dates **en haut** : une ligne par séjour et une ligne par trajet. Le même hôtel aux mêmes dates, ou le même trajet le même jour, n’apparaît qu’une fois (Milano = Milan, Roma = Rome). Un autre hôtel et l’autre sens restent. Pas un seul champ Lieu + un seul départ/retour quand des étapes existent. Ne pas réécrire `destination` / dates du dossier pour coller à l’affichage.
- Cartes datées. Vol : villes en titre, code aéroport dessous, n° de vol, classe, horaire et référence dans le détail. Le document lié reste replié : un clic sur la ligne le déroule en vignette, même format que Pièces jointes, avec Retirer. Étape pas encore montrée : surbrillance, pas une bannière qui ne fait que compter. Retirer, modifier, ajouter, réordonner ou montrer une étape attend le bouton Enregistrer du séjour : il s’allume, et le bandeau « Modifications non enregistrées » apparaît. Un Enregistrer qui reste gris après ce geste est un bug. Le montant du séjour suit le prix saisi sur la carte tout de suite, avant cet enregistrement.
- Pas de roster hôtel (rôle, nom, e-mail) sur la carte. Un libellé court (le nom de l’hôtel) suffit. Le formulaire d’envoi (fil et courrier) coche les destinataires.
- Argent : un bloc (qui paie, montant, grand livre). Les mails ne sont pas des lignes d’étape.
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

Admin (`AdminNav`, modèle dans `lib/crm/admin-nav.ts`) : sidebar en groupes repliables (état `localStorage`) — **Activité** (Tableau de bord) · **Clients** (Clients, Pièces à échéance [badge]) · **Dossiers** (Réservations, Formalités, Services à confirmer) · **Argent** (Transactions, Revolut [badge], Pliant) · **Boîtes de réception** (E-mails [badge], Little Emperors [badge]) · **Outils** (Messages types WhatsApp, Diagnostic Gmail, Aperçu espace client hors prod) · **Équipe** (admins).
Un seul CTA **Nouveau dossier** → `/admin/reservations/nouveau`. L’avatar ouvre le menu utilisateur (nom, rôle, WhatsApp agence, Déconnexion) : pas de « Sortir » épars.
Téléphone (< 1024) : en-tête 56 px (logo, titre court, loupe → recherche en overlay, avatar) et barre basse fixe **Accueil / Clients / Dossiers / Argent / Plus** (badges Argent = Revolut, Plus = E-mails + LE) ; « Plus » ouvre une feuille basse (Boîtes, Outils, Équipe, utilisateur).
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
