---
name: travelba-email-ingest
description: >-
  Travelba Gmail labels (little-emperors, expedia-taap, billet-avion, booking-cancellation, crm) → crm_email_ingest →
  parse → suggestions. Création automatique du dossier (et de la fiche s’il
  n’existe pas) sur une confirmation sans voyage reconnu. Un match unique
  (un client, un séjour, une carte) met à jour l’itinéraire seul. Le reste
  attend le clic. Use when touching Gmail webhook, cron
  gmail-ingest / gmail-watch-renew, email-match, cancellation mail, or a booking
  confirmation. Dropzone PDF/photos (relecture humaine) : travelba-document-ingest.
  Identity / MRZ : travelba-identity.
---

# Travelba — e-mails fournisseur (Gmail)

Push Gmail (labels **little-emperors**, **expedia-taap**, **billet-avion**, **booking-cancellation**,
**crm**) → ligne
`crm_email_ingest` → parse extract → suggestions (client / voyage).
**Rattachement autonome seulement si le match est unique** : un client déjà
reconnu, un seul séjour (référence forte, ou une seule destination, y compris
annulée), et `replacementPlan` / `cancellationApplyPlan` sans choix. Deux
séjours vers la même ville, deux cartes du même type, une annulation sans
référence, un devis ou une pièce d’identité restent dans `/admin/emails`.

L’IA **ne publie jamais** le carnet. Une carte nouvelle reste cachée. Une carte
déjà montrée, mise à jour sur la même référence, le reste.
Sur une confirmation sans voyage reconnu, elle **crée** le dossier en brouillon.
Si aucun client n’est reconnu et que le mail porte un e-mail de voyageur (ni
boîte agence, ni expéditeur, ni domaine fournisseur), elle crée d’abord la fiche.
Elle **n’invite pas** : pas de compte Auth, pas de lien. Le carnet reste caché.

Un mail **remplit** une carte vol ou hôtel, puis vit avec les **pièces**. Il n’est jamais une étape glissable du voyage (ni l’original, ni le `Fw:`). Les doublons évidents (même passager + date de billet, même confirmation d’hôtel, Milano = Milan) se regroupent. Sur chaque fiche, la liste est **repliée** : fermée, elle dit qu’il y en a et combien ; ouverte, chaque copie grisée a **Écarter**. Écarter marque la ligne, ne la supprime pas, et ne retire pas la carte. Le fichier reste dans le dossier. Ne pas lancer soi-même un nettoyage des lignes prod.

## Ce n’est pas le dropzone

| | `travelba-document-ingest` | **`travelba-email-ingest`** |
|--|---------------------------|----------------------------|
| Entrée | Dropzone PDF/photos **admin** | Push Gmail **labels** → `crm_email_ingest` |
| Suite | Relecture humaine, puis **Enregistrer** | Parse → suggestions. Clic agence pour rattacher |
| Persist | Clic agent | Clic agence, ou création auto : `persistNewBookingFromExtract` |

Identité / MRZ : skill `travelba-identity`.

## Quand charger ce skill

- Confirmation / **annulation** / devis fournisseur, labels Gmail, webhook, cron, watch
- Table `crm_email_ingest`, matching client/voyage, rematch
- « pourquoi ce mail n’est pas sur le dossier », Albilla / Albilila

## Pipeline (contrat)

```
Gmail label (little-emperors | expedia-taap | billet-avion | booking-cancellation | crm)
  → webhook / cron capture → crm_email_ingest status=received
  → parse extract (pièces + corps ; mêmes parseurs / LLM que l’import)
  → suggestCustomerFromExtract
  → suggestBookingByReference ∪ suggestBookingByTripSignals
  → status matched|parsed + candidats
  → /admin/emails jusqu’au clic agence
```

`matchAndStoreExtract` enregistre l’extract et les suggestions. Il n’applique
rien. Juste après, sur un mail **reçu** seulement, `autoCreateBookingFromIngestId`
peut créer le dossier, ou appliquer un séjour unique
(`applyReplacementToBooking` / `applyCancellationToBooking`). Le rematch ne crée
pas et n’applique pas. `received` et `error` restent dans la file, pas seulement
`parsed` / `matched`.

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

## Annulations fournisseur

Label Gmail **`booking-cancellation`** (`label:booking-cancellation`). « Booking
cancellation » compte aussi. Il est toujours suivi, même si `GMAIL_LABELS` ne le
cite pas. Le cron `gmail-ingest` appelle `backfillBookingCancellationMessages`
(curseur `gmail-booking-cancellation`). Un mail sous ce label est une annulation
(`document_status=cancelled`), même si l’objet ressemble à une confirmation. Il
ne crée ni fiche ni dossier.

