---
name: travelba-document-ingest
description: >-
  Maps agency PDFs (Amadeus e-tickets, Little Emperors hotel quotes/bookings,
  TAAP/Talixo transfers) onto Travelba carnet cards. Use when importing
  PDFs/images into a reservation, tuning ingest prompts, OCR dropzones, or
  gpt-4o extract. Identity scans use travelba-identity instead.
---

# Import documents Travelba

Agence **seule**. APIs `app/api/client/bookings/**/ingest` = 404.
Relecture humaine obligatoire puis **Enregistrer** (brouillon). Publier = skill `travelba-carnet`.

Pipeline résa : `unpdf` (texte + images si calque pauvre) → OpenAI `gpt-4o` (`OPENAI_API_KEY` `sk-`) → `sanitizeExtractedPrices` → persist `visible_to_client=false`.
Identité : skill `travelba-identity` (photo MRZ, **pas** ce dropzone).

Code : `lib/crm/ingest-booking.ts` (`PROMPT`), `lib/crm/ingest-types.ts`, `components/crm/BookingIngest.tsx`, `components/crm/IngestItemCard.tsx` (sous-fiches typées `Field`).
Couvertures : Unsplash ville (`covers.ts`) puis IA (`cover-generate.ts`).
Limites : **30 fichiers**, **25 Mo**, PDF/images.

Traduire les libellés **en FR** à l’extract (chambre, inclus). L’agent voit le PDF original au clic. `needs_review=true` si doute.

## Ne jamais fusionner ces voyages

Un dépôt = **un** dossier. Fichiers hétérogènes : extraire le séjour le plus complet + `notes_client`.

| Famille | Indices | Dossier |
|---------|---------|---------|
| E-ticket Amadeus | « Reçu de Billet Electronique », Référence du dossier 6 lettres | Un PNR = itinéraire aérien |
| Little Emperors quote | IATA 96020293, « none are on hold » | `document_status=quote`, invisible |
| Little Emperors booking | Reservation Details, Booking Reference | Hôtel confirmé, **un** item |
| TAAP / Talixo | n° 14 chiffres, Talixo | Transfert, pas un vol |
| Passeport FR | MRZ `P<FRA` | Profil — `document_status=identity`, pas de résa |

## Prix

Toujours `total_amount=null` et `item.amount=null` après sanitize. Le `$` / CHF du PDF = net **interne**, jamais carte client. Devise du symbole pour `currency` (ne pas forcer EUR) — l’agent saisit le **prix vendu** ensuite.

Ne **pas** extraire paiement / PAN / annulation / conditions.

## E-ticket Amadeus

- `confirmation_ref` = PNR GDS 6 lettres. `details.pnr` = réf. compagnie.
- `details.airline` = **opérant**. `supplier` = émetteur (Hahn Air ≠ Air Panama).
- Aller / retour / correspondance = **un item par segment**. Pas de retour fantôme.
- `details.from` / `to` = IATA. `details.city_from` / `city_to` = villes.
- Horaires ISO imprimés. Cabin = libellé + code tarif. Bagages `1PC` → `details.baggage`.
- Email agence ≠ `customer_email`.
- Réimport même PNR + n° + date = **remplace** la carte.

## Hôtel Little Emperors / My Concierge

**Un item `hotel` par établissement**, même 2 chambres / 2 Booking name / 2 réf.

- `details.rooms = [{ room, guests, confirmation_ref }, …]`
- `confirmation_ref` = première réf. ou `97620170;97620172`
- `details.hotel_name`, `city`, `address` (agent), `board` si écrit, `occupancy` brut
- `details.included[]` **seulement** si phrase explicite (breakfast…). Sinon pas de bloc
- **Interdit** d’inventer check-in 15:00 / check-out 12:00
- Devis : `document_status=quote`, `status` dossier `quoted`, `rooms` = options, toujours invisible tant que non publié. **Pas** un item par option tarifaire
- Dates header → `start_at` / `end_at` (date only)

## Transfert TAAP / Talixo

- `kind=transfer`, `details.pickup` / `dropoff` (pas `from`/`to`)
- Heure vol citée ≠ pickup. « 2,5 h avant » → `details.pickup_note`, pas d’heure inventée
- Vol sur le bon → item `flight` seulement s’il y a un e-ticket
- `YANIK` / `YANNICK` = même personne (normaliser)

## Train / voiture / bateau

`rail` / `car` / `cruise` : n°, lieux, horaires **s’ils sont écrits**. Croisière = une carte, pas un jour par port. Pas de franchise loueur inventée.

## Voyageurs

- Noms imprimés, casse normale
- « 2 adults » sans noms → `{first_name:"Adulte", last_name:"1"}` et `Adulte 2` (rattacher un compagnon plus tard)
- Pas d’enfant sans nom

`title` / `destination` : villes séparées par ` · `.

## UI persist

- Relecture sous-fiche par `kind`. Bandeau devis « tarifs non bloqués ». Bandeau **À vérifier**
- Cartes manuelles OK. Drag ordre après persist
- Fichiers `/api/files`. Cover `scheduleBookingCover` → `bookings/{id}/cover.webp`
- Identity extract → ne pas `persistNewBookingFromExtract`

## Prompt

Toute erreur réelle (retour fantôme, EUR sur un $, 2 items hôtel, petit-déj fantôme, net affiché) se corrige **dans** `PROMPT` + une ligne ici. Pas de Tesseract sur les e-tickets. Pas d’AI Gateway tant que `OPENAI_API_KEY` `sk-` est présent.
