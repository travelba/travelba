---
name: travelba-email-ingest
description: >-
  Travelba Gmail labels (little-emperors, expedia-taap, billet-avion) → crm_email_ingest →
  parse → file d’attente. L’agence désigne le dossier : pas d’apply ni de
  création automatique. Use when touching Gmail webhook, cron gmail-ingest /
  gmail-watch-renew, email-match, cancellation mail, or a booking confirmation.
  Dropzone PDF/photos (relecture humaine) : travelba-document-ingest.
  Identity / MRZ : travelba-identity.
---

# Travelba — e-mails fournisseur (Gmail)

Push Gmail (labels **little-emperors**, **expedia-taap**, **billet-avion**) → ligne
`crm_email_ingest` → parse extract → **file** `/admin/emails`.
L’agence choisit le client et la réservation. Aucune pièce n’est posée, aucun
dossier n’est créé, tant que ce choix n’est pas fait.

L’IA **ne publie jamais** le carnet (`visible_to_client=false`).

## Ce n’est pas le dropzone

| | `travelba-document-ingest` | **`travelba-email-ingest`** |
|--|---------------------------|----------------------------|
| Entrée | Dropzone PDF/photos **admin** | Push Gmail **labels** → `crm_email_ingest` |
| Suite | Relecture humaine, puis **Enregistrer** | Parse → file. **Rattacher** ou **Créer un dossier** |
| Persist | Clic agent | Clic agent (`applyExtractToBooking` / `persistNewBookingFromExtract`) |

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
  → status matched|parsed + candidats
  → l’agence désigne le voyage (Rattacher) ou crée le dossier
```

Le cron **ne** appelle pas `applyExtractToBooking`, `applyCancellationToBooking`
ni `persistNewBookingFromExtract`. `matchAndStoreExtract` ne fait que stocker
l’extract et les suggestions. Après le clic : `status=attached`,
`created_booking_id`. Si ce dossier est supprimé, la ligne revient en file
(`matched` ou `parsed`) — elle ne reste pas `attached` sans réservation.

## Billets d'avion

Label Gmail **`billet-avion`** (`label:billet-avion`). « Billet avion » compte
aussi : la clé ignore la casse et remplace espaces / underscores par des tirets.
`GMAIL_LABELS` est fusionné avec les défauts : le label est toujours suivi,
même si l'env prod ne liste que Little Emperors et Expedia TAAP.

L'historique Gmail ne voit pas les mails déjà labellisés. Le cron
`gmail-ingest` appelle `backfillBilletAvionMessages` (curseur dans
`crm_email_sync`, provider `gmail-billet-avion`). Ensuite le parse existant
(e-ticket / Amadeus, corps + pièces) fait le match auto. Pas de parseur dédié.
Le watch Pub/Sub se met à jour au cron `gmail-watch-renew`.

## Match voyage

Les suggestions préremplissent la file. **Aucun hit, même unique et fort, ne
pose la pièce.** Deux dossiers au même score → les deux restent proposés.
Réfs fournisseur / dossier **en priorité** pour la suggestion.

| Priorité | Signal | Où |
|----------|--------|----|
| 1 | Réf. dossier ou `confirmation_ref` item / chambres | `suggestBookingByReference` |
| 2 | Nom titulaire / voyageur **+** destination **+** dates (exactes ou chevauchement) | `suggestBookingByTripSignals` |

Nom : égalité, distance d’édition ≤ 1, ou radical commun (`Albilla` / `Albilila`).
Prénom aligné (`Simon` = `Simon, Iony`). Destination : ville / pays, casse,
accents, inclusion (`Dan Tel Aviv Hotel` ⊃ `Tel Aviv`). `cancelled` exclus.
Document `identity` : **pas** d’auto.

## Pas de voyage

La ligne reste `parsed` ou `matched`. L’agence crée le dossier depuis la file
si elle le décide (`persistNewBookingFromExtract` au clic seulement).

Ne pas créer de fiche client depuis le cron. E-mail extract seulement s’il n’est
**pas** une boîte agence (`contact@travelba.fr`, `agence@`, `hello@`, `info@`,
`CONTACT_FROM_EMAIL`) — règle inchangée si un clic crée une fiche plus tard.
Jamais l’expéditeur fournisseur comme e-mail client.

Réutiliser `applyExtractToBooking` / `persistNewBookingFromExtract` **au clic**.
Ne **pas** recopier l’upsert des cartes.

## Annulations

Même contrat de **match** qu’une confirmation (réfs d’abord ; sinon dates +
destination + nom flou). **Une annulation ne crée jamais un voyage**
(ni un client). Ambigu ou aucun hit → `matched` / revue humaine.

Signal extract : `document_status=cancelled` (LLM + parseur). Détecté aussi
sur l’objet / le corps (« Cancellation confirmation », « has been cancelled »,
« a été annulée ») — **pas** une politique « free cancellation ».

L’agence rattache l’annulation au dossier. Au clic, `applyCancellationToBooking` :
- cartes matchées (`findMatchingItem`) : `visible_to_client=false`, hors ledger ;
- plus aucune carte carnet, ou aucun item ciblé (annulation du séjour) →
  `crm_bookings.status=cancelled` (enum existant ; les items n’ont pas de statut) ;
- `syncBookingLedger` (un dossier `cancelled` purge les débits) ;
- fichiers en `visible_to_client=false`. L’IA ne publie pas le carnet.

## Relancer une ligne déjà parsée

Sans re-télécharger Gmail (ne pas remettre `received`) et **sans poser la pièce** :

- Cron : `rematchStoredEmailIngest` sur `parsed` / `matched` sans `created_booking_id`
- Staff : `POST /api/admin/email-ingest/[id]` `{ "action": "rematch" }`

## Fichiers

| Rôle | Path |
|------|------|
| Orchestration (parse, suggestions, pas d’apply) | `lib/crm/email-ingest.ts` |
| Match + suggestions (la décision n’est pas exécutée) | `lib/crm/email-match.ts` |
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

Couvrir : réf. exacte, dates+dest+nom flou → suggestion unique, deux voyages
égaux → pas d’auto, *Albilla* / *Albilila*, annulation sans création.
`emailIngestRequiresManualAttach()` reste vrai. Ne pas rejouer un vrai mail
prod. Echo PII interdit dans PR / logs.

## Hôtel Little Emperors

`included` = **toutes** les lignes imprimées sous « LE Benefits » ou « Little Emperors Benefits », en français. Pas seulement le petit-déjeuner. « Fourth Night Free » juste avant le bloc = nuit offerte. L’astérisque se rattache au bénéfice étoilé. Pas l’annulation, pas le dépôt. Même parseur que le PDF (`parseLittleEmperorsIncluded`).

## Interdits

- Poser une pièce ou créer un dossier / un client depuis le cron ou le parse
- Créer un dossier (ou un client) depuis un mail d’annulation
- Laisser un mail `attached` sans `created_booking_id` (il disparaît de la file)
- Publier le carnet (`visible_to_client=true`)
- Inventer horaires, inclus, nets, e-mail client agence
- Réduire un bloc Benefits au seul petit-déjeuner
- Traiter ce flux comme le dropzone (pas de « Enregistrer » obligatoire)
- Dupliquer l’upsert des cartes
- **Ne pas merger** sans go-ahead explicite de Benjamin