## Label crm

Label Gmail **`crm`** (`label:crm`). « CRM » compte aussi. Il est toujours suivi,
même si `GMAIL_LABELS` ne le cite pas. Le cron `gmail-ingest` appelle
`backfillCrmMessages` (curseur `gmail-crm`). L’adresse `crm@travelba.fr` n’est
jamais l’e-mail d’une fiche. Le reste du contrat (match unique, pas de second
dossier, pas d’invitation, pas de publication) est le même.

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

Confirmation avec une carte (vol, hôtel, transfert…) et une date, sans candidat
de voyage fort : le cron crée le dossier et le laisse en **brouillon**
(`status=draft`, même si le mail est une confirmation, `visible_to_client=false`,
note `IMPORT_AUTO_NOTE`). Client déjà reconnu →
dossier sur cette fiche. Sinon fiche nouvelle. L'e-mail voyageur utilisable
est enregistré. S'il manque, ou s'il est celui du fournisseur ou de l'agence,
la fiche est créée avec le nom seul : pas d'invitation. Devis, extrait mince,
identité : pas de création.

Le clic **Créer un dossier** reste disponible (`persistNewBookingFromExtract`).

Ne jamais créer depuis `matchAndStoreExtract` ni depuis le rematch. E-mail
extract seulement s’il n’est **pas** une boîte agence (`contact@travelba.fr`,
`crm@travelba.fr`, `agence@`, `hello@`, `info@`, `CONTACT_FROM_EMAIL`), **pas** l’expéditeur du
mail, **pas** un domaine fournisseur (Little Emperors, Expedia, Amadeus).
Jamais d’invitation dans ce geste.

Réutiliser `applyExtractToBooking` / `persistNewBookingFromExtract` sur ce clic.
Ne **pas** recopier l’upsert des cartes.

## Annulations

Même contrat de **match** qu’une confirmation (réfs d’abord ; sinon dates +
destination + nom flou). **Une annulation ne crée jamais un voyage**
(ni un client). Ambigu ou aucun hit → `matched` / revue humaine.

Signal extract : `document_status=cancelled` (LLM + parseur). Détecté aussi
sur l’objet / le corps (« Cancellation confirmation », « has been cancelled »,
« a été annulée ») — **pas** une politique « free cancellation ».

Match unique (la référence désigne la carte) → le cron appelle
`applyCancellationToBooking`. Sinon, clic agence :
- cartes reconnues par leur référence : `lifecycle=cancelled`, hors carnet, hors total. Sur la fiche agence la carte est barrée, pastille **Annulée**, sans prix. Dans la file, la carte du mail et celle du séjour portent **Serait annulée**.
- une carte déjà remplacée ne fait pas annuler le dossier s’il reste une carte active ;
- sans référence, et s’il reste des cartes actives : la file demande laquelle. Elle n’annule pas tout le séjour ;
- plus aucune carte active → `crm_bookings.status=cancelled` ;
- `syncBookingLedger` (un dossier `cancelled` purge les débits ; les encaissements restent un avoir) ;
- fichiers en `visible_to_client=false`. L’IA ne publie pas le carnet.

## Remplacement

Un mail de confirmation ne crée pas un deuxième dossier si le client a déjà un
séjour (ouvert ou annulé, non archivé) vers la même destination. Les dates
peuvent avoir changé. Milano = Milan. Deux séjours vers la même ville restent
tous les deux proposés.

Match unique → le cron appelle `applyReplacementToBooking`. Sinon, clic
**Remplacer sur ce dossier** (ou **Rouvrir et remplacer** si le dossier
est annulé) :
- même référence : la carte est mise à jour, le prix vendu ne change pas, et
  une carte déjà montrée le reste ;
- train : même code, autre jour = une carte nouvelle. On ne réécrit pas le trajet déjà là. Deux billets du même train le même jour restent une carte ;
- réservation Little Emperors : `64570` et `64570SH046795` sont la même carte
  (`hotelRefsShareBooking`). Le numéro court ou une ancienne chambre complète
  la carte active : le nom, la référence complète et les dates restent, les
  avantages nouveaux s’ajoutent. Une chambre déjà annulée ne revient pas.
  Deux chambres actives de la même réservation : l’agence choisit ;
- autre référence : l’ancienne carte passe `lifecycle=superseded`, la nouvelle
  reprend ce prix vendu et reste cachée. Le choix d’une carte n’apparaît que
  pour **une** carte nouvelle face à plusieurs cartes du même type. Plusieurs
  cartes nouvelles rejoignent le séjour (bouton **Mettre à jour le séjour**) ;
