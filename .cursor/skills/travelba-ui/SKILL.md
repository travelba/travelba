---
name: travelba-ui
description: >-
  Travelba UI: Stitch Sovereign Horizon, French copy, Lucide icons, CoverPhoto
  img, short /api/files URLs, loading skeletons, l’agence voice. Use when
  changing layout, styling, client chrome, admin chrome, or design tokens.
---

# Travelba — UI

## Design

Source : Stitch **Portail Client Agence Voyage**  
`https://stitch.withgoogle.com/projects/10475551423344387411`  
Thème **Sovereign Horizon** : marine `#0B192C` (`--admin-navy`), champagne `#C5A880` (`--admin-gold`).

**Interdit** : feuille Stitch « Travelba CRM », Aura Voyages émeraude, Material Symbols CDN.

Espace client : colonne ~480px (`AccountChrome`). Admin : sidebar `AdminNav`.

## Typo / icons / images

- Fonts `app/layout.tsx` : Plus Jakarta + Inter preload ; Space Grotesk `preload: false`.
- Icons : `components/crm/icons.tsx` (Lucide, **noms historiques** `flight`, `hotel`, `chat`…). Ajouter un mapping, pas un import Material.
- Couvertures et scans : `components/crm/CoverPhoto.tsx` = `<img>` natif (`referrerPolicy=no-referrer`). Pas de `next/image` sur Unsplash/signed (layout shift + puppeteer).
- Fichiers : `src="/api/files?path=..."` uniquement. Jamais coller une signed URL Supabase dans le DOM (expire + fuite).

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

Admin : Tableau de bord, Clients, Réservations, Transactions, Revolut (badge unmatched). Rapprochement : popup recherche client (`CustomerPickDialog`), pas un select natif.

## Perf perçue

- `loading.tsx` à côté de chaque `page.tsx` liste/détail CRM.
- Actions carnet dans le **header** éditeur (pas de barre `fixed`/`sticky` qui recouvre l’ingest).
- `next/font` : ne pas preloader trop de familles (Space Grotesk déjà off).

## Accessibilité minimale

Boutons icon-only : `aria-label` FR. Formulaires : `Field` label visible, pas placeholder seul.

## Vérif visuelle

Changer un écran ⇒ skill `travelba-verify` (desktop + mobile 390px pour le client). Ne pas se fier à un seul screenshot.
