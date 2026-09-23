---
name: travelba-email-ingest
description: >-
  Travelba Gmail confirmations → crm_email_ingest → rattachement / création
  automatique du dossier CRM. Use when touching email ingest, Gmail labels,
  cron gmail-ingest, email-match, auto-apply, or a booking confirmation mail.
  PDF dropzone uses travelba-document-ingest instead.
---

# Travelba — e-mails fournisseur (Gmail)

Confirmation / booking mail (Little Emperors, TAAP, etc.) labellisé Gmail →
ligne `crm_email_ingest` → **extract** → **match** → **auto-apply ou auto-create**.
Pas d’attente d’un clic `/admin/emails` quand le hit est unique et fort.

Dropzone PDF/photos agence : skill `travelba-document-ingest`.
Identité / MRZ : skill `travelba-identity`. L’IA **ne publie jamais** le carnet.

## Quand charger ce skill

- Mail de confirmation / devis fournisseur, labels Gmail, webhook / cron
- `crm_email_ingest`, matching client/voyage, auto-rattachement
- « pourquoi ce mail n’est pas sur le dossier », Albilla / Albilila, rematch

## Pipeline (contrat)

```
Gmail (label) → crm_email_ingest status=received
  → parse extract (OpenAI / mêmes parseurs que l’import)
  → suggestCustomerFromExtract
  → suggestBookingByReference ∪ suggestBookingByTripSignals
  → hit unique fort → applyExtractToBooking
  → sinon client unique + trip utilisable → persistNewBookingFromExtract
  → sinon créer crm_customers (prénom/nom) puis persist
  → sinon status matched|parsed + candidats (relecture humaine)
```

Après succès : `status=attached`, `created_booking_id` renseigné (enum existant,
pas de nouvelle colonne). Cartes et fichiers en `visible_to_client=false`.

`matchAndStoreExtract` enchaîne matching **et** auto-apply. Ne pas s’arrêter
aux `suggested_*` comme si c’était le produit fini.

## Match voyage

Combiner les signaux. **Auto seulement si un seul hit fort** (même score en tête
sur deux dossiers → relecture, `matched`).

| Priorité | Signal | Où |
|----------|--------|----|
| 1 | Réf. dossier ou `confirmation_ref` item / chambres | `suggestBookingByReference` |
| 2 | Nom titulaire / voyageur **+** destination **+** dates (exactes ou chevauchement) | `suggestBookingByTripSignals` |

Nom : égalité, distance d’édition ≤ 1, ou radical commun (`Albilla` / `Albilila`).
Le prénom s’aligne aussi (`Simon` = `Simon, Iony`). Destination : ville / pays,
casse, accents, inclusion (`Dan Tel Aviv Hotel` ⊃ `Tel Aviv`).
Dossiers `cancelled` exclus.

Document `identity` : **pas** d’auto.

## Pas de voyage

1. Client unique (e-mail exact, ou nom+prénom / nom approchant unique) →
   `persistNewBookingFromExtract`.
2. Client absent, prénom **et** nom dans l’extract (titulaire ou 1er voyageur) →
   créer une fiche `crm_customers` minimale, **puis** le dossier.
3. E-mail extract : uniquement s’il n’est **pas** une boîte agence partagée
   (`contact@travelba.fr`, `agence@`, `hello@`, `info@`, `CONTACT_FROM_EMAIL`).
   Ne jamais coller l’expéditeur fournisseur comme e-mail client.
4. `crm_customers.email` est `NOT NULL UNIQUE` : sans e-mail exploitable →
   `ingest.{uuid}@invalid.local` (pas un `@travelba.fr` inventé).
5. Un voyage *faible* déjà candidat (score ≥ 70) : ne pas créer un doublon →
   relecture.

Réutiliser `applyExtractToBooking` / `persistNewBookingFromExtract`.
Ne **pas** recopier l’upsert des cartes.

## Relancer une ligne déjà parsée

Sans re-télécharger Gmail (ne pas remettre `received`) :

- Cron : `rematchStoredEmailIngest` sur `parsed` / `matched` sans `created_booking_id`
- Staff : `POST /api/admin/email-ingest/[id]` `{ "action": "rematch" }`
  (y compris une ligne déjà `attached` si le rattachement était faux)

## Fichiers

| Rôle | Path |
|------|------|
| Orchestration + auto-apply | `lib/crm/email-ingest.ts` |
| Match + décision apply/create/review | `lib/crm/email-match.ts` |
| Persist cartes / voyageurs / nouveau dossier | `lib/crm/ingest-booking.ts` |
| Tests règles | `lib/crm/email-match.test.ts` |
| Cron capture + rematch | `app/api/cron/gmail-ingest/route.ts` |
| Actions staff (attach / new / rematch / refuse) | `app/api/admin/email-ingest/[id]/route.ts` |
| Inbox relecture | `components/admin/EmailIngestInbox.tsx` |
| Statuts | `EMAIL_INGEST_STATUSES` dans `lib/crm/types.ts` |

## Vérifier

```bash
npx tsx --test lib/crm/email-match.test.ts
npx tsc --noEmit
```

Couvrir : réf. exacte, dates+dest+nom flou → unique, deux voyages égaux → pas
d’auto, création (persist mocké), *Albilla* / *Albilila*.
Ne pas rejouer un vrai mail prod pour « voir ». Echo PII interdit dans PR / logs.

## Interdits

- Auto-apply si plusieurs dossiers au même score fort
- Publier le carnet / `visible_to_client=true`
- Inventer horaires, inclus, nets, e-mail client agence
- Dupliquer la logique d’upsert items
- **Ne pas merger** la PR sans go-ahead explicite de Benjamin
