---
name: travelba-voyage-crm
description: >-
  Master map of Travelba voyage CRM: wizard steps, skills index, data model,
  and how to ship features fast. Use at the start of any Travelba admin/mTrip
  task, voyage dossier, devis, passports, confirmations, WhatsApp Concierge,
  publish, or when the user asks to advance the project / rules / skills.
---

# Travelba — carte voyage CRM

Lire **ce skill en premier** pour choisir le bon skill ciblé, puis coder.

## Skills (lire selon le sujet)

| Besoin | Skill |
|--------|--------|
| Import PDF/captures → devis | `travelba-confirmation-import` |
| Publish riche + geo mTrip | `travelba-mtrip-max-publish` |
| Traveler View `/v/` + titres | `travelba-my-trip` |
| Suivi dépenses `/d/` + devis public | `travelba-suivi-depenses` |
| WhatsApp opt-in → dossier | `travelba-concierge-whatsapp` |
| WhatsApp staff → créer voyage CRM | `travelba-whatsapp-ops-agent` |

Rules always-on : `.cursor/rules/travelba-core.mdc`  
Docs/import : `.cursor/rules/travelba-voyage-docs.mdc`

## Wizard CRM (`MtripGuideWorkspace`)

1. **Passeports** → `POST .../passports` → `passengers` + `passport_files` + preview  
2. **Contact** lead (WhatsApp / email)  
3. **Résas & devis** → `POST .../documents` → Storage + `documents` + `quote_lines` + preview  
4. **Publish & envoi** → mTrip → opt-in WA → dossier WA (`/d/` + `/v/`)

## Modèle données (guide)

```
agency_mtrip_guides
  passengers[], passport_files[]
  documents[]          ← confirmations (storage_path)
  quote_lines[]        ← devis (document_id → doc)
  extraction
  short_code, quote_token, app_links
```

Bucket : `agency-mtrip` (privé). Preview admin : signed URL via `.../files/[fileId]`.

## Format lignes devis (UI)

| kind | Ligne | Dates FR | Type | Détails |
|------|-------|----------|------|---------|
| hotel | Nom hôtel | `10 juin - 11 juin` | chambre | occupancy… |
| flight | `Vol Air France SJO–CDG` | départ–arrivée | `AF0431 · Business` | passager, siège… |

`room_type` / `room_details` servent aussi aux vols (type / détails).

## Rythme d’exécution

1. Identifier le skill + fichiers clés (ci-dessous)  
2. Modifier extracteurs / API / UI au minimum nécessaire  
3. Valider sur PDF réel dans `Downloads` si fourni  
4. Pas de commit sauf demande explicite  

## Fichiers clés

| Rôle | Path |
|------|------|
| Extract PDF/OCR | `lib/mtrip/extract-pdf.ts` |
| Mapping devis | `lib/mtrip/quote-lines.ts` |
| Types | `lib/mtrip/guide-types.ts` |
| Upload résas | `app/api/admin/mtrip/guides/[id]/documents/route.ts` |
| Preview fichier | `app/api/admin/mtrip/guides/[id]/files/[fileId]/route.ts` |
| UI dossier | `components/admin/MtripGuideWorkspace.tsx` |
| Preview UI | `components/admin/VoyageFilesPanel.tsx` |
| Lignes devis | `components/admin/QuoteLinesEditor.tsx` |
| Publish | `lib/mtrip/publish-guide.ts` |
| WhatsApp | `lib/agency/whatsapp.ts` |
| Agent ops WA | `app/api/webhooks/twilio/whatsapp/route.ts` |

## Backlog produit typique (prioriser avec l’user)

- Nouveaux formats confirmation → étendre `extract-pdf` + tester PDF  
- Enrichir preview (delete doc, lier passager↔PJ)  
- Publish mTrip MAX (photos geo)  
- Templates Twilio approuvés Meta  

Quand l’user dit « avance » : proposer **1 chantier concret**, l’implémenter, valider.
