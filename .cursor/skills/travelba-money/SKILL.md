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

**Frais d’agence 10 %** (`AGENCY_FEE_RATE`) : à chaque crédit Revolut (`applyRevolutToCustomer`), poster un débit `kind=adjustment` `external_id={revolut_id}:agency-fee` — le crédit disponible = 90 % du versement. Afficher clairement « crédit disponible » / « frais 10 % » côté admin et `/mon-compte`.

Ledger visible côté client (`/mon-compte/transactions`) : lignes `posted` seulement (RLS).

**Société** : si `company_role=member`, le client ne voit que les **débits** de ses dossiers (pas les crédits / encours société). `company_role=admin` (ou null) = grand livre complet de son wallet. Débits résa → `billing_customer_id` du dossier.

PDF relevé = bouton **Demander un relevé** (`mailto:`), **pas** de génération PDF auto ni d’envoi mail automatique.

## Débit réservation

`syncBookingDebit` (`lib/crm/bookings.ts`) :

- Crée / met à jour un débit `kind=booking` si statut `confirmed` \| `travelling` \| `completed`, `total_amount > 0` **et** `include_in_ledger` (défaut **true**)
- `cancelled`, `total_amount <= 0` **ou** `include_in_ledger=false` alors qu’un débit ouvert existe → `void`
- `draft` / `quoted` → pas de débit
- Case admin « Inclure dans les transactions » à côté du montant du séjour. Décochez = prix carnet sans impacter l’encours.
- **Total séjour** = **toujours** la somme des prix vendus des cartes (`item.amount` ; **vol** = unitaire × `details.ticket_count`). Pas de saisie séparée, pas la somme des montants PDF. Carte sans prix = 0. `syncBookingTotalFromItems` à chaque enregistrement de dossier et à chaque POST/PATCH/DELETE carte. Chauffeur / greeter et frais billeterie 25 € **hors** ce total.
- Carte (`item.amount`) : case **Inclure dans les transactions** (`include_in_ledger`, défaut **false**). Si cochée, débit `kind=booking` `external_id=booking:{id}:item:{itemId}`. Indépendant du montant du séjour — décochez le séjour pour ne pas compter deux fois. Recocher après un `void` **réactive** la même ligne (unique `external_id`) ; ne pas réinsérer. Libellé hôtel = nom d’établissement. Index unique : **un** débit séjour (`external_id` null), **plusieurs** cartes.
- À l’import, `item.amount` reste null (le PDF va dans `document_amount`). Le montant du séjour reste 0 tant que l’agent n’a pas saisi le prix vendu de chaque carte. `sellingTotalFromExtract` = cette somme, jamais le total PDF.
- Import `document_status=confirmed` : `bookingStatusFromExtract` → **confirmed** (même si `from-ingest` envoie `draft`) pour que le débit parte. Toujours `visible_to_client=false` jusqu’à Publier.
- `customer_id` du débit = `booking.billing_customer_id` (payeur / société), pas forcément le voyageur
- `syncTicketingFee` : dès qu’il y a un vol, débit **25 € × passagers** (`external_id=booking:{id}:ticketing-fee`), void si plus de vol ou dossier annulé. 1 passager = 1 billet même avec plusieurs segments.

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

Admin `/admin/transactions` (et fiche client) : **uniquement les virements crédit** (`kind=transfer`, `direction=credit`). Pas de débits résa, frais billeterie ni frais d’agence 10 % dans cette liste — ils restent sur le dossier et `/mon-compte/transactions`. Saisie manuelle = crédit seulement. Pas de SQL collé dans l’UI.

## PCI / PII

Logs : pas de body Stripe brut, pas d’IBAN complet. Last4 OK. Skill `travelba-go-live` pour les webhooks live.
