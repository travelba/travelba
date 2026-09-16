# Travelba × Google Stitch

Source de vérité : **Application Agence de Voyage Client**  
ID : `7750686585265203965`  
URL : https://stitch.withgoogle.com/projects/7750686585265203965

Design system : **Aura Voyages** (`assets/ac75f4f6570444d9b009a08aedd2fdbc`)  
Tokens : bleu nuit `#0E2439`, terracotta `#E06D53`, or `#D4AF37`, canvas sable `#F8F6F0`, Plus Jakarta Sans + Space Grotesk.

Ne pas utiliser **Travelba CRM** (`17895849105622121084`).

Hors sujet : site marketing (`app/[locale]/page.tsx`, `app/[locale]/legal/page.tsx`). `/mon-compte/carnet` redirige vers le carnet du prochain séjour — pas de feuille dédiée.

## Écrans Stitch ↔ routes

### Espace client (dock mobile 390px)

| Écran | Device | ID | Route |
|---|---|---|---|
| Accueil - Tableau de bord client | MOBILE | `53d719eafdb4467faf8423642ba96db3` | `/mon-compte` |
| Mes Réservations | MOBILE | `55338b0d180b43c69b30ee47fc3b6759` | `/mon-compte/reservations` |
| Carnet de voyage détaillé | MOBILE | `4380d5c988a04dc6a915360552ecd5e9` | `/mon-compte/reservations/[reference]` |
| Transactions & Solde Revolut | MOBILE | `2a0a03d967e3464ab33c62581950ab86` | `/mon-compte/transactions` |
| Mon Compte & Paramètres | MOBILE | `f1b49a0c21714d728c31838975715f06` | `/mon-compte/profil` |
| Compagnons de voyage — Travelba | MOBILE | `97446f6eef03470e9ae7076f8219cf0c` (doublon `612f9aef5b484716ab901ac7ebebab77`) | `/mon-compte/profil/compagnons` |
| Coffre-fort documents — Travelba | MOBILE | `14cb4bdcf226403d97a4cd4a283a06ed` | `/mon-compte/profil/documents` |
| Connexion voyageur — Travelba | MOBILE | `8a0f31b9cb294257bde2950d3d928d70` | `/connexion` |
| Moyens de paiement — Travelba | MOBILE | `05a8976d10e5468b8afcd7a4cf14958b` | `/mon-compte/profil/paiement` |

Variantes tablette / desktop (peuvent rester) :

| Écran | Device | ID | Route |
|---|---|---|---|
| Connexion Espace Voyageur — Travelba | DESKTOP | `bd609cb16b61428eb2feee2b242f5e76` | `/connexion` |
| Moyens de paiement — Travelba | DESKTOP | `dc0070fdc5ea48038c51d8c6347ddba7` | `/mon-compte/profil/paiement` |

### Back-office (desktop 2560)

| Écran | Device | ID | Route |
|---|---|---|---|
| Tableau de bord — Back-office Travelba | DESKTOP | `2f19ff20e6b54e24962aceaeab17f2b9` (doublon `75f916ad4c8d4166a0c92ae12f7128e2`) | `/admin` |
| Connexion Agent Back-office — Travelba | DESKTOP | `9db78238300b46bdbc228d35984b005e` | `/admin/login` |
| Gestion des Clients — Travelba Admin | DESKTOP | `57e7c97c9e594397b7924c96a808f664` | `/admin/clients` |
| Fiche client — Marie Dupont (Travelba Admin) | DESKTOP | `f8f554f2410e4a83a5b29da9819ceb3b` | `/admin/clients/[id]` |
| Gestion des Réservations — Travelba Admin | DESKTOP | `81381851193f4d7e861344245baad663` | `/admin/reservations` |
| Détail Réservation TBA-2026-014 — Travelba Admin | DESKTOP | `1f2fe7dc20774135a51f91df3307b418` | `/admin/reservations/[id]` |
| Grand livre — Travelba Admin | DESKTOP | `20a46296a2f14ab189ba8ab9bc97dea9` | `/admin/transactions` |
| Rapprochement Revolut — Back-office Travelba | DESKTOP | `a707158475db422697216ab94fd5cc15` (doublon `53559c563e9947d79fd6ded1f3635244`) | `/admin/revolut` |

### Assets (pas des routes)

- Logo Aura Voyages `d0bed4a31a9946d4a289aeca46034c35`
- Portrait headshot `684a0a13e8b148cf82908a8d39e195dd`

## Portage Next.js

Les 5 écrans du plan sont dans l’app : `/connexion`, `/mon-compte/profil/documents`, `/mon-compte/profil/paiement`, `/admin/clients`, `/admin/transactions`.
