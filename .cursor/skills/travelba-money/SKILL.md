---
name: travelba-money
description: >-
  Travelba ledger, encours, Stripe SetupIntent (no PAN), Revolut inbox match.
  Use when touching crm_transactions, crm_customer_balances, Revolut sync,
  Stripe webhooks, payment methods, or client Transactions page.
---

# Travelba — argent

Le CRM tient un **grand livre**. Carte, Apple Pay et prélèvement SEPA passent par Stripe. Les virements arrivent sur Revolut Business et se rapprochent dans l’inbox.

## Encours

Vue `crm_customer_balances` = somme crédits `posted` − débits `posted` (par devise).

- Positif = avoir / **crédit disponible**
- Négatif = reste à payer
- Le grand livre stocke le signe. Dans **Transactions**, la carte d’origine affiche ce signe (encours, barre, mouvements). Le « % réglé » compte tous les débits postés. Le règlement Société / Particulier se place sous la barre, sans remplacer la carte ni le solde signé.

**Commission 10 %** (`AGENCY_FEE_RATE`, case `agency_commission` sur le voyage, défaut **false**) : si cochée, `syncAgencyCommission` poste un débit `kind=adjustment` `external_id=booking:{id}:agency-commission`, libellé « Frais d’agence 10 % », égal à 10 % du **montant du séjour** (somme des prix vendus). Elle s’ajoute aux dépenses : elle ne retire pas le montant global du séjour et n’entre pas dans le total stocké. Le prix affiché du séjour l’ajoute, avec les dépenses libres. Elle reste hors carnet. Postée seulement si le dossier est montré au client et confirmé, en voyage ou terminé. Décocher ou annuler → `void` (ou suppression des débits à l’annulation). Le virement Revolut est crédité **en entier** — plus de débit `{revolut_id}:agency-fee` au rapprochement. Les lignes historiques restent. Le crédit disponible est l’avoir positif du grand livre.

Ledger visible côté client (`/mon-compte/transactions`) : lignes `posted` seulement (RLS). L’agence ouvre **la même lecture** depuis `/admin/transactions/client/[id]` (fiche client « Transactions du client », nom du client ou bouton « Vue client » dans `/admin/transactions`). Les débits de dossier y apparaissent ; la liste agence reste limitée aux virements crédit.

**Société** : si `company_role=member`, le client ne voit que les **débits** de ses dossiers (pas les crédits / encours société). `company_role=admin` (ou null) = grand livre complet de son wallet. Débits résa → `billing_customer_id` du dossier.

PDF relevé = bouton **Demander un relevé** (`mailto:`), **pas** de génération PDF auto ni d’envoi mail automatique.

## Débit réservation

`syncBookingDebit` (`lib/crm/bookings.ts`) :

