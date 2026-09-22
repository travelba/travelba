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
2. **Prix extraits** : montant PDF/photo → `details.document_amount` (un par fichier). `item.amount` reste **null**. `total_amount` est **prérempli** (somme des documents) ; l’agent corrige le prix vendu. Enregistrer une confirmation écrit le montant du séjour **et** le débit ledger (`syncBookingLedger`). Pas une ligne « NET » fournisseur seule.
3. **Pas de PAN / CVC / fidélité / paiement.** `redactIngestText` avant le modèle.
4. **Un séjour par dépôt.** Fichiers hétérogènes : le plus complet + `notes_client`.
5. **Relecture humaine** puis Enregistrer (`visible_to_client=false`).
6. **Ne pas persister** les PDF d’entraînement en prod. **Ne pas committer** PDF / RAW / PII.

Toute erreur réelle (retour fantôme, 10 cartes pour 10 passagers, EUR sur un $, hôtel fantôme) se corrige dans **trois** endroits : parseur déterministe + test anonymisé + une ligne ici **et** dans `PROMPT`.

## Pipeline

```
PDF/image
  → PUT signed crm-files ingest-tmp (contourne la limite Vercel ~4,5 Mo)
  → unpdf texte intégral (parseur, pas de coupe 24k)
  → classifyIngestFamily + parsedItemsFromText
  → si famille connue et champs complets : pas de LLM sur ce PDF
  → sinon gpt-4o (texte ; vision si calque < 800 ou image)
  → calque vide : raster unpdf.renderPageAsImage (max 5 pages) ou Gemini PDF natif
  → fusion mergeFileExtracts (devis+confirmé, identité mélangée)
  → 1 passage reconcile compact (ne pas inventer)
  → UI relecture (progression NDJSON, retry, Enregistrer brouillon)
```

Parseur **d’abord**, LLM **ensuite**. Si le PDF a un calque, le déterministe doit déjà produire les bonnes cartes. Le modèle complète noms / libellés FR / doutes (`needs_review`). 10 e-tickets du même vol ne déclenchent pas 10 appels LLM.

Limites : **30 fichiers**, **25 Mo**, PDF + images. Envoi par URL signée courte, jamais une signed URL longue dans le HTML.

## Quand un PDF / une photo arrive

C’est **ce** skill. Boucle courte :

1. Extraire le texte (`unpdf`) vers `/tmp` — jamais git.
2. Classifier la famille (table ci-dessous). Ne pas echo PII (noms, e-mail, tel, n° carte, n° fidélité).
3. Fixture **anonymisée** dans `lib/crm/ingest-parse.test.ts` (Pax / Guest Test, PNR fictif).
4. Étendre le parseur dans `lib/crm/ingest-parse.ts` (aéroport, date, kind).
5. Une ligne dans `PROMPT` (`ingest-booking.ts`) **et** dans la section famille ici.
6. `npx tsx --test lib/crm/ingest-parse.test.ts lib/crm/item-match.test.ts lib/crm/ingest-pipeline.test.ts`
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
| Maeva / Pierre & Vacances | maeva.com + N° DE DOSSIER / VOS OPTIONS | `parseMaevaStay` — **1 hôtel** + forfaits / matériel / cours (`activity`) + assurance. Réf. dossier **sur l’hôtel seulement**. Dates only. Pas de frais de dossier, PAN, totaux à 0 |
| Passeport | MRZ `P<FRA` | **identité**, pas une résa |

IATA **8 chiffres** (20287864, 20255270, 96020293, 20289905) = code agence, **jamais** un PNR.

## Vol

- Aller + retour **imprimés** (même PDF) = **deux** cartes. Correspondance = deux. Pas de retour fantôme.
- 10 e-tickets passagers du **même n° + jour** = **une** carte. Noms → `travelers`. `details.ticket_count` = nombre de billets. Prix vendu = **unitaire par billet**.
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
- `details.hotel_name` + `title` = nom de l’établissement (**pas** la ville). `details.city` = ville (sous-titre itinéraire).
- Dates header → `start_at` / `end_at` **sans heure** si seule la date est une date de séjour.
- Politique 15:00 / 14:00 / 12:00 / Pick Up 00:00 → **ignorer** (pas l’horloge de la carte, pas un transfert).
- Nantipa `08/02/2026` = 2 août (US), pas 8 février.
- Devis : `quoted`, `rooms` = options, **pas** un item par tarif. Invisible tant que non publié.

