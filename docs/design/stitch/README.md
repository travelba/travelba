# Travelba × Google Stitch

Source de vérité : **Portail Client Agence Voyage**  
ID : `10475551423344387411`  
URL : https://stitch.withgoogle.com/projects/10475551423344387411

Écrans visibles (HTML dans `atelier/`) : **Sovereign Horizon** — marine `#0B192C`, champagne `#C5A880`, ivoire `#FAF9F6`, Plus Jakarta Sans.

Le projet Stitch contient aussi le DS **Atelier Voyage Sur-Mesure** (émeraude). Ne pas l’appliquer : les maquettes actives sont marine / champagne.

Ne plus utiliser Aura Voyages (`7750686585265203965`) ni **Travelba CRM** (`17895849105622121084`).

Hors sujet : site marketing (`app/[locale]/page.tsx`, `app/[locale]/legal/page.tsx`). `/mon-compte/carnet` redirige vers le carnet du prochain séjour — pas de feuille dédiée.

## Écrans Stitch ↔ routes

### Espace client (mobile 390px)

| Écran | Device | ID | Route |
|---|---|---|---|
| Accueil Client | MOBILE | `1479bcbe830d4a78a670af62d2af4656` | `/mon-compte` |
| Mes Réservations | MOBILE | `a8c60eaa789e4fde82580c7156ad569d` | `/mon-compte/reservations` |
| Transactions & Budget | MOBILE | `26598459c59c407b8f601be374005cf1` | `/mon-compte/transactions` |
| Mon Compte & Documents | MOBILE | `82a4959a0f0b436fadf034bea652c8e6` | `/mon-compte/profil` |

Dock : Accueil / Réservations / Transactions / Mon Compte.

### Back-office (desktop)

| Écran | Device | ID | Route |
|---|---|---|---|
| Dashboard Agence & Pilotage | DESKTOP | `0afcdddbd0e14cc49c3b3ef2b56f69ef` | chrome `/admin` (sidebar + topbar) |

Pages admin internes (clients, résas, ledger, Revolut) : mêmes tokens, pas de maquette dédiée.

Les HTML dans `atelier/` sont le dernier export figé. Relancer `@google/stitch-sdk` + `STITCH_API_KEY` pour rafraîchir depuis le projet live. Porter **composition et tokens**, jamais le copy fictif (Privilège, cloche, 24/7, points club).

## Portage Next.js

Tokens CRM : `.admin-af` (Sovereign) + `.account-app` (même palette, composition mobile).
