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
- `cancelled` → `void` le débit
- `draft` / `quoted` → pas de débit
- Le total = **prix vendu agent**, pas le net fournisseur

Ajustements / remboursements : lignes manuelles admin `kind=adjustment|refund`.

## Stripe — références seulement

- SetupIntent (`/api/client/stripe/setup-intent`) + webhook `setup_intent.succeeded` → upsert `crm_payment_methods` (`stripe_payment_method_id`, brand, last4, exp).
- `payment_method.detached` → delete la ligne.
- **Interdit** : PAN, CVC, `card.number`, Checkout Session d’encaissement, PaymentIntent capture dans ce CRM.
- UI client cartes **retirée** : `/mon-compte/profil/paiement` redirect facturation. Ne pas recréer un wallet carte sans décision.

`getStripe()` absent → webhook 503, ne pas crasher le reste du CRM. UI cartes fermée : 503 live n’empêche ni carnet, ni ledger manuel, ni rapprochement Revolut.

## Revolut

Flux : API Business → `crm_revolut_transactions` (`unmatched`) → agent choisit le client → insert `crm_transactions` crédit `source=revolut` + status `matched`.

- `POST /api/admin/revolut/[id]` `{ customer_id }` ou `{ action: "ignore" }`
- Déjà `matched` → 400
- Cron `/api/cron/revolut-sync` (15 min) + OAuth tokens dans `crm_integrations`
- Prod : `REVOLUT_SANDBOX=0`, URL `https://b2b.revolut.com`
- Badge nav admin = count `unmatched`

**Jamais** créditer depuis le cron / webhook sans le POST agent.

## Saisie manuelle

Admin `/admin/transactions` peut poster un crédit/débit. Toujours `customer_id`, `direction`, `amount`, `currency`, `status`. Pas de SQL collé dans l’UI.

## PCI / PII

Logs : pas de body Stripe brut, pas d’IBAN complet. Last4 OK. Skill `travelba-go-live` pour les webhooks live.
