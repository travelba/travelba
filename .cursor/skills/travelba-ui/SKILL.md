---
name: travelba-ui
description: >-
  Travelba UI: Stitch Sovereign Horizon, French copy, Lucide icons, CoverPhoto
  img, short /api/files URLs, loading skeletons, l’agence voice. Use when
  changing layout, styling, client chrome, admin chrome, design tokens, or
  rejecting dummy Stitch copy (Privilège, cloche, 24/7, VIP).
---

# Travelba — UI

## Design

Source : Stitch **Portail Client Agence Voyage**  
`https://stitch.withgoogle.com/projects/10475551423344387411`  
Thème **Sovereign Horizon** : marine `#0B192C` (`--admin-navy`), champagne `#C5A880` (`--admin-gold`).

**Interdit** : feuille Stitch « Travelba CRM » (`17895849105622121084`), Aura Voyages (`7750686585265203965`), DS émeraude Atelier, Material Symbols CDN, URL logo `lh3.googleusercontent.com`.

Export : `@google/stitch-sdk` + `STITCH_API_KEY` dans `.env.local` (jamais git). IDs d’écrans : `docs/design/stitch/README.md`. Porter **composition et tokens**, jeter le HTML Stitch (Tailwind CDN, données fictives).

Ne pas shipper le copy des maquettes : Privilège, cloche, 24/7, points club, GDS Sabre, Cellule VIP, ni les libellés Planning / Trésorerie. L’admin dit Tableau de bord, Clients, Réservations, Transactions, Revolut. Logo **TBA**.

Espace client : colonne ~480px (`AccountChrome`). Admin : sidebar `AdminNav`.

## Typo / icons / images

- Fonts `app/layout.tsx` : Plus Jakarta + Inter preload ; Space Grotesk `preload: false`.
- Icons : `components/crm/icons.tsx` (Lucide, **noms historiques** `flight`, `hotel`, `chat`…). Ajouter un mapping, pas un import Material.
- Couvertures et scans : `components/crm/CoverPhoto.tsx` = `<img>` natif (`referrerPolicy=no-referrer`). Pas de `next/image` sur Unsplash/signed (layout shift + puppeteer).
- Fichiers : `src="/api/files?path=..."` uniquement. Jamais coller une signed URL Supabase dans le DOM (expire + fuite).

## Copy

- Français uniquement dans `/admin` et `/mon-compte`.
- Voix : **l’agence** (WhatsApp `siteConfig.whatsappNumber` `33756841315`). Pas la formule « 24/7 ».
- Modifier une résa : `Bonjour, je voudrais modifier {réf} — {destination}.`
- Pas de cloche / badge notif fantôme. Le point or sur l’avatar n’est pas une inbox.
- Dates `formatDateFr` / `DateFrInput` (`lib/crm/money.ts`, `components/crm/fields.tsx`). Heure `HHhMM` via `itemClock` (vide si minuit).
- Encours : afficher +/− réel.
- Photo de couverture : ville d’arrivée. Si l’image n’est pas la ville (Marrakech encore en photo de Paris), le `cover.webp` stocké gagne encore sur Unsplash — skill `travelba-carnet`, ce n’est pas un cache CSS.

## Nav figée

Client bas / header : **Accueil / Réservations / Transactions / Mon compte**.  
Profil : **Vous / Pièces / Voyageurs / Facturation**. Pas « Cartes », pas WhatsApp champ.

Admin : Tableau de bord, Clients, Réservations, Transactions, Revolut (badge unmatched).

## Perf perçue

- `loading.tsx` à côté de chaque `page.tsx` liste/détail CRM.
- Actions carnet dans le **header** éditeur (pas de barre `fixed`/`sticky` qui recouvre l’ingest).
- `next/font` : ne pas preloader trop de familles (Space Grotesk déjà off).

## Accessibilité minimale

Boutons icon-only : `aria-label` FR. Formulaires : `Field` label visible, pas placeholder seul.

## Vérif visuelle

Changer un écran ⇒ skill `travelba-verify` (desktop + mobile 390px pour le client). Ne pas se fier à un seul screenshot.
