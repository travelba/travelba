---
name: travelba-email-ingest
description: >-
  Travelba Gmail labels (little-emperors, expedia-taap, billet-avion) → crm_email_ingest →
  parse → suggestions. L’agence rattache à la main. Jamais de rattachement,
  création ou annulation automatiques. Use when touching Gmail webhook, cron
  gmail-ingest / gmail-watch-renew, email-match, cancellation mail, or a booking
  confirmation. Dropzone PDF/photos (relecture humaine) : travelba-document-ingest.
  Identity / MRZ : travelba-identity.
---

# Travelba — e-mails fournisseur (Gmail)

Push Gmail (labels **little-emperors**, **expedia-taap**, **billet-avion**) → ligne
`crm_email_ingest` → parse extract → suggestions (client / voyage).
**Aucun rattachement autonome.** Le mail reste dans `/admin/emails` jusqu’au clic
de l’agence (rattacher, créer le dossier, ou refuser).

L’IA **ne publie jamais** le carnet (`visible_to_client=false`).
L’IA **ne rattache pas**, **ne crée pas** de client ni de dossier, **n’annule pas**.

Un mail **remplit** une carte vol ou hôtel, puis vit avec les **pièces**. Il n’est jamais une étape glissable du voyage (ni l’original, ni le `Fw:`). Les doublons évidents (même passager + date de billet, même confirmation d’hôtel, Milano = Milan) se regroupent. Sur chaque fiche, la liste est **repliée** : fermée, elle dit qu’il y en a et combien ; ouverte, chaque copie grisée a **Écarter**. Écarter marque la ligne, ne la supprime pas, et ne retire pas la carte. Le fichier reste dans le dossier. Ne pas lancer soi-même un nettoyage des lignes prod.

## Ce n’est pas le dropzone

| | `travelba-document-ingest` | **`travelba-email-ingest`** |
|--|---------------------------|----------------------------|
| Entrée | Dropzone PDF/photos **admin** | Push Gmail **labels** → `crm_email_ingest` |
| Suite | Relecture humaine, puis **Enregistrer** | Parse → suggestions. Clic agence pour rattacher |
| Persist | Clic agent | Clic agence : `applyExtractToBooking` / `persistNewBookingFromExtract` |

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
  → /admin/emails jusqu’au clic agence
