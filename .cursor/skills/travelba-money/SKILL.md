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

**Commission 10 %** (`AGENCY_FEE_RATE`, case `agency_commission` sur le voyage, défaut **false**) : si cochée, `syncAgencyCommission` poste un débit `kind=adjustment` `external_id=booking:{id}:agency-commission`, libellé « Frais d’agence 10 % », égal à 10 % du **montant du séjour** (somme des prix vendus). Elle s’ajoute aux dépenses : elle ne retire pas le montant global du séjour et n’entre pas dans le total stocké. Le prix affiché du séjour l’ajoute, avec les dépenses libres. Elle reste hors carnet. Postée seulement si le dossier est confirmé, en voyage ou terminé. Décocher ou annuler → `void` (ou suppression des débits à l’annulation). Le virement Revolut est crédité **en entier** — plus de débit `{revolut_id}:agency-fee` au rapprochement. Les lignes historiques restent. Le crédit disponible est l’avoir positif du grand livre.

Ledger visible côté client (`/mon-compte/transactions`) : lignes `posted` seulement (RLS). L’agence ouvre **la même lecture** depuis `/admin/transactions/client/[id]` (fiche client « Transactions du client », nom du client ou bouton « Vue client » dans `/admin/transactions`). Les débits de dossier y apparaissent ; la liste agence reste limitée aux virements crédit.

**Société** : si `company_role=member`, le client ne voit que les **débits** de ses dossiers (pas les crédits / encours société). `company_role=admin` (ou null) = grand livre complet de son wallet. Débits résa → `billing_customer_id` du dossier.

PDF relevé = bouton **Demander un relevé** (`mailto:`), **pas** de génération PDF auto ni d’envoi mail automatique.

## Débit réservation

`syncBookingDebit` (`lib/crm/bookings.ts`) :

