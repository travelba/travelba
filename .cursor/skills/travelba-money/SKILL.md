---
name: travelba-money
description: >-
  Travelba ledger, encours, Stripe SetupIntent (no PAN), Revolut inbox match.
  Use when touching crm_transactions, crm_customer_balances, Revolut sync,
  Stripe webhooks, payment methods, or client Transactions page.
---

# Travelba — argent

Le CRM n’encaisse pas de carte. Il tient un **grand livre** et range les virements.

## Encours

Vue `crm_customer_balances` = somme crédits `posted` − débits `posted` (par devise).

- Positif = avoir / **crédit disponible**
- Négatif = reste à payer
- Afficher le montant **avec le signe**, pas un libellé marketing « solde à régulariser » qui inverse

**Commission 10 %** (`AGENCY_FEE_RATE`, case `agency_commission` sur le voyage, défaut **false**) : si cochée, ou si `fee_mode=percent`, `syncAgencyCommission` poste un débit `kind=adjustment` `external_id=booking:{id}:agency-commission`, libellé « Frais d’agence 10 % », égal à 10 % du **montant du séjour** (somme des prix vendus). Elle s’ajoute aux dépenses : elle ne retire pas le montant global du séjour et n’entre pas dans le total stocké. Le prix affiché du séjour l’ajoute. En mode `percent`, les dépenses libres n’y entrent pas. Elle reste hors carnet. Postée seulement si le dossier est confirmé, en voyage ou terminé. Mode `carte`, décocher ou annuler → `void` (ou suppression des débits à l’annulation). Le virement Revolut est crédité **en entier** — plus de débit `{revolut_id}:agency-fee` au rapprochement. Les lignes historiques restent. Le crédit disponible est l’avoir positif du grand livre.

Ledger visible côté client (`/mon-compte/transactions`) : lignes `posted` seulement (RLS). L’agence ouvre **la même lecture** depuis `/admin/transactions/client/[id]` (fiche client « Transactions du client », nom du client ou bouton « Vue client » dans `/admin/transactions`). Les débits de dossier y apparaissent ; la liste agence reste limitée aux virements crédit.

**Société** : si `company_role=member`, le client ne voit que les **débits** de ses dossiers (pas les crédits / encours société). `company_role=admin` (ou null) = grand livre complet de son wallet. Débits résa → `billing_customer_id` du dossier.

PDF relevé = bouton **Demander un relevé** (`mailto:`), **pas** de génération PDF auto ni d’envoi mail automatique.

## Débit réservation

`syncBookingDebit` (`lib/crm/bookings.ts`) :

