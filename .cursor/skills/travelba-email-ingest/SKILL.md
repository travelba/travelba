---
name: travelba-email-ingest
description: >-
  Travelba Gmail labels (little-emperors, expedia-taap) → crm_email_ingest →
  parse → auto match/apply ou create du dossier. Use when touching Gmail
  webhook, cron gmail-ingest / gmail-watch-renew, email-match, or a booking
  confirmation mail. Dropzone PDF/photos (relecture humaine) :
  travelba-document-ingest. Identity / MRZ : travelba-identity.
---

# Travelba — e-mails fournisseur (Gmail)

Push Gmail (labels **little-emperors**, **expedia-taap**) → ligne
`crm_email_ingest` → parse extract → **auto** match / apply ou create.
Pas d’attente d’un clic `/admin/emails` quand le hit est unique et fort.

L’IA **ne publie jamais** le carnet (`visible_to_client=false`).

## Ce n’est pas le dropzone

| | `travelba-document-ingest` | **`travelba-email-ingest`** |
|--|---------------------------|----------------------------|
| Entrée | Dropzone PDF/photos **admin** | Push Gmail **labels** → `crm_email_ingest` |
| Suite | Relecture humaine, puis **Enregistrer** | Parse → **auto** match/apply ou create |
| Persist | Clic agent | `applyExtractToBooking` / `persistNewBookingFromExtract` |

Identité / MRZ : skill `travelba-identity`.

## Quand charger ce skill

- Confirmation / booking mail, labels Gmail, webhook, cron, watch
- Table `crm_email_ingest`, matching client/voyage, rematch
- « pourquoi ce mail n’est pas sur le dossier », Albilla / Albilila

## Pipeline (contrat)

```
Gmail label (little-emperors | expedia-taap)
  → webhook / cron capture → crm_email_ingest status=received
  → parse extract (pièces + corps ; mêmes parseurs / LLM que l’import)
  → suggestCustomerFromExtract
  → suggestBookingByReference ∪ suggestBookingByTripSignals
  → hit unique fort → applyExtractToBooking
  → sinon client unique + trip utilisable → persistNewBookingFromExtract
  → sinon créer crm_customers (prénom/nom) puis persist
  → sinon status matched|parsed + candidats (revue humaine)
```

Après succès : `status=attached`, `created_booking_id` (enum existant, pas de
nouvelle colonne). `matchAndStoreExtract` enchaîne matching **et** auto-apply.

## Match voyage

**Auto seulement si un seul hit fort.** Deux dossiers au même score → revue
humaine (`matched`). Réfs fournisseur / dossier **en priorité**.

| Priorité | Signal | Où |
|----------|--------|----|
| 1 | Réf. dossier ou `confirmation_ref` item / chambres | `suggestBookingByReference` |
| 2 | Nom titulaire / voyageur **+** destination **+** dates (exactes ou chevauchement) | `suggestBookingByTripSignals` |

Nom : égalité, distance d’édition ≤ 1, ou radical commun (`Albilla` / `Albilila`).
Prénom aligné (`Simon` = `Simon, Iony`). Destination : ville / pays, casse,
accents, inclusion (`Dan Tel Aviv Hotel` ⊃ `Tel Aviv`). `cancelled` exclus.
Document `identity` : **pas** d’auto.

## Pas de voyage

1. Client unique → `persistNewBookingFromExtract`.
2. Client absent, prénom **et** nom dans l’extract → fiche `crm_customers`
   minimale **puis** le dossier.
3. E-mail extract seulement s’il n’est **pas** une boîte agence
   (`contact@travelba.fr`, `agence@`, `hello@`, `info@`, `CONTACT_FROM_EMAIL`).
   Jamais l’expéditeur fournisseur comme e-mail client.
4. `crm_customers.email` est `NOT NULL UNIQUE` : sans e-mail exploitable →
   `ingest.{uuid}@invalid.local`.
5. Candidat voyage faible (score ≥ 70) : ne pas créer un doublon → revue.

Réutiliser `applyExtractToBooking` / `persistNewBookingFromExtract`.
Ne **pas** recopier l’upsert des cartes.

## Relancer une ligne déjà parsée

Sans re-télécharger Gmail (ne pas remettre `received`) :

- Cron : `rematchStoredEmailIngest` sur `parsed` / `matched` sans `created_booking_id`
- Staff : `POST /api/admin/email-ingest/[id]` `{ "action": "rematch" }`

## Fichiers

| Rôle | Path |
|------|------|
| Orchestration + auto-apply | `lib/crm/email-ingest.ts` |
| Match + décision apply/create/review | `lib/crm/email-match.ts` |
| Client Gmail (labels, history, watch) | `lib/crm/gmail.ts` |
| Parse message / pièces | `lib/crm/gmail-parse.ts` |
| Persist (`applyExtractToBooking` / `persistNewBookingFromExtract`) | `lib/crm/ingest-booking.ts` |
| Push labels | `app/api/webhooks/gmail/route.ts` |
| Cron capture + parse + rematch | `app/api/cron/gmail-ingest/route.ts` |
| Renouvellement watch | `app/api/cron/gmail-watch-renew/route.ts` |
| Tests règles | `lib/crm/email-match.test.ts` |
| Inbox relecture | `components/admin/EmailIngestInbox.tsx` |

## Vérifier

```bash
npx tsx --test lib/crm/email-match.test.ts lib/crm/gmail-parse.test.ts
npx tsc --noEmit
```

Couvrir : réf. exacte, dates+dest+nom flou → unique, deux voyages égaux → pas
d’auto, création (persist mocké), *Albilla* / *Albilila*.
Ne pas rejouer un vrai mail prod. Echo PII interdit dans PR / logs.

## Interdits

- Auto-apply si plusieurs dossiers au même score fort
- Publier le carnet / `visible_to_client=true`
- Inventer horaires, inclus, nets, e-mail client agence
- Traiter ce flux comme le dropzone (pas de « Enregistrer » obligatoire)
- Dupliquer l’upsert des cartes
- **Ne pas merger** sans go-ahead explicite de Benjamin