- Le grand livre client liste les **dépenses** (carte, frais de billeterie, chauffeur), pas la ligne « Réservation … ». Sous chaque dépense liée à un dossier : « Dans le cadre de {titre} ». Le montant global du séjour (`external_id` null) est retiré dès qu’une dépense du même dossier est postée (`dropCoveredStayRollup`).
- Crée / met à jour un débit `kind=booking` si statut `confirmed` \| `travelling` \| `completed`, `total_amount > 0` **et** `include_in_ledger` (défaut **true**), seulement tant qu’aucune dépense du dossier n’est au livre
- `cancelled` → supprime les **débits** `booking_id` (plus au grand livre). Les crédits et les virements Revolut restent rapprochés.
- `total_amount <= 0` **ou** `include_in_ledger=false` alors qu’un débit ouvert existe → `void` ce débit seulement
- Suppression du dossier → le même nettoyage des débits, puis delete de la réservation
- `draft` / `quoted` → pas de débit
- Case admin « Inclure dans les transactions » à côté du montant du séjour. Décochez = prix carnet sans impacter l’encours.
- **Le client règle ce séjour** (`client_settles_stay`, défaut **false**) : l’hôtel est payé sur la carte du client, l’argent ne passe pas par l’agence. Le montant du séjour et les débits des cartes qui le composent (hôtel, vol, etc.) passent en `void`, même si « Inclure dans les transactions » est coché. Ils disparaissent de `/mon-compte/transactions` et de `/admin/transactions/client/[id]`. Le prix reste au carnet. Aucune ligne « réglé sur votre carte ». Restent au livre : frais d’agence 10 % si la case est cochée, frais de billeterie, dépenses libres, et extras (chauffeur, VIP Airport, visa, enregistrement) seulement s’ils sont inclus. Pas d’encaissement Stripe.
- **Total séjour stocké** (`total_amount`) = **toujours** la somme des prix vendus des cartes (`item.amount` ; **vol** = unitaire × `details.ticket_count`, **une fois** pour l’aller-retour, chaque vol s’il est aller simple). Pas de saisie séparée, pas la somme des montants PDF. Carte sans prix = 0. `syncBookingTotalFromItems` à chaque enregistrement de dossier et à chaque POST/PATCH/DELETE carte. Chauffeur / greeter et frais billeterie 25 € **hors** ce total. Le **prix affiché** « Montant du séjour » (réservation client, liste, dossier agence) ajoute la section Dépenses : frais d’agence 10 % et dépenses libres. On ne réécrit pas ces montants dans `total_amount` : l’assiette de la commission et le débit séjour resteraient faux.
- Carte (`item.amount`) : case **Inclure dans les transactions** (`include_in_ledger`, défaut **false**). Si cochée, débit `kind=booking` `external_id=booking:{id}:item:{itemId}`. Indépendant du montant du séjour — décochez le séjour pour ne pas compter deux fois. Recocher après un `void` **réactive** la même ligne (unique `external_id`) ; ne pas réinsérer. Libellé hôtel = nom d’établissement. Index unique : **un** débit séjour (`external_id` null), **plusieurs** cartes.
- **Dépense libre** (`kind=expense`) : bloc **Dépenses** du dossier, libellé + montant. Absente de l’itinéraire, du calendrier et du total stocké. Elle entre dans le prix affiché du séjour. `include_in_ledger` forcé. Débit `external_id=booking:{id}:expense:{itemId}`. Elle **ne retire pas** le montant global du séjour. Postée seulement si le dossier est confirmé, en voyage ou terminé. L’import PDF ne crée pas ce kind. Sur la réservation client publiée, la section **Dépenses** (lecture seule, sous le montant du séjour) liste ces lignes et les frais d’agence 10 % si la case est cochée. Le séjour publié suffit : le drapeau `visible_to_client` de la carte ne les masque pas.
- À l’import, `item.amount` reste null (le PDF va dans `document_amount`). Le montant du séjour reste 0 tant que l’agent n’a pas saisi le prix vendu de chaque carte. `sellingTotalFromExtract` = cette somme, jamais le total PDF.
- Import `document_status=confirmed` : `bookingStatusFromExtract` → **confirmed** (même si `from-ingest` envoie `draft`) pour que le débit parte. Toujours `visible_to_client=false` jusqu’à Publier.
- `customer_id` du débit = `booking.billing_customer_id` (payeur / wallet), pas forcément le voyageur
- **Plusieurs sociétés** (`crm_billing_companies`) : attribution `billing_company_id` sur le séjour, la dépense et la ligne du livre. L’encours **ne se découpe pas** (la vue `crm_customer_balances` reste crédits − débits `posted`). Transactions : libellé société **seulement** si le compte en a au moins deux. Une seule société → pas de précision.
- `syncTicketingFee` : dès qu’il y a un vol, débit **25 € une fois** (`external_id=booking:{id}:ticketing-fee`), pas par billet ni par segment. Void si plus de vol ou dossier annulé.
- **Commission 10 %** : case du dossier, pas du virement. Voir encours ci-dessus. Assiette = `total_amount`, hors frais de billeterie, extras et dépenses libres.

Ajustements / remboursements : lignes manuelles admin `kind=adjustment|refund`.

## Stripe — règlement du séjour

- Le dossier a `payer_kind` : `company` (société, défaut = première `crm_billing_companies`) ou `personal` (particulier). L’agence le choisit dans Règlement. Le client ne choisit pas la société.
- Espace client, sous le montant : société → prélèvement SEPA et virement (le collaborateur `member` ne paie pas). Particulier → carte, Apple Pay, prélèvement SEPA, virement. Hors euros : carte et Apple Pay seulement.
- `POST /api/client/bookings/[id]/pay` crée un PaymentIntent (moyens dynamiques, `excluded_payment_method_types`). Pas de `payment_method_types`. Pas de PAN / CVC. Apple Pay = portefeuille Stripe. Virement = `customer_balance` / `eu_bank_transfer`, IBAN affiché au client, jamais dans les logs.
- Webhook `payment_intent.succeeded` → crédit `source=stripe`, `external_id` = id du PaymentIntent, wallet = `billing_customer_id`.
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
