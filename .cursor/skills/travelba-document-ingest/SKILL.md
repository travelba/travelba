---
name: travelba-document-ingest
description: >-
  Pièce centrale Travelba : qualité et fiabilité de l’import PDF/photos vers
  les cartes carnet (e-tickets Amadeus, Little Emperors, Nantipa, The Leela,
  SIXT, TAAP/Talixo, devis). Use when the user sends PDFs or images, trains
  extraction, tunes ingest-parse / PROMPT / merge, BookingIngest, or PAN
  redaction. Identity scans (passeport MRZ) use travelba-identity instead.
---

# Travelba — import (qualité)

Cœur produit **avec** le carnet. Une carte fausse publiée = un client mal informé.
L’agent (humain) relit, **Enregistre**, puis **Publie** (skill `travelba-carnet`).
L’IA ne publie jamais.

Agence **seule**. `app/api/client/bookings/**/ingest` = 404.
Identité / MRZ : skill `travelba-identity` — **pas** ce dropzone.

## Contrat (non négociable)

1. **Ne jamais inventer.** Absent = `null`. Pas de 15:00 / 12:00, pas de petit-déj, pas de franchise.
2. **Prix extraits = null.** `$` / CHF / INR / € du PDF = net interne. L’agent saisit le **prix vendu**.
3. **Pas de PAN / CVC / fidélité / paiement.** `redactIngestText` avant le modèle.
4. **Un séjour par dépôt.** Fichiers hétérogènes : le plus complet + `notes_client`.
5. **Relecture humaine** puis Enregistrer (`visible_to_client=false`).
6. **Ne pas persister** les PDF d’entraînement en prod. **Ne pas committer** PDF / RAW / PII.

Toute erreur réelle (retour fantôme, 10 cartes pour 10 passagers, EUR sur un $, hôtel fantôme) se corrige dans **trois** endroits : parseur déterministe + test anonymisé + une ligne ici **et** dans `PROMPT`.

## Pipeline

```
PDF/image
  → unpdf (texte ; images si calque < 500 chars)
  → redactIngestText (PAN, CCVI, fidélité)
  → structuredHintFromPdfText (indices)
  → gpt-4o  (OPENAI_API_KEY sk- ; pas Tesseract e-tickets)
  → applyStructuredHints + mergeExtractItems + sanitizeExtractedPrices
  → UI relecture (IngestItemCard)
  → Enregistrer brouillon
```

Parseur **d’abord**, LLM **ensuite**. Si le PDF a un calque, le déterministe doit déjà produire les bonnes cartes. Le modèle complète noms / libellés FR / doutes (`needs_review`).

Limites : **30 fichiers**, **25 Mo**, PDF + images.

## Quand un PDF / une photo arrive

C’est **ce** skill. Boucle courte :

1. Extraire le texte (`unpdf`) vers `/tmp` — jamais git.
2. Classifier la famille (table ci-dessous). Ne pas echo PII (noms, e-mail, tel, n° carte, n° fidélité).
3. Fixture **anonymisée** dans `lib/crm/ingest-parse.test.ts` (Pax / Guest Test, PNR fictif).
4. Étendre le parseur dans `lib/crm/ingest-parse.ts` (aéroport, date, kind).
5. Une ligne dans `PROMPT` (`ingest-booking.ts`) **et** dans la section famille ici.
6. `npx tsx --test lib/crm/ingest-parse.test.ts lib/crm/item-match.test.ts`
7. Ne **pas** `persistNewBookingFromExtract` sur un vrai client pour « voir ».

Pièces iOS parfois absentes du VM : le dire, demander le trombone desktop, ou lire la boîte agence **RAW** sans committer.

## Familles → parseur

| Famille | Indices | Sortie |
|---------|---------|--------|
| E-ticket Amadeus | « Reçu de Billet Electronique », PNR 6 car. | `parseAmadeusFlights` — **1 item / segment** |
| Little Emperors booking | Reservation Details + Booking Reference | `parseLittleEmperorsHotel` — **1 hôtel**, `rooms[]` |
| Little Emperors quote | IATA 96020293, « none are on hold » | `document_status=quote`, invisible |
| Nantipa | NANTIPA + Reservation Number, dates `08/02/2026` | `parseNantipaConfirmation` — MM/JJ, date only |
| The Leela / lettre EN | `14-SEP-26`, RESERVATION CONFIRMATION | `parseHotelConfirmationLetter` — date only, TENTATIVE → `needs_review` |
| TAAP / Talixo | TRANSFER CONFIRMATION, DROPOFF, Itinéraire | `parseTransferConfirmation` |
| SIXT | Pickup on / Return on / catégorie | `parseSixtCar` — `kind=car` |
| Passion Collection | Devis, NET, options | quote — **pas** de NET |
| Toucan Discovery | étapes du cadre + excursions | `activity` — les étapes **ne sont pas** des hôtels |
| Passeport | MRZ `P<FRA` | **identité**, pas une résa |

