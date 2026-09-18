---
name: travelba-document-ingest
description: >-
  Maps real agency PDFs (Amadeus e-tickets, Little Emperors hotel
  quotes/bookings, TAAP/Talixo transfers, French passports) onto Travelba
  booking and identity fields. Use when importing PDFs/images into a
  reservation, tuning ingest prompts, OCR, or document dropzones.
---

# Import documents Travelba

Pipeline résa : `unpdf` (texte + images si calque pauvre) → OpenAI `gpt-4o` (`OPENAI_API_KEY`) → relecture humaine → `persistNewBookingFromExtract` (statut `draft`).
Pipeline identité : photo MRZ (Tesseract + `mrz`), **pas** le dropzone réservation.

Code : `lib/crm/ingest-booking.ts`, `lib/crm/ingest-types.ts`, `components/crm/BookingIngest.tsx`.
Identité : `lib/crm/ocr-document.ts`, `lib/crm/mrz-parse.ts`.
Couvertures : `lib/crm/cover-generate.ts` — OpenAI Images (`gpt-image-1`, fallback `dall-e-3`) puis Gateway Gemini seulement si `AI_GATEWAY_API_KEY`.
Limites : **30 fichiers**, **25 Mo** chacun.

## Ne jamais fusionner ces voyages

Un dépôt de fichiers = **un** dossier. Si dates / destinations / noms divergent, extraire un seul voyage et le dire dans `notes_client`.

| Famille | Indices | Dossier |
|---------|---------|---------|
| E-ticket Amadeus | « Reçu de Billet Electronique », Référence du dossier 6 lettres, CheckMyTrip | Un PNR = un itinéraire aérien |
| Little Emperors quote | IATA 96020293, « none are on hold », pas de booking name | `document_status=quote` |
| Little Emperors booking | « Reservation Details », Booking Reference, Booking name | Hôtel confirmé |
| TAAP / Talixo | « Détails du voyage TAAP », n° 14 chiffres, Talixo | Transfert, pas un vol |
| Passeport FR | MRZ `P<FRA`, scan souvent sans calque texte | Profil / documents, pas une résa |

## E-ticket Amadeus (PDF texte)

Champs :

- `confirmation_ref` = **PNR GDS** (bandeau « Référence du dossier », 6 lettres).
- `details.pnr` = réf. compagnie (`AF/Y2FYWL`, `X1/N0OP1Q`, `TA/Y9JCXV`).
- `airline` / `details.airline` = **transporteur opérant** (« Opéré par Air Panama »), pas Hahn Air (émetteur 169-).
- `supplier` = compagnie émettrice du billet.
- Aller et retour = **deux** items `flight`. **Interdit** d’inventer le retour.
- `details.from` / `to` = IATA (`CDG`, `RAK`, `MIA`, `SJO`, `PAC`, `BOC`).
- Horaires ISO tels qu’imprimés. Classe : Economique + code tarif (L, W, K, Y) dans `details.cabin`.
- Voyageur = ligne Passager (casse normale).
- Email agence (`contact@travelbt.fr`) ≠ `customer_email`.
- **Ne jamais** extraire le mode de paiement / PAN masqué.
- Bagages `0PC` / `1PC` / `2PC` → `details.notes` si utile, pas un item.

## Devis hôtel Little Emperors / My Concierge

Signaux : « All prices listed are subject to availability and change, none are on hold », plusieurs blocs tarifaires, pas de nom.

- `document_status=quote`, `total_amount=null`.
- Un item `hotel` **par option** (chambre + prix). Ne pas prendre la première ligne comme le dossier.
- Dates header (`5 Aug - 8 Aug 2026`) → `start_date` / `end_date`.
- Devise du symbole : CHF, EUR, USD. « 2 adults » / « 6 adults » ≠ voyageurs nommés — ne pas créer de lignes vides.
- Pas de `confirmation_ref`.

## Réservation hôtel Little Emperors

Signaux : Reservation Details, Booking Reference, Booking name, Total en $.

- `document_status=confirmed`.
- Deux refs `97620170;97620172` + deux Booking name = **deux** items hotel + deux voyageurs.
- `$858.80` → `currency=USD`, `total_amount=858.8`. Ne pas défaut EUR.
- Adresse → `details.address`. Room type → `details.room`.
- **Interdit** d’inventer check-in 15:00 / check-out 12:00 s’ils ne sont pas écrits.
- Benefits (breakfast, upgrade) → `details.notes`.

## Transfert TAAP / Talixo / Expedia

- `kind=transfer`, `supplier=Talixo`.
- `confirmation_ref` = n° voyage (14 chiffres).
- `details.pickup` / `details.dropoff` — **pas** `from`/`to`.
- L’heure d’un vol citée (« Air Panama 682 — 09:30 ») n’est **pas** l’heure de prise en charge. Pickup hôtel = souvent « 2,5 h avant le vol » sans heure clock.
- Un vol mentionné sur le bon n’ajoute un item `flight` que s’il y a aussi un e-ticket.

Noms : `YANIK` (billet) et `YANNICK` (TAAP) = même personne — matcher en normalisant, pas créer un doublon.

## Passeport (scan PDF)

Le dropzone résa refuse l’identité (`document_status=identity`). Photo JPEG/PNG/HEIC via `/api/.../scan`.

Un PDF passeport n’a souvent **aucun texte** : rasteriser la page ou photographier la zone MRZ.

VIZ + MRZ TD3 :

- Ligne 1 `P<FRA` + nom `<<` prénoms
- Ligne 2 n° + `FRA` + naissance AAMMJJ + sexe + expiration AAMMJJ
- OCR : `L` répétés → `<`. Recadrer le bas du document.

Ne pas logger n° de passeport / MRZ.

## UI / persist

- Relecture obligatoire. Quote → bandeau « tarifs non bloqués ». Identity → pas d’enregistrement résa.
- Agence : résa créée en `draft`, `visible_to_client=false`. Pas de débit ledger tant que `confirmed`.
- Fichiers via `/api/files`, jamais d’URL signed longue côté client.
- Après création, une couverture destination est générée (`scheduleBookingCover`) et stockée dans `crm-files` (`bookings/{id}/cover.webp`).
- Max 30 fichiers, 25 Mo, PDF/images.

## Quand toucher au prompt

Toute erreur d’import réelle (vol retour fantôme, devise EUR sur un $, devis pris pour une résa) se corrige **dans** `PROMPT` de `ingest-booking.ts` + une ligne ici. Ne pas ajouter Tesseract sur les e-tickets : le calque texte PDF + `gpt-4o` suffisent. Ne pas brancher l’import sur le AI Gateway tant que `OPENAI_API_KEY` est présent.
