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

- Positif = avoir client
- Négatif = reste à payer
- Afficher le montant **avec le signe**, pas un libellé marketing « solde à régulariser » qui inverse

Ledger visible côté client (`/mon-compte/transactions`) : lignes `posted` seulement (RLS). PDF relevé = bouton **Demander un relevé** (`mailto:`), **pas** de génération PDF auto ni d’envoi mail automatique.

## Débit réservation

`syncBookingDebit` (`lib/crm/bookings.ts`) :

- Crée / met à jour un débit `kind=booking` si statut `confirmed` \| `travelling` \| `completed` et `total_amount > 0`
- `cancelled` **ou** `total_amount <= 0` alors qu’un débit ouvert existe → `void`
- `draft` / `quoted` → pas de débit
- Le total = **prix vendu** : à l’import, `sellingTotalFromExtract` (saisie agent ou somme des `document_amount`, 1 / fichier). Jamais le net fournisseur sur les cartes client (`item.amount` null).
- Import `document_status=confirmed` : `bookingStatusFromExtract` → **confirmed** (même si `from-ingest` envoie `draft`) pour que le débit parte. Toujours `visible_to_client=false` jusqu’à Publier.
- `syncTicketingFee` : dès qu’il y a un vol, débit **25 € × passagers** (`external_id=booking:{id}:ticketing-fee`), void si plus de vol ou dossier annulé. 1 passager = 1 billet même avec plusieurs segments.

Ajustements / remboursements : lignes manuelles admin `kind=adjustment|refund`.

## Stripe — références seulement

- SetupIntent (`/api/client/stripe/setup-intent`) + webhook `setup_intent.succeeded` → upsert `crm_payment_methods` (`stripe_payment_method_id`, brand, last4, exp).
- `payment_method.detached` → delete la ligne.
- **Interdit** : PAN, CVC, `card.number`, Checkout Session d’encaissement, PaymentIntent capture dans ce CRM.
- UI client cartes **retirée** : `/mon-compte/profil/paiement` redirect facturation. Ne pas recréer un wallet carte sans décision.

`getStripe()` absent → webhook 503, ne pas crasher le reste du CRM. UI cartes fermée : 503 live n’empêche ni carnet, ni ledger manuel, ni rapprochement Revolut.

## Revolut

Flux : API Business → `crm_revolut_transactions` (`unmatched`, `direction` credit|debit) → matching → écriture `crm_transactions` (crédit = revenu, débit = dépense) si **un seul** hit certain. Sinon inbox / fiche client : **Valider** (proposition pré-sélectionnée) ou **Refuser**.

- `POST /api/admin/revolut/[id]` `{ customer_id }` | `{ action: "ignore"|"refuse" }`
- Déjà `matched` → 400
- Sync importe topups/transferts entrants (revenus) et transferts sortants (dépenses) ; ignore Stripe / cartes / charges
- Cron `/api/cron/revolut-sync` (15 min) + webhook : upsert puis `autoMatchUnmatchedRevolut`
- UI `/admin/revolut` : filtres Tous / Revenus / Dépenses ; badge = count `unmatched`
- Prod : `REVOLUT_SANDBOX=0`, URL `https://b2b.revolut.com`

**Ne pas** imputer si plusieurs clients matchent ou score partiel — laisser `unmatched` pour Valider/Refuser.

## Saisie manuelle

Admin `/admin/transactions` peut poster un crédit/débit. Toujours `customer_id`, `direction`, `amount`, `currency`, `status`. Pas de SQL collé dans l’UI.

## PCI / PII

Logs : pas de body Stripe brut, pas d’IBAN complet. Last4 OK. Skill `travelba-go-live` pour les webhooks live.