## Transfert / voiture / reste

- Transfert : `pickup` / `dropoff` (pas `from`/`to`). « 2 h 30 avant le vol » → `pickup_note`, pas d’heure inventée. Vol sur le bon → `flight` seulement s’il y a un e-ticket.
- SIXT : `kind=car`, n° résa, prise/restitution (`18 Septembre 2026 at 16:00`), `vehicle` = catégorie. **Pas** CHF TTC, caution, protection, plein.
- Train / bateau : horaires **écrits**. Croisière = une carte, pas un jour par port.
- Maeva / Pierre & Vacances : **1 hôtel** (nom d’établissement, ville = station) + cartes `activity` (forfaits, matériel, cours) et `insurance`. `included` = lignes d’option imprimées. Dates **sans heure**. Réf. dossier **uniquement** sur l’hôtel. Pas de frais de dossier, totaux à 0, PAN.
- `YANIK` / `YANNICK` = même personne.

## Fusion (`item-match.ts`)

| Kind | Clé |
|------|-----|
| flight | `flight_number` + jour, sinon PNR + jour |
| hotel | recouvrement des réf. `;`, sinon nom + jour |
| car / transfer / activity / rail / insurance | réf. sinon titre + jour |

Réimport même clé = **remplace** la carte. Dans un même extract, 10 duplicatas → 1 item (`mergeExtractItems`). Aller et retour (n° ou jours différents) → 2 items.

## Voyageurs / titre

- Noms imprimés, casse normale. « 2 adults » sans noms → Adulte 1 / Adulte 2.
- Pas d’enfant sans nom.
- `title` séjour / `destination` : villes séparées par ` · `. Title d’une **carte hôtel** = nom d’établissement.

## UI persist

- Dropzone : progression par fichier, Annuler, retry des erreurs, succès partiel. Filtre cartes par `source_file_name`.
- Sous-fiche par `kind`. Bandeau devis. Bandeau **À vérifier** (`needs_review`) : on **enregistre**, on ne refuse pas tout le lot.
- **Prix vendu (total)** prérempli depuis les PDF. `parseExtractPayload` ne l’efface plus.
- Hôtel : `normalizeHotelExtractItem` force `title = hotel_name`.
- Confirmation → dossier **confirmé** (inédit client) + `total_amount` + transactions. Devis → `quoted` sans débit.
- Cartes manuelles OK. Drag `sort_order` après persist.
- Fichiers : upload signé `ingest-tmp/` puis copie `bookings/{id}/`. Lecture via `/api/files` (pas d’URL signed longue). Cover `scheduleBookingCover`.
- Identity extract → ne pas `persistNewBookingFromExtract`.

## Fichiers

| Rôle | Path |
|------|------|
| Orchestration persist | `lib/crm/ingest-booking.ts` |
| LLM / vision / raster par fichier | `lib/crm/ingest-file.ts` |
| Parseurs + `classifyIngestFamily` | `lib/crm/ingest-parse.ts` |
| Fusion lot (quote / identity) | `lib/crm/ingest-merge.ts` |
| Chemins `ingest-tmp` | `lib/crm/ingest-storage.ts` |
| PAN | `lib/crm/ingest-redact.ts` |
| Schéma + prix null + événements NDJSON | `lib/crm/ingest-types.ts` |
| Fusion clés | `lib/crm/item-match.ts` |
| Tests | `lib/crm/ingest-parse.test.ts`, `ingest-pipeline.test.ts`, `item-match.test.ts` |
| UI | `components/crm/BookingIngest.tsx`, `IngestItemCard.tsx` |
| API agence | `app/api/admin/bookings/ingest` (NDJSON, `maxDuration` 300) |
| Upload signé | `app/api/admin/bookings/ingest/sign` |

Fallback modèle : gpt-4o (`OPENAI_API_KEY` `sk-`) puis Gateway `google/gemini-2.5-flash` sur 401/403/429/5xx/timeout. Pas de migration Gateway tant que la clé OpenAI est là.

## Vérifier

```bash
npx tsx --test lib/crm/ingest-parse.test.ts lib/crm/item-match.test.ts lib/crm/ingest-pipeline.test.ts lib/crm/carnet.test.ts
npx tsc --noEmit
```

Un parseur sans test sur la famille du PDF **n’est pas** livré. Fixtures git = texte anonymisé, pas le PDF.