- Le grand livre client liste les **dépenses** (carte, frais de billeterie, chauffeur), pas la ligne « Réservation … ». Sous chaque dépense liée à un dossier : « Dans le cadre de {titre} ». Le montant global du séjour (`external_id` null) est retiré dès qu’une carte du dossier est postée (`dropCoveredStayRollup`). L’ancienne billeterie auto (`fee_mode` null) le retire aussi. Commission, dépenses libres, transfert 15 € et hébergement 20 € ne le retirent pas.
- Crée / met à jour un débit `kind=booking` si statut `confirmed` \| `travelling` \| `completed`, `total_amount > 0` **et** `include_in_ledger` (défaut **true**), seulement tant qu’aucune dépense du dossier n’est au livre
- `cancelled` → supprime les **débits** `booking_id` (plus au grand livre). Les crédits et les virements Revolut restent rapprochés.
- `total_amount <= 0` **ou** `include_in_ledger=false` alors qu’un débit ouvert existe → `void` ce débit seulement
- Suppression du dossier → le même nettoyage des débits, puis delete de la réservation
- `draft` / `quoted` → pas de débit
- Case admin « Inclure dans les transactions » à côté du montant du séjour. Décochez = prix carnet sans impacter l’encours.
- **Le client règle ce séjour** (`client_settles_stay`, défaut **false**) : l’hôtel est payé sur la carte du client, l’argent ne passe pas par l’agence. Le montant du séjour et les débits des cartes qui le composent (hôtel, vol, etc.) passent en `void`, même si « Inclure dans les transactions » est coché. Ils disparaissent de `/mon-compte/transactions` et de `/admin/transactions/client/[id]`. Le prix reste au carnet. Aucune ligne « réglé sur votre carte ». Restent au livre : frais d’agence 10 % si la case est cochée, frais de billeterie, dépenses libres, et extras (chauffeur, VIP Airport, visa, enregistrement) seulement s’ils sont inclus. Pas d’encaissement Stripe.
- **Total séjour stocké** (`total_amount`) = **toujours** la somme des prix vendus des cartes (`item.amount` ; **vol** = unitaire × `details.ticket_count`). Pas de saisie séparée, pas la somme des montants PDF. Carte sans prix = 0. `syncBookingTotalFromItems` à chaque enregistrement de dossier et à chaque POST/PATCH/DELETE carte. Chauffeur / greeter et frais billeterie 25 € **hors** ce total. Le **prix affiché** « Montant du séjour » (réservation client, liste, dossier agence) ajoute la section Dépenses : frais d’agence 10 % et dépenses libres. On ne réécrit pas ces montants dans `total_amount` : l’assiette de la commission et le débit séjour resteraient faux.
- Carte (`item.amount`) : case **Inclure dans les transactions** (`include_in_ledger`, défaut **false**). Si cochée, débit `kind=booking` `external_id=booking:{id}:item:{itemId}`. Indépendant du montant du séjour — décochez le séjour pour ne pas compter deux fois. Recocher après un `void` **réactive** la même ligne (unique `external_id`) ; ne pas réinsérer. Libellé hôtel = nom d’établissement. Index unique : **un** débit séjour (`external_id` null), **plusieurs** cartes.
- **Dépense libre** (`kind=expense`) : bloc **Dépenses** du dossier, libellé + montant, dans le mode **à la carte** (défaut « Frais divers »). Absente de l’itinéraire, du calendrier et du total stocké. Elle entre dans le prix affiché du séjour. `include_in_ledger` forcé, sauf si `fee_mode=percent` (le débit passe en `void`, la carte reste). Débit `external_id=booking:{id}:expense:{itemId}`. Elle **ne retire pas** le montant global du séjour. Postée seulement si le dossier est confirmé, en voyage ou terminé. L’import PDF ne crée pas ce kind. Sur la réservation client publiée, la section **Dépenses** (lecture seule, sous le montant du séjour) liste les frais actifs : 10 % **ou** les cases à la carte, puis ces lignes. Le séjour publié suffit : le drapeau `visible_to_client` de la carte ne les masque pas.
- À l’import, `item.amount` reste null (le PDF va dans `document_amount`). Le montant du séjour reste 0 tant que l’agent n’a pas saisi le prix vendu de chaque carte. `sellingTotalFromExtract` = cette somme, jamais le total PDF.
- Import `document_status=confirmed` : `bookingStatusFromExtract` → **confirmed** (même si `from-ingest` envoie `draft`) pour que le débit parte. Toujours `visible_to_client=false` jusqu’à Publier.
- `customer_id` du débit = `booking.billing_customer_id` (payeur / wallet), pas forcément le voyageur
- **Plusieurs sociétés** (`crm_billing_companies`) : attribution `billing_company_id` sur le séjour, la dépense et la ligne du livre. L’encours **ne se découpe pas** (la vue `crm_customer_balances` reste crédits − débits `posted`). Transactions : libellé société **seulement** si le compte en a au moins deux. Une seule société → pas de précision.
- `fee_mode` sur le dossier : `null` = ancien calcul (billeterie auto s’il y a un vol, commission si la case est cochée). `percent` = 10 % seul. `carte` = frais cochés, sans commission. Les deux modes ne se cumulent pas. Le premier choix dans Dépenses fige le mode.
- `syncTicketingFee` : si `fee_mode` est null, débit **25 € × passagers** dès qu’il y a un vol (`external_id=booking:{id}:ticketing-fee`), void si plus de vol ou dossier annulé. 1 passager = 1 billet même avec plusieurs segments. Si `fee_mode=carte`, le débit est **25 € × `ticketing_fee_qty`**, sans regarder les vols. Si `percent`, void.
- **Transfert** 15 € (`booking:{id}:transfer-fee`) et **hébergement** 20 € (`booking:{id}:lodging-fee`) : seulement si `fee_mode=carte` et la case est cochée. Ils s’ajoutent au séjour, ils ne retirent pas le montant global. La billeterie auto (`fee_mode` null) le retire encore.
- **Commission 10 %** : mode `percent` (ou case historique si `fee_mode` est null). Pas du virement. Voir encours ci-dessus. Assiette = `total_amount`, hors frais de billeterie, extras et dépenses libres. Mode `carte` → void.

Ajustements / remboursements : lignes manuelles admin `kind=adjustment|refund`.

## Stripe — références seulement

- SetupIntent (`/api/client/stripe/setup-intent`) + webhook `setup_intent.succeeded` → upsert `crm_payment_methods` (`stripe_payment_method_id`, brand, last4, exp).
- `payment_method.detached` → delete la ligne.
- **Interdit** : PAN, CVC, `card.number`, Checkout Session d’encaissement, PaymentIntent capture dans ce CRM.
- UI client cartes **retirée** : `/mon-compte/profil/paiement` redirect facturation. Ne pas recréer un wallet carte sans décision.

`getStripe()` absent → webhook 503, ne pas crasher le reste du CRM. UI cartes fermée : 503 live n’empêche ni carnet, ni ledger manuel, ni rapprochement Revolut.

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