- Le grand livre client liste les **dépenses** (carte, frais de billeterie, chauffeur), pas la ligne « Réservation … ». Sous chaque dépense liée à un dossier : « Dans le cadre de {titre} ». Le montant global du séjour (`external_id` null) est retiré dès qu’une **carte** du même dossier est postée (`dropCoveredStayRollup`). Le frais de billeterie, la commission 10 % et la dépense libre ne le retirent pas. Le « % réglé » compte **tous** les débits postés du wallet, y compris un séjour encore au livre : la liste peut masquer ce séjour, la barre non.
- Crée / met à jour un débit `kind=booking` si le séjour est **montré au client** (`visible_to_client`) **et** statut `confirmed` \| `travelling` \| `completed`, `total_amount > 0` **et** `include_in_ledger` (défaut **true**), seulement tant qu’aucune dépense du dossier n’est au livre. Confirmée + Enregistrer pendant que le séjour est caché : **pas** de débit. Un devis montré (`quoted`) ne débite pas. Cacher le séjour retire le débit ouvert.
- `cancelled` → supprime les **débits** `booking_id` (plus au grand livre). Les crédits et les virements Revolut restent rapprochés.
- `total_amount <= 0` **ou** `include_in_ledger=false` alors qu’un débit ouvert existe → `void` ce débit seulement
- Suppression du dossier → le même nettoyage des débits, puis delete de la réservation
- `draft` / `quoted` → pas de débit
- Case admin « Inclure dans les transactions » à côté du montant du séjour. Décochez = prix carnet sans impacter l’encours.
- **Le client règle ce séjour** (`client_settles_stay`, défaut **false**) : l’hôtel est payé sur la carte du client, l’argent ne passe pas par l’agence. Le montant du séjour et les débits des cartes qui le composent (hôtel, vol, etc.) passent en `void`, même si « Inclure dans les transactions » est coché. Ils disparaissent de `/mon-compte/transactions` et de `/admin/transactions/client/[id]`. Le prix reste au carnet. Aucune ligne « réglé sur votre carte ». Restent au livre : frais d’agence 10 % si la case est cochée, frais de billeterie, dépenses libres, et extras (chauffeur, VIP Airport, visa, enregistrement) seulement s’ils sont inclus. Pas d’encaissement Stripe.
- **Total séjour stocké** (`total_amount`) = **toujours** la somme des prix vendus des cartes (`item.amount` ; **vol** = unitaire × `details.ticket_count`, **une fois** pour l’aller-retour, chaque vol s’il est aller simple). Pas de saisie séparée, pas la somme des montants PDF. Carte sans prix = 0. `syncBookingTotalFromItems` à chaque enregistrement de dossier et à chaque POST/PATCH/DELETE carte. Chauffeur / greeter et frais billeterie (25 € par passager) **hors** ce total stocké. Le **prix affiché** « Montant du séjour » (réservation client, liste client, liste agence, dossier) ajoute frais d’agence 10 %, frais de billeterie et dépenses libres. Ce chiffre est celui du règlement quand les frais suivent le séjour. On ne réécrit pas ces montants dans `total_amount` : l’assiette de la commission et le débit séjour resteraient faux.
- Carte (`item.amount`) : case **Inclure dans les transactions** (`include_in_ledger`, défaut **false**). Si cochée, débit `kind=booking` `external_id=booking:{id}:item:{itemId}`. Indépendant du montant du séjour — décochez le séjour pour ne pas compter deux fois. Recocher après un `void` **réactive** la même ligne (unique `external_id`) ; ne pas réinsérer. Libellé hôtel = nom d’établissement. Index unique : **un** débit séjour (`external_id` null), **plusieurs** cartes.
- **Dépense libre** (`kind=expense`) : bloc **Dépenses** du dossier, libellé + montant. Absente de l’itinéraire, du calendrier et du total stocké. Elle entre dans le prix affiché du séjour. `include_in_ledger` forcé. Débit `external_id=booking:{id}:expense:{itemId}`. Elle **ne retire pas** le montant global du séjour. Postée seulement si le dossier est confirmé, en voyage ou terminé. L’import PDF ne crée pas ce kind. Sur la réservation client publiée, la section **Dépenses** (lecture seule, sous le montant du séjour) liste ces lignes et les frais d’agence 10 % si la case est cochée. Le séjour publié suffit : le drapeau `visible_to_client` de la carte ne les masque pas.
- À l’import, `item.amount` reste null (le PDF va dans `document_amount`). Le montant du séjour reste 0 tant que l’agent n’a pas saisi le prix vendu de chaque carte. `sellingTotalFromExtract` = cette somme, jamais le total PDF.
- Import `document_status=confirmed` : `bookingStatusFromExtract` → **confirmed** (même si `from-ingest` envoie `draft`). Toujours `visible_to_client=false` jusqu’à **Montrer au client** : le débit part à ce geste, pas à l’enregistrement.
- `customer_id` du débit = `booking.billing_customer_id` (payeur / wallet), pas forcément le voyageur
- **Plusieurs sociétés** (`crm_billing_companies`) : attribution `billing_company_id` sur le séjour, la dépense et la ligne du livre. La vue `crm_customer_balances` reste un seul solde (crédits − débits `posted`). La répartition Société / Particulier est une lecture de ce solde, pas un second wallet. Transactions : libellé société **seulement** si le compte en a au moins deux. Une seule société → le nom suit « Société » dans la répartition.
- `syncTicketingFee` : **25 € par passager** du dossier (`crm_booking_travelers`), dès qu’il y a un vol **et** que le séjour est montré. Paris, 4 billets = 100 €. Plusieurs segments du même voyageur ne multiplient pas. Sans voyageur nommé : 25 €. Débit `external_id=booking:{id}:ticketing-fee`, libellé « Frais de billeterie (4 billets) ». Il s’ajoute au séjour, il ne le remplace pas. Void si plus de vol ou dossier annulé.
- **Commission 10 %** : case du dossier, pas du virement. Voir encours ci-dessus. Assiette = `total_amount`, hors frais de billeterie, extras et dépenses libres.

Ajustements / remboursements : lignes manuelles admin `kind=adjustment|refund`.

## Stripe — règlement dans Transactions

