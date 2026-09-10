---
name: travelba-confirmation-import
description: >-
  Rules for Travelba voyage confirmation imports (PDF/screenshots): never use
  screenshot filenames as quote titles; OCR/parse into métier titles; persist
  files to Storage + documents[]; preview in dossier. Hotel: name, FR dates,
  room_type, room_details. Flight AF e-ticket: Vol + route, AF#### · cabin,
  passenger/seat/baggage. Use when editing extract-pdf, quote-lines, documents
  upload, VoyageFilesPanel, or when the user mentions confirmations, billets,
  vouchers, Little Emperors, or import résas.
---

# Travelba — import confirmations

## Règles absolues

1. **Jamais** de titre devis = `Capture…` / `Screenshot…` / `IMG_…`
2. **Upload = sauvegarde** Storage `agency-mtrip` + `documents[]` + `quote_lines` dans le même POST
3. **Preview** dans le dossier via `VoyageFilesPanel` + `GET .../files/[fileId]`
4. Pas d’URL signed longues vers mTrip

## Lignes hôtel

| UI | Champ |
|----|--------|
| Nom hôtel | `title` |
| `10 juin - 11 juin` | `formatStayDateRangeFr(start,end)` |
| Type chambre | `room_type` |
| Détails | `room_details` |

Formats : **Little Emperors** (EN) · **Voucher FR** · **TAAP / devis Expedia agence** (`proposé par`, `Chambre Confort`) · multi-chambres = multi-lignes.

## Lignes vol (billet AF/KLM)

| UI | Champ |
|----|--------|
| `Vol Air France SJO–CDG` | `title` |
| Dates FR (J+1 si besoin) | `start_date` / `end_date` |
| `AF0431 · Business` | `room_type` |
| Passager · horaires · siège · bagages | `room_details` |
| PNR | `confirmation` |

Indices : `ITINÉRAIRE / ITINERARY`, `YOUR BOOKING REFERENCE`, `BILLET PRIME`.  
1 segment → 1 ligne. Année = date d’émission.

## Flux

```
PDF/image → extract-pdf → quoteLinesFromExtraction
         → storage upload → documents[] UPDATE guide
         → UI preview + Voir doc (document_id)
```

## Fichiers

- `lib/mtrip/extract-pdf.ts`
- `lib/mtrip/quote-lines.ts`
- `app/api/admin/mtrip/guides/[id]/documents/route.ts`
- `app/api/admin/mtrip/guides/[id]/files/[fileId]/route.ts`
- `components/admin/VoyageFilesPanel.tsx`
- `components/admin/QuoteLinesEditor.tsx`

## Nouveau format PDF

1. Extraire le texte (`unpdf`)  
2. Étendre le parseur dédié (ne pas casser LE / AF / voucher)  
3. Vérifier mapping `quote_lines` + rendu UI  
4. Mettre à jour ce skill (1 ligne « Formats connus »)
