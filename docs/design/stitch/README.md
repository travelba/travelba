# Travelba × Google Stitch

Archive. Les retouches visuelles se font dans **Cursor Design Mode** sur l’app qui tourne, pas dans ce projet.

Ancien export : **Portail Client Agence Voyage**  
ID : `10475551423344387411`  
URL : https://stitch.withgoogle.com/projects/10475551423344387411

Écrans figés (HTML + PNG dans `atelier/`) : **Sovereign Horizon** — marine `#0B192C`, champagne `#C5A880`, ivoire `#FAF9F6`, Plus Jakarta Sans.

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
| Dashboard Agence & Pilotage | DESKTOP | `439d30444c774ddebdfd5a9b81100aba` | `/admin` |
| Clients & Fiche Voyageur | DESKTOP | `fea54e6f80df4d16ba99340210a5686c` | `/admin/clients/[id]` |
| Planning & Gestion Réservations | DESKTOP | `6f783ff9f98743649ec57b9e600a7c23` | `/admin/reservations/[id]` |
| Trésorerie & Dépenses Dossiers | DESKTOP | `647a2e5c6785433281a3482b6aa6e35b` | `/admin/transactions` |
| Validation Documents & Passeports | DESKTOP | `b80fd53a7de34ffa8480e5934e9db3ea` | pièces sur `/admin/clients/[id]` |

Revolut (rapprochement) n’a pas de maquette Stitch : même chrome, route `/admin/revolut`.

Ne plus exporter ni porter un écran depuis Stitch. Les textes fictifs de ces HTML (Privilège, cloche, météo, conseiller nommé) ne sont pas du copy produit.

## Portage Next.js

Tokens CRM : `.admin-af` (Sovereign, sidebar marine) + `.account-app` (même palette, composition mobile).
