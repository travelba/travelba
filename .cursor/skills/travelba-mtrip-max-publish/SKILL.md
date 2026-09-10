---
name: travelba-mtrip-max-publish
description: >-
  Rules for rich mTrip trip publishing from Travelba CRM: maximize images
  (LE inventories ≤5 photos), flights, destinations, prices, and app options.
  Enforce geo consistency (never attach a US hotel to a Marrakech trip).
  Use when editing publish-guide, build-trip, le-hotel-media, map-guide-to-trip,
  mTrip publish API, or when the user says myTrip/mTrip is disappointing,
  missing photos, wrong hotel country, thin itinerary, or asks to use all
  mTrip options.
---

# Travelba — publication mTrip « MAX »

## Règle absolue — contenu riche

Un voyage publié depuis le CRM **ne doit jamais** être un squelette minimal
(1 destination vide + hôtel sans photo + zéro vol).

Référence qualité : scripts Benamara (`scripts/create-benamara-mtrip.mjs`,
`scripts/update-benamara-hotels-media.mjs`) + `docs/cahier-des-charges-mtrip.md`.

## Règle absolue — cohérence geo (critique)

**0 hébergement hors pays/ville du trip.**

- Dériver la destination depuis les **vols** (ex. arrivée `RAK` → Marrakech / `MA`)
  via `inferTripDestinationContext` avant tout enrichissement LE.
- Photos / inventory LE **uniquement** si l’hôtel LE matche ce contexte
  (`hotelMatchesTripContext` : texte location + distance ≤ ~450 km).
- **Ne jamais** prendre le 1er hit `predictiveSearch` (`hotels[0]`) sans score + filtre geo.
- Un faux match (autre pays) est **pire** qu’aucune photo : skip soft, garder
  le nom CRM + `city` / `country_code` du voyage.
- Anti-exemple : séjour Marrakech enrichi avec un « Ranch » aux USA → pin carte US + 2e hébergement incohérent.

## Checklist obligatoire à chaque publish

1. **Contexte destination** (`inferTripDestinationContext`) avant LE  
2. **Photos hôtels** — inventory ≤ 5 URLs **seulement si match geo**  
   - Helper : `lib/mtrip/le-hotel-media.ts`  
3. **Cover trip + destinations** cohérents avec le pays du trip  
4. **Vols** depuis extraction / devis → `flights[]`  
5. **Hôtels** : dédup (nom / réf.), ignorer noms bruit (« Hôtel », « Confirmation… »)  
6. **Prix** depuis `quote_lines`  
7. **Options** : `sort_items_by_position`, `type_4`, `booking_visibility`, contact agence  
8. **Auth** : uniquement `mtrip_account_id` (TBT test `66582`) — jamais + `primary_id`  
9. Documents : URL ≤ 255 car. seulement

## Ne pas faire

- Enrichir LE sans filtre pays/ville (bug Marrakech → US)  
- Publier sans tenter l’enrichissement LE *quand* un match sûr existe  
- Utiliser le nom de fichier Capture… comme titre (skill `travelba-confirmation-import`)  
- Invitations email mTrip si login = alias `+tba…`  
- Laisser le pipeline CRM plus pauvre que les scripts Benamara

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `lib/mtrip/publish-guide.ts` | Orchestration publish MAX + geo |
| `lib/mtrip/le-hotel-media.ts` | 5 photos + inventory + filtre geo |
| `lib/mtrip/map-guide-to-trip.ts` | Vols, dest context, prix, dédup séjours |
| `lib/mtrip/build-trip.ts` | Defaults TBT (`buildBestTrip`) |
| `lib/mtrip/client.ts` | `upsertTrip` / `upsertInventory` |
| `app/api/admin/mtrip/guides/[id]/publish/route.ts` | API publish |

## Quand l’utilisateur se plaint de myTrip

1. Hébergement mauvais pays / 2 hébergements absurdes → vérifier matching LE + dédup  
2. Puis photos, vols, covers  
3. Corriger le code publish — pas un script manuel hors CRM  
4. Re-publier (upsert même `identifier`)
