---
name: travelba-email-ingest
description: >-
  Travelba Gmail labels (little-emperors, expedia-taap, billet-avion) → crm_email_ingest →
  parse → auto match/apply (hors billets : rattachement manuel), create, ou annulation. Use when touching Gmail
  webhook, cron gmail-ingest / gmail-watch-renew, email-match, cancellation
  mail, or a booking confirmation. Dropzone PDF/photos (relecture humaine) :
  travelba-document-ingest. Identity / MRZ : travelba-identity.
---

# Travelba — e-mails fournisseur (Gmail)

Push Gmail (labels **little-emperors**, **expedia-taap**, **billet-avion**) → ligne
`crm_email_ingest` → parse extract → **auto** match / apply ou create,
sauf **billet-avion** : file `/admin/emails`, rattachement manuel.
Pas d’attente d’un clic `/admin/emails` quand le hit est unique et fort
(Little Emperors, Expedia TAAP).

L’IA **ne publie jamais** le carnet (`visible_to_client=false`).

## Ce n’est pas le dropzone

| | `travelba-document-ingest` | **`travelba-email-ingest`** |
|--|---------------------------|----------------------------|
| Entrée | Dropzone PDF/photos **admin** | Push Gmail **labels** → `crm_email_ingest` |
| Suite | Relecture humaine, puis **Enregistrer** | Parse → **auto** match/apply ou create |
| Persist | Clic agent | `applyExtractToBooking` / `persistNewBookingFromExtract` |

Identité / MRZ : skill `travelba-identity`.

## Quand charger ce skill

- Confirmation / **annulation** / devis fournisseur, labels Gmail, webhook, cron, watch
- Table `crm_email_ingest`, matching client/voyage, rematch
- « pourquoi ce mail n’est pas sur le dossier », Albilla / Albilila

## Pipeline (contrat)

```
Gmail label (little-emperors | expedia-taap | billet-avion)
  → webhook / cron capture → crm_email_ingest status=received
  → parse extract (pièces + corps ; mêmes parseurs / LLM que l’import)
  → suggestCustomerFromExtract
  → suggestBookingByReference ∪ suggestBookingByTripSignals
  → label billet-avion → stop (parsed|matched, rattachement manuel)
  → sinon hit unique fort → applyExtractToBooking
       (si cancelled → applyCancellationToBooking, jamais persist)
  → sinon client unique + trip utilisable → persistNewBookingFromExtract
  → sinon créer crm_customers (prénom/nom) puis persist
  → sinon status matched|parsed + candidats (revue humaine)
```

Après succès : `status=attached`, `created_booking_id` (enum existant, pas de
nouvelle colonne). `matchAndStoreExtract` enchaîne matching **et** auto-apply.

## Billets d'avion

Label Gmail **`billet-avion`** (`label:billet-avion`). « Billet avion » compte
aussi : la clé ignore la casse et remplace espaces / underscores par des tirets.
`GMAIL_LABELS` est fusionné avec les défauts : le label est toujours suivi,
même si l'env prod ne liste que Little Emperors et Expedia TAAP.

L'historique Gmail ne voit pas les mails déjà labellisés. Le cron
`gmail-ingest` appelle `backfillBilletAvionMessages` (curseur dans
`crm_email_sync`, provider `gmail-billet-avion`). Ensuite le parse existant
(e-ticket / Amadeus, corps + pièces). Pas de parseur dédié.
Le watch Pub/Sub se met à jour au cron `gmail-watch-renew`.

**Pas d'auto-rattachement** pour ce label (`emailIngestAttachesAutomatically`).
Le mail reste `parsed` / `matched` dans `/admin/emails`. L'agence rattache
chaque billet au voyage à la main. Little Emperors et Expedia TAAP restent en auto.

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

## Annulations

Même contrat de **match** qu’une confirmation (réfs d’abord ; sinon dates +
destination + nom flou). **Une annulation ne crée jamais un voyage**
(ni un client). Ambigu ou aucun hit → `matched` / revue humaine.

Signal extract : `document_status=cancelled` (LLM + parseur). Détecté aussi
sur l’objet / le corps (« Cancellation confirmation », « has been cancelled »,
« a été annulée ») — **pas** une politique « free cancellation ».

Hit unique → `applyCancellationToBooking` :
- cartes matchées (`findMatchingItem`) : `visible_to_client=false`, hors ledger ;
- plus aucune carte carnet, ou aucun item ciblé (annulation du séjour) →
  `crm_bookings.status=cancelled` (enum existant ; les items n’ont pas de statut) ;
- `syncBookingLedger` (un dossier `cancelled` purge les débits) ;
- fichiers en `visible_to_client=false`. L’IA ne publie pas le carnet.

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
| Persist (`applyExtractToBooking` / `applyCancellationToBooking` / `persistNewBookingFromExtract`) | `lib/crm/ingest-booking.ts` |
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
d’auto, création (persist mocké), *Albilla* / *Albilila*, annulation + match →
apply, annulation sans match → pas de create.
Ne pas rejouer un vrai mail prod. Echo PII interdit dans PR / logs.

## Hôtel Little Emperors

`included` = **toutes** les lignes imprimées sous « LE Benefits » ou « Little Emperors Benefits », en français. Pas seulement le petit-déjeuner. « Fourth Night Free » juste avant le bloc = nuit offerte. L’astérisque se rattache au bénéfice étoilé. Pas l’annulation, pas le dépôt. Même parseur que le PDF (`parseLittleEmperorsIncluded`).

## Interdits

- Auto-apply d’un label **billet-avion** (rattachement manuel)
- Auto-apply si plusieurs dossiers au même score fort
- Créer un dossier (ou un client) depuis un mail d’annulation
- Publier le carnet / `visible_to_client=true`
- Inventer horaires, inclus, nets, e-mail client agence
- Réduire un bloc Benefits au seul petit-déjeuner
- Traiter ce flux comme le dropzone (pas de « Enregistrer » obligatoire)
- Dupliquer l’upsert des cartes
- **Ne pas merger** sans go-ahead explicite de Benjamin
