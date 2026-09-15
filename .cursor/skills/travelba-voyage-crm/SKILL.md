---
name: travelba-voyage-crm
description: >-
  Master map of Travelba CRM: clients, bookings, ledger, Stripe cards,
  Revolut credits, and the client portal. Use at the start of any Travelba
  admin or /mon-compte task.
---

# Travelba — carte CRM

## Routes

| Besoin | Où |
|--------|-----|
| Accueil client | `/mon-compte` |
| Réservations | `/mon-compte/reservations` |
| Profil / cartes / docs / compagnons | `/mon-compte/profil…` |
| Transactions | `/mon-compte/transactions` |
| Lien magique | `/connexion` |
| Back-office | `/admin` |

## Modèle

`crm_customers` → `crm_bookings` / `crm_travel_companions` / `crm_travel_documents` / `crm_transactions` / `crm_payment_methods`

Encours = vue `crm_customer_balances` : positif = avoir, négatif = reste à payer.

## Auth

- Client : OTP email (`signInWithOtp`) → `/auth/callback` lie `crm_customers.auth_user_id`
- Staff : mot de passe + ligne `crm_staff`
- Premier agent connecté bootstrap `crm_staff` si table vide

## Fichiers clés

| Rôle | Path |
|------|------|
| Types | `lib/crm/types.ts` |
| Auth staff/client | `lib/crm/auth.ts` |
| Proxy | `proxy.ts` |
| Schema | `supabase/migrations/` |