- les dates du dossier suivent les cartes actives ;
- le mail appliqué seul sort de la file (`attached`), note « Itinéraire mis à jour depuis le mail. » ;
- la nouvelle carte d’un remplacement reste cachée jusqu’au clic Montrer ;
- un dossier annulé redevient Confirmée, sans être montré : pas de débit tant
  que le séjour n’est pas montré ;
- le montant lu dans le mail n’est jamais écrit comme prix vendu.

« Créer un dossier » reste un clic, pour un vrai second voyage.

## Relancer une ligne déjà parsée

Sans re-télécharger Gmail (ne pas remettre `received`) et **sans rattacher** :

- Cron : `rematchStoredEmailIngest` rafraîchit les suggestions sur `parsed` / `matched`
- Staff : `POST /api/admin/email-ingest/[id]` `{ "action": "rematch" }`

## Fichiers

| Rôle | Path |
|------|------|
| Orchestration (parse + suggestions, création auto après un reçu) | `lib/crm/email-ingest.ts` |
| Création auto, et apply d’un séjour unique (jamais invite, jamais publish) | `lib/crm/email-ingest-create.ts`, `email-ingest-create-run.ts` |
| Match + décision apply/create/review | `lib/crm/email-match.ts` |
| Client Gmail (labels, history, watch) | `lib/crm/gmail.ts` |
| Parse message / pièces | `lib/crm/gmail-parse.ts` |
| Persist (`applyExtractToBooking` / `applyReplacementToBooking` / `applyCancellationToBooking` / `persistNewBookingFromExtract`) | `lib/crm/ingest-booking.ts` |
| Cycle de vie des cartes (`active` / `superseded` / `cancelled`) | `lib/crm/item-lifecycle.ts` |
| Push labels | `app/api/webhooks/gmail/route.ts` |
| Cron capture + parse + rematch | `app/api/cron/gmail-ingest/route.ts` |
| Renouvellement watch | `app/api/cron/gmail-watch-renew/route.ts` |
| Tests règles | `lib/crm/email-match.test.ts` |
| Inbox relecture | `components/admin/EmailIngestInbox.tsx` |

## Vérifier

```bash
npx tsx --test lib/crm/email-ingest-policy.test.ts lib/crm/email-ingest-create.test.ts lib/crm/email-match.test.ts lib/crm/gmail-parse.test.ts lib/crm/item-lifecycle.test.ts lib/crm/item-match.test.ts
npx tsc --noEmit
```

Couvrir : réf. exacte, dates+dest+nom flou, deux voyages égaux, *Albilla* / *Albilila*.
`lib/crm/email-ingest-policy.test.ts` interdit apply, annulation et invitation dans le parse et le rematch. Seul `email-ingest-create-run.ts` applique un séjour unique. La création auto n’est appelée qu’une fois, après le parse d’un reçu.
Ne pas rejouer un vrai mail prod. Echo PII interdit dans PR / logs.

## Hôtel Little Emperors

`included` = **toutes** les lignes imprimées sous « LE Benefits » ou « Little Emperors Benefits », en français. Pas seulement le petit-déjeuner. « Fourth Night Free » juste avant le bloc = nuit offerte. L’astérisque se rattache au bénéfice étoilé. Pas l’annulation, pas le dépôt. Même parseur que le PDF (`parseLittleEmperorsIncluded`).

Contacts de l’hôtel : catalogue Little Emperors à l’affichage, pas l’adresse du mail ni le correspondant imprimé. Milano = Milan (`CITY_ALIASES`). Skill `travelba-carnet`.

## Interdits

- Rattachement, remplacement ou annulation **ambigu** sans clic agence (deux séjours, deux cartes, annulation sans référence)
- Créer un dossier (ou un client) depuis un mail d’annulation, un devis, ou sans carte ni date
- Créer un deuxième dossier quand le client a déjà un séjour vers la même destination
- Écrire le montant du mail comme prix vendu sur une carte déjà tarifée
- Inviter le client, ou publier le carnet, dans la création automatique
- Publier le carnet / `visible_to_client=true`
- Retirer `received` ou `error` de la file `/admin/emails`
- Inventer horaires, inclus, nets, e-mail client agence
- Réduire un bloc Benefits au seul petit-déjeuner
- Traiter ce flux comme le dropzone (pas de « Enregistrer » obligatoire)
- Dupliquer l’upsert des cartes
- **Ne pas merger** sans go-ahead explicite de Benjamin