IATA **8 chiffres** (20287864, 20255270, 96020293, 20289905) = code agence, **jamais** un PNR.

## Vol

- Aller + retour **imprimés** (même PDF) = **deux** cartes. Correspondance = deux. Pas de retour fantôme.
- 10 e-tickets passagers du **même n° + jour** = **une** carte. Noms → `travelers`.
- `confirmation_ref` = PNR GDS. `details.pnr` = réf. compagnie (`AF/AB12CD`).
- `details.airline` = **opérant**. `supplier` = émetteur (Hahn Air ≠ Air Panama).
- `details.from` / `to` = IATA (souvent absent du PDF) ; `city_from` / `city_to` = villes.
- Horaires ISO locaux. « 03 August 09:45 » + année de « Lundi 03 août 2026 ».
- Terminal / siège si imprimés. « Heure limite d’enregistrement » ≠ horaire du vol.
- « Scan for check-in » ≠ hôtel. Carte fidélité : masquer, ne pas extraire.
- Email agence ≠ `customer_email`.

Aéroports déjà mappés (`inferAirportIata`) : Gelabert/Albrook `PAC`, Isla Colón `BOC`, Enrique Malek `DAV`, Tocumen `PTY`, Charles-de-Gaulle `CDG`, Genève `GVA`, Heathrow `LHR`, Marseille Provence `MRS`. **Nouveau nom d’aéroport sans IATA → une entrée + un test**, pas un guess LLM.

## Hôtel

**Un item par établissement**, même 2 chambres / 2 Booking name / 2 réf.

- `details.rooms = [{ room, guests, confirmation_ref }, …]`
- `confirmation_ref` = `97620170;97620172` — `findMatchingItem` par **recouvrement** de réf.
- `included[]` seulement si phrase explicite (Daily breakfast…). Sinon `[]`.
- Dates header → `start_at` / `end_at` **sans heure** si seule la date est une date de séjour.
- Politique 15:00 / 14:00 / 12:00 / Pick Up 00:00 → **ignorer** (pas l’horloge de la carte, pas un transfert).
- Nantipa `08/02/2026` = 2 août (US), pas 8 février.
- Devis : `quoted`, `rooms` = options, **pas** un item par tarif. Invisible tant que non publié.

## Transfert / voiture / reste

- Transfert : `pickup` / `dropoff` (pas `from`/`to`). « 2 h 30 avant le vol » → `pickup_note`, pas d’heure inventée. Vol sur le bon → `flight` seulement s’il y a un e-ticket.
- SIXT : `kind=car`, n° résa, prise/restitution (`18 Septembre 2026 at 16:00`), `vehicle` = catégorie. **Pas** CHF TTC, caution, protection, plein.
- Train / bateau : horaires **écrits**. Croisière = une carte, pas un jour par port.
- `YANIK` / `YANNICK` = même personne.

## Fusion (`item-match.ts`)

| Kind | Clé |
|------|-----|
| flight | `flight_number` + jour, sinon PNR + jour |
| hotel | recouvrement des réf. `;`, sinon nom + jour |
| car / transfer / activity / rail | réf. sinon titre + jour |

Réimport même clé = **remplace** la carte. Dans un même extract, 10 duplicatas → 1 item (`mergeExtractItems`). Aller et retour (n° ou jours différents) → 2 items.

## Voyageurs / titre

- Noms imprimés, casse normale. « 2 adults » sans noms → Adulte 1 / Adulte 2.
- Pas d’enfant sans nom.
- `title` / `destination` : villes séparées par ` · `.

## UI persist

- Sous-fiche par `kind`. Bandeau devis. Bandeau **À vérifier** (`needs_review`) : on **enregistre**, on ne refuse pas tout le lot.
- Cartes manuelles OK. Drag `sort_order` après persist.
- Fichiers `/api/files` (pas d’URL signed longue). Cover `scheduleBookingCover`.
- Identity extract → ne pas `persistNewBookingFromExtract`.

## Fichiers

| Rôle | Path |
|------|------|
| Orchestration + `PROMPT` | `lib/crm/ingest-booking.ts` |
| Parseurs déterministes | `lib/crm/ingest-parse.ts` |
| PAN | `lib/crm/ingest-redact.ts` |
| Schéma + prix null | `lib/crm/ingest-types.ts` |
| Fusion | `lib/crm/item-match.ts` |
| Tests | `lib/crm/ingest-parse.test.ts`, `item-match.test.ts` |
| UI | `components/crm/BookingIngest.tsx`, `IngestItemCard.tsx` |
| API agence | `app/api/admin/bookings/ingest` (`maxDuration` 300) |

## Vérifier

```bash
npx tsx --test lib/crm/ingest-parse.test.ts lib/crm/item-match.test.ts lib/crm/carnet.test.ts
npx tsc --noEmit
```

Un parseur sans test sur la famille du PDF **n’est pas** livré. Fixtures git = texte anonymisé, pas le PDF.