- Le règlement est dans **Transactions** (`/mon-compte/transactions`), sous l’encours, libellé **Régler**. Le même bloc est en haut de la réservation. Carte, Apple Pay, prélèvement SEPA, virement.
- Le dossier a `payer_kind` : `company` (société, défaut = première `crm_billing_companies`) ou `personal` (particulier). L’agence le choisit dans Règlement pour ranger le débit. Le client ne choisit pas la société.
- `fees_follow_stay` (défaut true) : frais d’agence, frais de billeterie (25 € par passager dès qu’un vol est confirmé) et dépenses suivent la facture du séjour. L’hôtel réglé par le client n’est pas un encaissement.
- Part société : prélèvement SEPA et virement, en euros. Part particulier : carte, Apple Pay et virement, sans prélèvement. Hors euros : carte et Apple Pay seulement. Le collaborateur `member` ne règle pas l’encours : il voit ses frais, le compte qui porte le wallet paie. Les moyens tiennent sur une ligne de pastilles ; le formulaire s’ouvre seulement pour le moyen choisi.
- Le grand livre reste un seul encours. Chaque règlement crédite le même wallet. `payer_kind` sur la ligne de crédit range la part, sans créer un second solde.
- `POST /api/client/ledger/pay` reçoit `payerKind` `company` ou `personal`. Le montant vient du serveur (la part due). `POST /api/client/bookings/[id]/pay` répond 410. Carte, Apple Pay et prélèvement SEPA créent un PaymentIntent (moyens dynamiques, `excluded_payment_method_types`). Pas de `payment_method_types`. Pas de PAN / CVC. Apple Pay = portefeuille Stripe. Le libellé du crédit porte la part.
- Virement = compte **Revolut Business** (IBAN SEPA du compte euros actif), pas Stripe `customer_balance`. La route ne crée pas de PaymentIntent. Elle renvoie IBAN, BIC, titulaire et le **nom du client** comme référence. Jamais d’IBAN dans les logs. Plusieurs IBAN euros distincts → le virement reste fermé.
- Le crédit du virement passe par l’inbox Revolut (sync / rapprochement), pas par le webhook Stripe.
- Webhook `payment_intent.succeeded` → crédit `source=stripe`, `external_id` = id du PaymentIntent, wallet = `crm_customer_id` des métadonnées. Un règlement d’encours n’a pas de dossier : `payer_kind` range la part. Un `pay_method=revolut` ne crédite pas.
- SetupIntent (`/api/client/stripe/setup-intent`) + `setup_intent.succeeded` → `crm_payment_methods`. `payment_method.detached` → delete.
- Pas de page cartes : `/mon-compte/profil/paiement` reste la facturation.

`getStripe()` absent → webhook 503. Le carnet, le grand livre et Revolut continuent. Le bouton de règlement indique que le moyen n’est pas ouvert.

## Revolut

Flux : API Business → `crm_revolut_transactions` (`unmatched`, **crédits seulement**) → matching → écriture `crm_transactions` crédit si **un seul** hit certain. Sinon inbox / fiche client : **Valider** (proposition pré-sélectionnée) ou **Refuser**.

- `POST /api/admin/revolut/[id]` `{ customer_id }` | `{ action: "ignore"|"refuse" }`
- Déjà `matched` → 400
- Sync importe **uniquement les crédits** (topups / virements reçus). Ignore sorties, Stripe, cartes, charges. `shouldIngestRevolutForRapprochement`.
- Cron `/api/cron/revolut-sync` (15 min) + webhook : upsert puis `autoMatchUnmatchedRevolut` (crédits)
- UI `/admin/revolut` : inbox crédits ; badge = unmatched **credit**. Titre = **expéditeur** (`Payment from …` / contrepartie), ligne suivante = **désignation** (`reference`). Jamais coller la désignation à la place du nom.
- **Choisir un client** ouvre `CustomerPickDialog` (recherche nom / société / e-mail / téléphone, propositions en tête). Ne plus utiliser un `<select>` natif pour le rapprochement.
- Prod : `REVOLUT_SANDBOX=0`, URL `https://b2b.revolut.com`

**Ne pas** imputer si plusieurs clients matchent ou score partiel — laisser `unmatched` pour Valider/Refuser.

## Saisie manuelle

Admin `/admin/transactions` (et fiche client) : **uniquement les virements crédit** (`kind=transfer`, `direction=credit`). Pas de débits résa, frais billeterie ni commission 10 % dans cette liste — ils restent sur le dossier et `/mon-compte/transactions`. Saisie manuelle = crédit seulement. Pas de SQL collé dans l’UI.

## PCI / PII

Logs : pas de body Stripe brut, pas d’IBAN complet. Last4 OK. Skill `travelba-go-live` pour les webhooks live.