```

`matchAndStoreExtract` enregistre l’extract et les suggestions. Il n’appelle
ni `applyExtractToBooking`, ni `persistNewBookingFromExtract`, ni
`applyCancellationToBooking`, ni `executeEmailIngestDecision`.
`received` et `error` restent dans la file, pas seulement `parsed` / `matched`.

Le clic **Rattacher au voyage** sur une annulation appelle
`applyCancellationToBooking`. **Créer un dossier** est refusé si le mail est une
annulation.

## Billets d'avion

Label Gmail **`billet-avion`** (`label:billet-avion`). « Billet avion » compte
aussi : la clé ignore la casse et remplace espaces / underscores par des tirets.
`GMAIL_LABELS` est fusionné avec les défauts : le label est toujours suivi,
même si l'env prod ne liste que Little Emperors et Expedia TAAP.

L'historique Gmail ne voit pas les mails déjà labellisés. Le cron
`gmail-ingest` appelle `backfillBilletAvionMessages` (curseur dans
`crm_email_sync`, provider `gmail-billet-avion`). Ensuite le parse existant
(e-ticket / Amadeus, corps + pièces) remplit l’extract. Pas de parseur dédié.
Le billet arrive dans la file, comme les autres mails.
Le watch Pub/Sub se met à jour au cron `gmail-watch-renew`.

## Match voyage

Les suggestions servent la relecture. Elles ne rattachent jamais.
Deux dossiers au même score → les deux restent candidats. Réfs fournisseur / dossier **en priorité**.

| Priorité | Signal | Où |
|----------|--------|----|
| 1 | Réf. dossier ou `confirmation_ref` item / chambres | `suggestBookingByReference` |
| 2 | Nom titulaire / voyageur **+** destination **+** dates (exactes ou chevauchement) | `suggestBookingByTripSignals` |

Nom : égalité, distance d’édition ≤ 1, ou radical commun (`Albilla` / `Albilila`).
Prénom aligné (`Simon` = `Simon, Iony`). Destination : ville / pays, casse,
accents, inclusion (`Dan Tel Aviv Hotel` ⊃ `Tel Aviv`). `cancelled` exclus.
Document `identity` : pas de proposition de voyage. Prix document manquant : pas de blocage du rattachement manuel. On n’invente pas le montant.

## Pas de voyage

Le mail reste dans la file. L’agence choisit le client et clique **Créer un dossier**
(`persistNewBookingFromExtract`) ou **Rattacher au voyage**.

Ne jamais créer un client ni un dossier depuis le cron, le webhook ou
`matchAndStoreExtract`. E-mail extract seulement s’il n’est **pas** une boîte agence
(`contact@travelba.fr`, `agence@`, `hello@`, `info@`, `CONTACT_FROM_EMAIL`) —
et seulement parce que l’agence a cliqué. Jamais l’expéditeur fournisseur comme
e-mail client.

Réutiliser `applyExtractToBooking` / `persistNewBookingFromExtract` sur ce clic.
Ne **pas** recopier l’upsert des cartes.

## Annulations

Même contrat de **match** qu’une confirmation (réfs d’abord ; sinon dates +
destination + nom flou). **Une annulation ne crée jamais un voyage**
(ni un client). Ambigu ou aucun hit → `matched` / revue humaine.

Signal extract : `document_status=cancelled` (LLM + parseur). Détecté aussi
sur l’objet / le corps (« Cancellation confirmation », « has been cancelled »,
« a été annulée ») — **pas** une politique « free cancellation ».

Clic agence sur le voyage → `applyCancellationToBooking` :
- cartes matchées (`findMatchingItem`) : `visible_to_client=false`, hors ledger ;
- plus aucune carte carnet, ou aucun item ciblé (annulation du séjour) →
  `crm_bookings.status=cancelled` (enum existant ; les items n’ont pas de statut) ;
- `syncBookingLedger` (un dossier `cancelled` purge les débits) ;
- fichiers en `visible_to_client=false`. L’IA ne publie pas le carnet.

## Relancer une ligne déjà parsée

Sans re-télécharger Gmail (ne pas remettre `received`) et **sans rattacher** :

- Cron : `rematchStoredEmailIngest` rafraîchit les suggestions sur `parsed` / `matched`
- Staff : `POST /api/admin/email-ingest/[id]` `{ "action": "rematch" }`

## Fichiers

| Rôle | Path |
|------|------|
| Orchestration (parse + suggestions, jamais d’apply) | `lib/crm/email-ingest.ts` |
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
npx tsx --test lib/crm/email-ingest-policy.test.ts lib/crm/email-match.test.ts lib/crm/gmail-parse.test.ts
npx tsc --noEmit
```

Couvrir : réf. exacte, dates+dest+nom flou, deux voyages égaux, *Albilla* / *Albilila*.
`lib/crm/email-ingest-policy.test.ts` interdit tout apply dans `email-ingest.ts`.
Ne pas rejouer un vrai mail prod. Echo PII interdit dans PR / logs.

## Hôtel Little Emperors

`included` = **toutes** les lignes imprimées sous « LE Benefits » ou « Little Emperors Benefits », en français. Pas seulement le petit-déjeuner. « Fourth Night Free » juste avant le bloc = nuit offerte. L’astérisque se rattache au bénéfice étoilé. Pas l’annulation, pas le dépôt. Même parseur que le PDF (`parseLittleEmperorsIncluded`).

Contacts de l’hôtel : catalogue Little Emperors à l’affichage, pas l’adresse du mail ni le correspondant imprimé. Milano = Milan (`CITY_ALIASES`). Skill `travelba-carnet`.

## Interdits

- Rattachement, création de dossier, création de client ou annulation **sans clic agence**
- Créer un dossier (ou un client) depuis un mail d’annulation
- Publier le carnet / `visible_to_client=true`
- Retirer `received` ou `error` de la file `/admin/emails`
- Inventer horaires, inclus, nets, e-mail client agence
- Réduire un bloc Benefits au seul petit-déjeuner
- Traiter ce flux comme le dropzone (pas de « Enregistrer » obligatoire)
- Dupliquer l’upsert des cartes
- **Ne pas merger** sans go-ahead explicite de Benjamin
